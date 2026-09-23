/* Repaso diario del plan: ajusta la sesión de hoy según readiness/frescura,
   marca como no realizados los entrenos saltados y propone reubicarlos.
   Solo servidor. */

import { madridTodayISO, isoDate, weekStart, buildTrainingLoad } from "./training-load.server";

const DAY = 86400000;
const addDays = (iso: string, n: number) => isoDate(new Date(new Date(`${iso}T12:00:00Z`).getTime() + n * DAY));

async function notify(supabase: any, userId: string, title: string, body: string, url = "/entrenamientos") {
  try {
    const { data: prof } = await supabase
      .from("profiles")
      .select("notify_channel,telegram_chat_id")
      .eq("id", userId)
      .maybeSingle();
    const channel = (prof?.notify_channel as string) || "push";
    if ((channel === "telegram" || channel === "both") && prof?.telegram_chat_id) {
      const { telegramSend } = await import("./telegram.server");
      await telegramSend(prof.telegram_chat_id, `${title}\n\n${body}`);
    }
    if (channel !== "telegram") {
      const { notifyUserPushOnly } = await import("./web-push.server");
      await notifyUserPushOnly(userId, { title, body, tag: `daily-${Date.now()}`, url });
    }
  } catch (e) {
    console.error("[daily-adjust] notify", e);
  }
}

/** Marca como no realizados los entrenos pendientes ya vencidos y propone reubicación. */
export async function markSkippedAndPropose(supabase: any, userId: string, todayISO = madridTodayISO()) {
  const since = addDays(todayISO, -10);
  const { data: rows } = await supabase
    .from("workouts")
    .select("id,plan,duration_minutes,status")
    .eq("user_id", userId)
    .eq("status", "pending")
    .limit(200);

  const overdue = ((rows ?? []) as any[]).filter((w) => {
    const d = String(w.plan?.scheduled_date ?? "");
    return d && d < todayISO && d >= since;
  });
  if (!overdue.length) return { skipped: 0, proposed: 0, trimmed: 0 };

  // Días ocupados de la semana en curso
  const ws = weekStart(todayISO);
  const weekEnd = addDays(ws, 6);
  const { data: weekRows } = await supabase
    .from("workouts")
    .select("plan,status")
    .eq("user_id", userId)
    .limit(200);
  const busy = new Set(
    ((weekRows ?? []) as any[])
      .map((w) => String(w.plan?.scheduled_date ?? ""))
      .filter((d) => d >= ws && d <= weekEnd),
  );

  let skipped = 0;
  let proposed = 0;
  let trimmed = 0;

  for (const w of overdue) {
    // Día libre de esta semana a partir de mañana
    let free: string | null = null;
    for (let d = addDays(todayISO, 1); d <= weekEnd; d = addDays(d, 1)) {
      if (!busy.has(d)) { free = d; break; }
    }

    const plan: any = { ...(w.plan ?? {}) };
    plan.skipped_at = new Date().toISOString();
    plan.original_date = plan.scheduled_date;

    if (free) {
      plan.reschedule_proposal = { to: free, created_at: new Date().toISOString() };
      proposed++;
      busy.add(free);
    } else {
      plan.reschedule_proposal = null;
      trimmed++;
    }

    await supabase
      .from("workouts")
      .update({ status: "skipped", plan })
      .eq("id", w.id)
      .eq("user_id", userId);
    skipped++;

    try {
      const { removeWorkoutEvent } = await import("./intervals.server");
      await removeWorkoutEvent(supabase, userId, { ...w, plan });
    } catch { /* best-effort */ }

    if (free) {
      await notify(
        supabase,
        userId,
        "⏭️ Entreno no realizado",
        `"${plan.title ?? plan.name ?? "Sesión"}" del ${plan.original_date} no se ha registrado. ¿Lo reubicamos el ${free}? Confírmalo en Entrenamientos.`,
      );
    } else {
      await notify(
        supabase,
        userId,
        "⏭️ Semana ajustada",
        `No quedan días libres esta semana, así que "${plan.title ?? plan.name ?? "Sesión"}" se retira y la carga se reparte entre las sesiones que quedan.`,
      );
    }
  }

  if (trimmed > 0) {
    try {
      const { rebalanceWeekCore } = await import("./week-rebalance.server");
      await rebalanceWeekCore(supabase, userId, ws);
    } catch (e) {
      console.error("[daily-adjust] rebalance", e);
    }
  }

  return { skipped, proposed, trimmed };
}

