/* Redistribución automática de la carga de la semana.
   Cuando una sesión pendiente se elimina o salta, el resto de sesiones
   pendientes de esa semana se re-escalan para mantener el TSS objetivo. */

export interface RebalanceResult {
  changed: boolean;
  reason?: string;
  workouts: Array<{ id: string; old_minutes: number; new_minutes: number; old_tss: number; new_tss: number }>;
}

const DAY = 86400000;

export function weekBounds(weekStartISO: string): { from: string; to: string } {
  const from = new Date(`${weekStartISO}T00:00:00Z`);
  const to = new Date(from.getTime() + 6 * DAY);
  return { from: weekStartISO, to: to.toISOString().slice(0, 10) };
}

/**
 * Re-escala las sesiones pendientes de una semana para cuadrar el TSS objetivo
 * (plan.week_target_tss). Devuelve qué sesiones cambiaron.
 */
export async function rebalanceWeekCore(
  supabase: any,
  userId: string,
  weekStartISO: string,
): Promise<RebalanceResult> {
  const { weekStart, madridTodayISO } = await import("./training-load.server");
  const ws = weekStart(weekStartISO);
  const { from, to } = weekBounds(ws);
  const today = madridTodayISO();

  const { data: rows } = await supabase
    .from("workouts")
    .select("id,duration_minutes,planned_tss,plan,status")
    .eq("user_id", userId)
    .eq("status", "pending");

  const inWeek = (rows ?? []).filter((w: any) => {
    const d = (w.plan as any)?.scheduled_date;
    return d && d >= from && d <= to && d >= today;
  });
  if (!inWeek.length) return { changed: false, reason: "no_quedan_sesiones", workouts: [] };

  const weekTarget = Number((inWeek[0].plan as any)?.week_target_tss) || null;
  if (!weekTarget || weekTarget <= 0) return { changed: false, reason: "sin_objetivo_semanal", workouts: [] };

  const { estimatePlanTss } = await import("./training-load.server");
  const { data: profile } = await supabase
    .from("profiles")
    .select("ftp,max_hr,lthr")
    .eq("id", userId)
    .maybeSingle();
  const ftp = profile?.ftp ?? null;
  const lthr = (profile as any)?.lthr ?? null;
  const maxHr = (profile as any)?.max_hr ?? null;

  // Carga ya realizada esta semana (TSS real) se descuenta del objetivo
  const { data: doneRows } = await supabase
    .from("workouts")
    .select("actual_tss,planned_tss,plan,completed_at")
    .eq("user_id", userId)
    .eq("status", "completed");
  const done = (doneRows ?? [])
    .filter((w: any) => {
      const d = (w.plan as any)?.scheduled_date ?? w.completed_at?.slice(0, 10);
      return d && d >= from && d <= to;
    })
    .reduce((a: number, w: any) => a + (Number(w.actual_tss) || Number(w.planned_tss) || 0), 0);
  const target = Math.max(weekTarget * 0.3, weekTarget - done);

  const current = inWeek.map((w: any) => ({
    w,
    tss: Number(w.planned_tss) || estimatePlanTss(w.plan, ftp, lthr, maxHr, w.duration_minutes),
  }));
  const sum = current.reduce((a: number, c: { tss: number }) => a + c.tss, 0);
  if (sum <= 0) return { changed: false, reason: "sin_carga", workouts: [] };

  const factor = Math.min(1.35, Math.max(0.7, target / sum));
  if (Math.abs(factor - 1) < 0.05) return { changed: false, reason: "ya_equilibrada", workouts: [] };

  const { validateWorkout } = await import("./workout-validator.server");
  const { syncWorkoutEvent } = await import("./intervals.server");

  const changed: RebalanceResult["workouts"] = [];
  for (const { w, tss } of current) {
    const plan: any = w.plan ?? {};
    const basis: "power" | "hr" = plan.target_basis === "hr" ? "hr" : "power";
    const newMinutes = Math.max(20, Math.round((w.duration_minutes * factor) / 5) * 5);
    if (newMinutes === w.duration_minutes) continue;
    const v = validateWorkout(plan, {
      ftp,
      lthr,
      maxHr,
      basis,
      duration_minutes: newMinutes,
      long_ride: !!plan.long_ride,
    });
    const dir = factor > 1 ? "sube" : "baja";
    const newPlan = {
      ...v.plan,
      summary: `${v.plan.summary ?? ""} (Ajuste automático de semana: ${dir} a ${v.minutes} min para mantener el TSS objetivo tras cambios en el calendario.)`.trim(),
      rebalanced_at: new Date().toISOString(),
    };
    const { data: updated, error } = await supabase
      .from("workouts")
      .update({ plan: newPlan, duration_minutes: v.minutes, planned_tss: v.tss })
      .eq("id", w.id)
      .eq("user_id", userId)
      .select()
      .maybeSingle();
    if (error) continue;
    try { await syncWorkoutEvent(supabase, userId, updated); } catch { /* best-effort */ }
    changed.push({ id: w.id, old_minutes: w.duration_minutes, new_minutes: v.minutes, old_tss: Math.round(tss), new_tss: v.tss });
  }

  return { changed: changed.length > 0, workouts: changed };
}
