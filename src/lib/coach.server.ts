/* Coach IA proactivo: resumen diario y alertas de fatiga.
   Solo servidor: no importar desde el cliente. */

import { buildTrainingLoad, madridTodayISO } from "./training-load.server";

export interface CoachAlert {
  kind: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
}

const DAY = 86400000;

function daysAgoISO(n: number): string {
  return new Date(new Date(`${madridTodayISO()}T12:00:00Z`).getTime() - n * DAY).toISOString().slice(0, 10);
}

async function loadContext(supabase: any, userId: string) {
  const today = madridTodayISO();
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  const load = await buildTrainingLoad(supabase, userId, profile);

  const { data: workouts } = await supabase
    .from("workouts")
    .select("id,status,plan,duration_minutes,bike_type,planned_tss")
    .eq("user_id", userId)
    .neq("status", "completed")
    .limit(200);
  const todayWorkout = ((workouts ?? []) as any[]).find((w) => String(w.plan?.scheduled_date ?? "") === today) ?? null;

  const { data: readiness } = await supabase
    .from("readiness_entries")
    .select("score,ai_message")
    .eq("user_id", userId)
    .eq("entry_date", today)
    .maybeSingle();

  const { data: comps } = await supabase
    .from("competitions")
    .select("name,date")
    .eq("user_id", userId)
    .gte("date", today)
    .order("date", { ascending: true })
    .limit(1);

  return { today, profile, load, todayWorkout, readiness, health: [] as any[], comp: (comps?.[0] as any) ?? null };
}

/** Resumen diario del coach: qué toca hoy, forma actual y consejo. */
function briefHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

