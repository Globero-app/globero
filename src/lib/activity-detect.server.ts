/** Detección periódica de actividades nuevas y asignación al entreno/competición del día. */

/** Bloqueo simple (lease) para que dos ejecuciones del cron no se solapen. */
export async function acquireJobLock(admin: any, jobName: string, leaseSeconds: number): Promise<boolean> {
  const now = new Date();
  const until = new Date(now.getTime() + leaseSeconds * 1000).toISOString();
  const { data: existing } = await admin
    .from("job_runs")
    .select("job_name, locked_until, paused_until")
    .eq("job_name", jobName)
    .maybeSingle();

  if (existing) {
    if (existing.paused_until && new Date(existing.paused_until) > now) return false;
    if (new Date(existing.locked_until) > now) return false;
    const { data: upd } = await admin
      .from("job_runs")
      .update({ locked_until: until, last_run_at: now.toISOString() })
      .eq("job_name", jobName)
      .lt("locked_until", now.toISOString())
      .select("job_name");
    return !!(upd && upd.length);
  }
  const { error } = await admin
    .from("job_runs")
    .insert({ job_name: jobName, locked_until: until, last_run_at: now.toISOString() });
  return !error;
}

export async function releaseJobLock(admin: any, jobName: string, details?: unknown) {
  await admin
    .from("job_runs")
    .update({ locked_until: new Date().toISOString(), details: (details as any) ?? null })
    .eq("job_name", jobName);
}

/** Descarga las actividades nuevas de Intervals.icu (incremental según la última sincronizada). */
async function pullIntervals(admin: any, userId: string): Promise<number> {
  const { syncIntervalsActivities } = await import("./intervals-activities.server");
  const { data: last } = await admin
    .from("intervals_activities")
    .select("start_date")
    .eq("user_id", userId)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastTs = last?.start_date ? new Date(last.start_date).getTime() : 0;
  const days = lastTs ? Math.min(7, Math.max(1, Math.ceil((Date.now() - lastTs) / 86400000) + 1)) : 7;
  return syncIntervalsActivities(admin, userId, { days });
}

type DetectResult = { auto: number; asked: number };

/**
 * Revisa actividades de los últimos 2 días sin asignar:
 *  - alta confianza (duración ±20% y bici coincidente) → asigna y avisa
 *  - resto → una única notificación para que el usuario confirme en la app
 */