/** El ciclista descarta un entreno ("hoy no puedo"): se marca y se propone día libre. */
export async function skipWorkoutNow(supabase: any, userId: string, w: any) {
  const todayISO = madridTodayISO();
  const ws = weekStart(todayISO);
  const weekEnd = addDays(ws, 6);

  const { data: weekRows } = await supabase
    .from("workouts")
    .select("id,plan")
    .eq("user_id", userId)
    .limit(200);
  const busy = new Set(
    ((weekRows ?? []) as any[])
      .filter((r) => r.id !== w.id)
      .map((r) => String(r.plan?.scheduled_date ?? ""))
      .filter((d) => d >= ws && d <= weekEnd),
  );

  let free: string | null = null;
  for (let d = addDays(todayISO, 1); d <= weekEnd; d = addDays(d, 1)) {
    if (!busy.has(d)) { free = d; break; }
  }

  const plan: any = { ...((w.plan as any) ?? {}) };
  plan.skipped_at = new Date().toISOString();
  plan.original_date = plan.scheduled_date;
  plan.user_skipped = true;
  plan.reschedule_proposal = free ? { to: free, created_at: new Date().toISOString() } : null;

  await supabase.from("workouts").update({ status: "skipped", plan }).eq("id", w.id).eq("user_id", userId);
  try {
    const { removeWorkoutEvent } = await import("./intervals.server");
    await removeWorkoutEvent(supabase, userId, { ...w, plan });
  } catch { /* best-effort */ }

  let rebalanced: any = null;
  if (!free) {
    try {
      const { rebalanceWeekCore } = await import("./week-rebalance.server");
      rebalanced = await rebalanceWeekCore(supabase, userId, ws);
    } catch { /* noop */ }
  }

  return { ok: true, skipped: true, proposed_date: free, rebalanced };
}

export interface HrvStatus {
  value: number | null;
  baseline: number | null;
  sd: number | null;
  deviationPct: number | null;
  level: "ok" | "low" | "very_low" | "unknown";
}

/** Compara la VFC de hoy con la línea base propia del ciclista (media ± SD de 42 días). */
export async function evaluateHrv(supabase: any, userId: string, todayISO = madridTodayISO()): Promise<HrvStatus> {
  const unknown: HrvStatus = { value: null, baseline: null, sd: null, deviationPct: null, level: "unknown" };
  const { data } = await supabase
    .from("hrv_entries")
    .select("entry_date,value")
    .eq("user_id", userId)
    .gte("entry_date", addDays(todayISO, -42))
    .lte("entry_date", todayISO)
    .order("entry_date", { ascending: false })
    .limit(60);

  const rows = ((data ?? []) as any[])
    .map((r) => ({ date: String(r.entry_date), value: Number(r.value) }))
    .filter((r) => Number.isFinite(r.value) && r.value > 0);
  if (!rows.length) return unknown;

  const todayRow = rows.find((r) => r.date === todayISO) ?? rows.find((r) => r.date === addDays(todayISO, -1));
  const base = rows.filter((r) => r.date !== todayRow?.date);
  if (!todayRow || base.length < 7) return { ...unknown, value: todayRow?.value ?? null };

  const mean = base.reduce((a, b) => a + b.value, 0) / base.length;
  const sd = Math.sqrt(base.reduce((a, b) => a + (b.value - mean) ** 2, 0) / base.length);
  const deviationPct = mean > 0 ? Math.round(((todayRow.value - mean) / mean) * 1000) / 10 : null;

  let level: HrvStatus["level"] = "ok";
  if (todayRow.value < mean - 2 * sd || (deviationPct !== null && deviationPct <= -15)) level = "very_low";
  else if (todayRow.value < mean - sd || (deviationPct !== null && deviationPct <= -8)) level = "low";

  return {
    value: todayRow.value,
    baseline: Math.round(mean),
    sd: Math.round(sd * 10) / 10,
    deviationPct,
    level,
  };
}