export async function buildDailyBrief(supabase: any, userId: string) {
  const { today, profile, load, todayWorkout, readiness, health, comp } = await loadContext(supabase, userId);

  const lines: string[] = [];
  if (todayWorkout) {
    const p: any = todayWorkout.plan ?? {};
    lines.push(`Hoy: ${p.title ?? p.name ?? "Sesión planificada"} · ${todayWorkout.duration_minutes} min · ${todayWorkout.bike_type}`);
    if (p.summary) lines.push(p.summary);
  } else {
    lines.push("Hoy: día de descanso (sin sesión planificada).");
  }
  lines.push(`Forma: CTL ${Math.round(load.ctl)} · ATL ${Math.round(load.atl)} · TSB ${Math.round(load.tsb)}`);
  if (readiness?.score) lines.push(`Readiness de hoy: ${readiness.score}/5`);
  else lines.push("Readiness de hoy: sin registrar");
  const last = health[0];
  if (last) {
    const bits = [
      last.sleep_hours != null ? `sueño ${last.sleep_hours}h` : null,
      last.fatigue != null ? `fatiga ${last.fatigue}/5` : null,
      last.weight_kg != null ? `${last.weight_kg} kg` : null,
    ].filter(Boolean);
    if (bits.length) lines.push(`Salud (${last.entry_date}): ${bits.join(" · ")}`);
  }
  if (comp) {
    const days = Math.round((new Date(`${comp.date}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / DAY);
    lines.push(`${comp.name}: faltan ${days} días.`);
  }

  // Caché del consejo: solo se llama a la IA si cambia el contexto del día.
  const inputHash = briefHash(lines.join("\n"));
  const cache = ((profile as any)?.daily_brief_cache ?? null) as { hash?: string; advice?: string } | null;
  let advice = cache?.hash === inputHash ? String(cache?.advice ?? "") : "";
  if (!advice) {
    try {
      const { callAI } = await import("./ai-call.server");
      const res = await callAI(
        [
          {
            role: "system",
            content:
              "Eres el entrenador de ciclismo del usuario. Devuelve UNA sola frase en español (máx. 200 caracteres), concreta y accionable, sin markdown ni emojis.",
          },
          { role: "user", content: lines.join("\n") },
        ],
        undefined,
        { fn: "daily-brief", userId },
      );
      advice = typeof res === "string" ? res : String(res?.reply ?? res?.content ?? "");
      advice = advice.replace(/\s+/g, " ").trim().slice(0, 220);
      if (advice) {
        void supabase
          .from("profiles")
          .update({ daily_brief_cache: { hash: inputHash, advice } })
          .eq("id", userId)
          .then(() => {});
      }
    } catch {
      advice = "";
    }
  }
  advice = advice.replace(/\s+/g, " ").trim().slice(0, 220);
  if (advice) lines.push(`Consejo: ${advice}`);

  const short = todayWorkout
    ? `${(todayWorkout.plan as any)?.title ?? "Sesión"} · ${todayWorkout.duration_minutes} min · TSB ${Math.round(load.tsb)}`
    : `Descanso · TSB ${Math.round(load.tsb)}`;

  const notificationBody = todayWorkout
    ? `${(todayWorkout.plan as any)?.title ?? "Sesión"} · ${todayWorkout.duration_minutes} min · ${todayWorkout.bike_type}${
        (todayWorkout.plan as any)?.summary ? "\n" + (todayWorkout.plan as any).summary : ""
      }`
    : "Hoy: día de descanso.";

  return {
    date: today,
    title: "🧭 Resumen de hoy",
    short,
    body: notificationBody,
    detail: lines.join("\n"),
    advice,
    load: { ctl: Math.round(load.ctl), atl: Math.round(load.atl), tsb: Math.round(load.tsb) },
    workout: todayWorkout
      ? {
          id: todayWorkout.id,
          title: (todayWorkout.plan as any)?.title ?? (todayWorkout.plan as any)?.name ?? "Sesión",
          duration_minutes: todayWorkout.duration_minutes,
          bike_type: todayWorkout.bike_type,
          summary: (todayWorkout.plan as any)?.summary ?? null,
        }
      : null,
    readiness_score: readiness?.score ?? null,
  };
}

/** Evalúa reglas de fatiga/forma y devuelve las alertas activas de hoy. */
export function evaluateAlerts(load: any, health: any[], todayISO?: string): CoachAlert[] {
  const alerts: CoachAlert[] = [];
  const tsb = Number(load?.tsb ?? 0);

  if (tsb <= -30) {
    alerts.push({
      kind: "tsb_critical",
      severity: "critical",
      title: "Fatiga muy alta",
      message: `Tu TSB es ${Math.round(tsb)}. Riesgo de sobrecarga: reduce intensidad 2-3 días y prioriza sueño y comida.`,
    });
  } else if (tsb <= -20) {
    alerts.push({
      kind: "tsb_high",
      severity: "warning",
      title: "Fatiga acumulada",
      message: `TSB ${Math.round(tsb)}. Mantén las sesiones suaves en Z2 y evita añadir intensidad esta semana.`,
    });
  }

  // La rampa solo se evalúa con la semana avanzada (viernes en adelante)
  const dow = todayISO ? new Date(`${todayISO}T12:00:00Z`).getUTCDay() : 5;
  const weekAdvanced = dow === 0 || dow >= 5;
  if (weekAdvanced && load?.ramp_pct != null && Number(load.ramp_pct) > 25) {

    alerts.push({
      kind: "ramp_high",
      severity: "warning",
      title: "Rampa de carga alta",
      message: `Has subido la carga un ${Math.round(Number(load.ramp_pct))}% respecto a las semanas previas. Limita el incremento al 5-10%.`,
    });
  }

  if (load?.readiness_7d != null && Number(load.readiness_7d) < 2.6 && load?.readiness_trend === "down") {
    alerts.push({
      kind: "readiness_low",
      severity: "warning",
      title: "Readiness a la baja",
      message: `Media de readiness 7d: ${load.readiness_7d}/5 y bajando. Considera un día extra de descanso.`,
    });
  }

  if (load?.adherence_pct != null && Number(load.adherence_pct) < 60) {
    alerts.push({
      kind: "adherence_low",
      severity: "info",
      title: "Adherencia baja",
      message: `Solo completas el ${Math.round(Number(load.adherence_pct))}% de las sesiones. Ajusta días o duración para que el plan sea realista.`,
    });
  }

  const recent = health.slice(0, 3);
  if (recent.length >= 2) {
    const fatigues = recent.map((h) => Number(h.fatigue)).filter((n) => Number.isFinite(n) && n > 0);
    const sleeps = recent.map((h) => Number(h.sleep_hours)).filter((n) => Number.isFinite(n) && n > 0);
    if (fatigues.length >= 2 && fatigues.reduce((a, b) => a + b, 0) / fatigues.length >= 4) {
      alerts.push({
        kind: "health_fatigue",
        severity: "warning",
        title: "Fatiga percibida alta",
        message: "Llevas varios días con fatiga alta. Recorta volumen hoy y revisa descanso y alimentación.",
      });
    }
    if (sleeps.length >= 2 && sleeps.reduce((a, b) => a + b, 0) / sleeps.length < 6) {
      alerts.push({
        kind: "health_sleep",
        severity: "warning",
        title: "Sueño insuficiente",
        message: "Media de sueño por debajo de 6 h. El rendimiento y la recuperación se resienten; evita sesiones de alta intensidad.",
      });
    }
  }

  if (!alerts.length && tsb >= 12) {
    alerts.push({
      kind: "fresh",
      severity: "info",
      title: "Estás fresco",
      message: `TSB ${Math.round(tsb)}: buen momento para una sesión de calidad o un test.`,
    });
  }

  return alerts;
}

/** Calcula, guarda y (opcionalmente) notifica las alertas del día. */
export async function runCoachAlerts(supabase: any, userId: string, notify = false) {
  const { today, load, health, profile } = await loadContext(supabase, userId);
  const alerts = evaluateAlerts(load, health);
  if (!alerts.length) return { alerts: [] as CoachAlert[], notified: 0 };

  const rows = alerts.map((a) => ({
    user_id: userId,
    alert_date: today,
    kind: a.kind,
    severity: a.severity,
    title: a.title,
    message: a.message,
  }));
  await supabase.from("coach_alerts").upsert(rows, { onConflict: "user_id,alert_date,kind" });

  let notified = 0;
  const serious = alerts.filter((a) => a.severity !== "info");
  if (notify && serious.length && (profile as any)?.notify_fatigue_alerts !== false) {
    const { notifyUser } = await import("./web-push.server");
    const top = serious[0]!;
    await notifyUser(userId, {
      title: `⚠️ ${top.title}`,
      body: serious.map((a) => a.message).join("\n"),
      tag: `coach-alert-${today}`,
      url: "/progreso",
    });
    notified = 1;
  }
  return { alerts, notified };
}

/** Envía el resumen diario por el canal preferido del usuario. */
export async function sendDailyBrief(supabase: any, userId: string): Promise<boolean> {
  try {
    const brief = await buildDailyBrief(supabase, userId);
    const { notifyUser } = await import("./web-push.server");
    await notifyUser(userId, {
      title: brief.title,
      body: brief.body,
      tag: `daily-brief-${brief.date}`,
      url: "/app",
    });
    return true;
  } catch (e) {
    console.error("[coach] daily brief", e);
    return false;
  }
}