export async function detectAndAssign(admin: any, userId: string, todayISO: string): Promise<DetectResult> {
  const out: DetectResult = { auto: 0, asked: 0 };
  await pullIntervals(admin, userId);

  const sinceISO = new Date(Date.now() - 2 * 86400000).toISOString();
  const sinceDay = sinceISO.slice(0, 10);

  const [aRes, wRes, cRes, dRes] = await Promise.all([
    admin
      .from("intervals_activities")
      .select("id, name, type, distance, moving_time, start_date")
      .eq("user_id", userId)
      .gte("start_date", sinceISO)
      .order("start_date", { ascending: false }),
    admin
      .from("workouts")
      .select("id, training_type, bike_type, duration_minutes, status, plan, created_at")
      .eq("user_id", userId),
    admin
      .from("competitions")
      .select("id, name, date, type, race_feedback")
      .eq("user_id", userId)
      .gte("date", sinceDay),
    admin
      .from("daily_activities")
      .select("activity_id, match_notified_at, notification_sent")
      .eq("user_id", userId)
      .gte("date", sinceDay),
  ]);

  const activities: any[] = aRes.data ?? [];
  if (!activities.length) return out;

  const linked = new Set<string>();
  const workoutByActivity = new Map<string, any>();
  for (const w of (wRes.data ?? []) as any[]) {
    const id = (w.plan as any)?.strava_activity_id ?? (w.plan as any)?.intervals_activity_id;
    if (id) {
      linked.add(String(id));
      workoutByActivity.set(String(id), w);
    }
  }
  for (const c of (cRes.data ?? []) as any[]) {
    const id = (c.race_feedback as any)?.strava_activity_id;
    if (id) linked.add(String(id));
  }
  const notified = new Set(
    ((dRes.data ?? []) as any[]).filter((d) => d.match_notified_at).map((d) => String(d.activity_id)),
  );
  const feedbackAsked = new Set(
    ((dRes.data ?? []) as any[]).filter((d) => d.notification_sent).map((d) => String(d.activity_id)),
  );

  const { linkWorkoutActivity } = await import("./activity-link.server");
  const { notifyUser } = await import("./web-push.server");

  /** Pide RPE/sensaciones una sola vez por actividad. */
  const askFeedback = async (a: any) => {
    const actId = String(a.id);
    if (feedbackAsked.has(actId)) return;
    if (!String(a.type ?? "").toLowerCase().includes("ride")) return;
    const day = String(a.start_date).slice(0, 10);
    await admin.from("daily_activities").upsert(
      { user_id: userId, activity_id: actId, date: day, notification_sent: true },
      { onConflict: "user_id,activity_id" },
    );
    feedbackAsked.add(actId);
    await notifyUser(userId, {
      title: "¡Entrenamiento detectado! 🚴‍♂️",
      body: "¿Cómo te has sentido hoy? Pulsa para evaluar tu esfuerzo.",
      tag: `activity-feedback-${actId}`,
      url: `/?screen=feedback&activity_id=${encodeURIComponent(actId)}`,
      requireInteraction: true,
    });
  };

  for (const a of activities) {
    const actId = String(a.id);
    if (linked.has(actId)) {
      // Ya asignada: solo se pide RPE/sensaciones. El informe se genera al valorarla.
      await askFeedback(a);
      continue;
    }
    const day = String(a.start_date).slice(0, 10);

    const comp = ((cRes.data ?? []) as any[]).find((c) => {
      const fb = (c.race_feedback as any) ?? {};
      return c.date === day && !fb.strava_activity_id && !fb.strava_link_dismissed;
    });

    const wk = comp
      ? null
      : ((wRes.data ?? []) as any[]).find((w) => {
          const plan = (w.plan as any) ?? {};
          if (plan.strava_activity_id || plan.strava_link_dismissed) return false;
          if (w.status === "completed") return false;
          const d = plan.scheduled_date ?? String(w.created_at).slice(0, 10);
          return d === day;
        });

    await askFeedback(a);
    if (!comp && !wk) continue;

    // Alta confianza solo para entrenos: duración ±20% y tipo de bici coherente
    if (wk) {
      const plannedMin = Number(wk.duration_minutes) || 0;
      const actualMin = Number(a.moving_time ?? 0) / 60;
      const indoorPlan = !!((wk.plan as any) ?? {}).indoor;
      const indoorAct = String(a.type ?? "").toLowerCase().includes("virtual");
      const durationOk = plannedMin > 0 && Math.abs(actualMin - plannedMin) / plannedMin <= 0.2;
      const modalityOk = indoorPlan === indoorAct;
      const isRide = String(a.type ?? "").toLowerCase().includes("ride");
      if (durationOk && modalityOk && isRide) {
        try {
          await linkWorkoutActivity(admin, userId, wk.id, actId, true);
          linked.add(actId);
          out.auto++;
          await notifyUser(userId, {
            title: "✅ Entrenamiento completado",
            body: `"${a.name ?? "Actividad"}" se ha asignado automáticamente a ${((wk.plan as any)?.title ?? wk.training_type) || "tu entreno"} (${Math.round(actualMin)} min). Puedes deshacerlo en Entrenamientos.`,
            tag: `auto-link-${actId}`,
            url: "/entrenamientos",
          });
          await admin
            .from("daily_activities")
            .upsert(
              { user_id: userId, activity_id: actId, date: day, match_notified_at: new Date().toISOString() },
              { onConflict: "user_id,activity_id" },
            );
          await askFeedback(a);
        } catch (e) {
          console.error("[activity-detect] auto-link", e);
        }
        continue;
      }
    }

    if (notified.has(actId)) continue;
    const targetName = comp ? comp.name : ((wk!.plan as any)?.title ?? wk!.training_type ?? "tu entrenamiento");
    await notifyUser(userId, {
      title: "🚴 Nueva actividad detectada",
      body: `"${a.name ?? "Actividad"}" del ${day}. ¿La asignamos a ${targetName}? Ábrelo para confirmar.`,
      tag: `match-${actId}`,
      url: comp ? `/competiciones/${comp.id}` : "/entrenamientos",
      requireInteraction: true,
    });
    out.asked++;
    await admin
      .from("daily_activities")
      .upsert(
        { user_id: userId, activity_id: actId, date: day, match_notified_at: new Date().toISOString() },
        { onConflict: "user_id,activity_id" },
      );
  }

  // Recordatorio de tarde si el entreno de hoy sigue pendiente
  return out;
}

/** Aviso vespertino si el entreno de hoy sigue pendiente. */
export async function remindPendingWorkout(admin: any, userId: string, todayISO: string): Promise<boolean> {
  const { data: ws } = await admin
    .from("workouts")
    .select("id, plan, duration_minutes, training_type, status")
    .eq("user_id", userId)
    .neq("status", "completed");
  const w = ((ws ?? []) as any[]).find((x) => (x.plan as any)?.scheduled_date === todayISO);
  if (!w) return false;
  const plan = (w.plan as any) ?? {};
  const label = `${plan.name ?? ""} ${plan.title ?? ""}`.toLowerCase();
  if (plan.cancelled || w.status === "skipped" || w.status === "cancelled" || label.includes("descanso") || label.includes("cancelad")) return false;

  // Enviar el recordatorio sólo una vez al día
  const { data: already } = await admin
    .from("notification_log")
    .select("id")
    .eq("user_id", userId)
    .eq("title", "⏳ Entreno pendiente")
    .gte("created_at", `${todayISO}T00:00:00Z`)
    .lt("created_at", `${todayISO}T23:59:59Z`)
    .limit(1);
  if ((already ?? []).length > 0) return false;

  const { notifyUser } = await import("./web-push.server");
  await notifyUser(userId, {
    title: "⏳ Entreno pendiente",
    body: `${(w.plan as any)?.name ?? w.training_type} (${w.duration_minutes} min) sigue sin completar hoy.`,
    tag: `pending-${w.id}-${todayISO}`,
    url: "/entrenamientos",
  });
  return true;
}