/** Suaviza, convierte en recuperación o mantiene la sesión de hoy según VFC, readiness y frescura. */
export async function adjustTodayByReadiness(supabase: any, userId: string, todayISO = madridTodayISO()) {
  const { todayWorkout, adjustPlan, buildRecoveryPlan } = await import("./adjust.server");
  const w = await todayWorkout(supabase, userId);
  if (!w) return { adjusted: false, reason: "sin_sesion" };
  const plan: any = w.plan ?? {};
  if (plan.daily_adjust_date === todayISO) return { adjusted: false, reason: "ya_ajustada" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("ftp,lthr,max_hr,intervals_athlete_id")
    .eq("id", userId)
    .maybeSingle();

  const { data: readiness } = await supabase
    .from("readiness_entries")
    .select("score")
    .eq("user_id", userId)
    .eq("entry_date", todayISO)
    .maybeSingle();

  let load: any = null;
  try { load = await buildTrainingLoad(supabase, userId, profile); } catch { /* opcional */ }

  const score = Number(readiness?.score ?? 0);
  const tsb = Number(load?.tsb ?? 0);
  const veryLow = score === 1;
  const low = score === 2 || (score > 0 && score <= 3 && tsb <= -25) || (!score && tsb <= -30);
  if (!veryLow && !low) return { adjusted: false, reason: "sin_cambios" };

  const res = adjustPlan(
    plan,
    { easier: true, minutes: veryLow ? Math.min(w.duration_minutes, 45) : null },
    { ftp: profile?.ftp ?? null, lthr: (profile as any)?.lthr ?? null, maxHr: (profile as any)?.max_hr ?? null },
  );
  const newPlan = {
    ...res.plan,
    daily_adjust_date: todayISO,
    rationale: `${plan.rationale ?? ""} · Ajuste automático de hoy: ${score ? `readiness ${score}/5` : `TSB ${Math.round(tsb)}`}`.trim(),
  };

  const { data: updated } = await supabase
    .from("workouts")
    .update({ plan: newPlan, duration_minutes: res.minutes, planned_tss: res.tss })
    .eq("id", w.id)
    .eq("user_id", userId)
    .select()
    .maybeSingle();

  if (updated && (profile as any)?.intervals_athlete_id) {
    try {
      const { syncWorkoutEvent } = await import("./intervals.server");
      await syncWorkoutEvent(supabase, userId, updated);
    } catch { /* noop */ }
  }

  try {
    const { rebalanceWeekCore } = await import("./week-rebalance.server");
    await rebalanceWeekCore(supabase, userId, weekStart(todayISO));
  } catch { /* noop */ }

  await notify(
    supabase,
    userId,
    "🔻 Sesión de hoy suavizada",
    `${score ? `Readiness ${score}/5` : `Frescura baja (TSB ${Math.round(tsb)})`}: hoy bajamos intensidad a ${res.minutes} min. La carga se reparte en el resto de la semana.`,
  );

  return { adjusted: true, minutes: res.minutes };
}

/** Detecta FTP desfasado a partir de la curva de potencia reciente. */
export async function checkFtpOutdated(supabase: any, userId: string, todayISO = madridTodayISO()) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("ftp,ftp_test_completed_at")
    .eq("id", userId)
    .maybeSingle();
  const ftp = Number(profile?.ftp ?? 0);
  if (!ftp) return { alerted: false };

  const since = addDays(todayISO, -42);
  const { data: peaks } = await supabase
    .from("power_peaks")
    .select("watts,activity_date")
    .eq("user_id", userId)
    .eq("duration_seconds", 1200)
    .gte("activity_date", since)
    .order("watts", { ascending: false })
    .limit(1);
  const best = Number(peaks?.[0]?.watts ?? 0);
  if (!best) return { alerted: false };

  const estimated = Math.round(best * 0.95);
  if (estimated <= ftp + 5) return { alerted: false };

  const { data: recentAlert } = await supabase
    .from("coach_alerts")
    .select("id,alert_date")
    .eq("user_id", userId)
    .eq("kind", "ftp_outdated")
    .gte("alert_date", addDays(todayISO, -14))
    .limit(1);
  if (recentAlert?.length) return { alerted: false };

  await supabase.from("coach_alerts").insert({
    user_id: userId,
    alert_date: todayISO,
    kind: "ftp_outdated",
    severity: "info",
    title: "Tu FTP parece desfasado",
    message: `Has hecho 20 min a ${Math.round(best)} W, lo que indica un FTP de ~${estimated} W frente a los ${ftp} W de tu perfil. Actualízalo o haz un test para ajustar zonas y objetivos.`,
  });

  await notify(
    supabase,
    userId,
    "📈 Tu FTP parece desfasado",
    `Tus esfuerzos recientes apuntan a ~${estimated} W (tienes ${ftp} W). Revisa tu umbral en el Perfil o programa un test.`,
    "/perfil",
  );
  return { alerted: true, estimated };
}

/** Repaso diario completo de un usuario. */
export async function dailyReview(supabase: any, userId: string, todayISO = madridTodayISO()) {
  const out: Record<string, unknown> = {};
  try { out.skipped = await markSkippedAndPropose(supabase, userId, todayISO); } catch (e) { console.error("[daily-adjust] skipped", e); }
  try { out.today = await adjustTodayByReadiness(supabase, userId, todayISO); } catch (e) { console.error("[daily-adjust] today", e); }
  try { out.ftp = await checkFtpOutdated(supabase, userId, todayISO); } catch (e) { console.error("[daily-adjust] ftp", e); }
  return out;
}
