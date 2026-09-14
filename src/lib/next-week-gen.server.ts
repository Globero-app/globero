/* Generación anticipada de la semana siguiente: si el domingo el usuario ya ha
   completado todos los entrenamientos de la semana, no se espera al cron de las
   23:30 y se crean los de la semana siguiente + resumen semanal. */

import { isoDate, madridTodayISO, weekStart } from "./training-load.server";

const DAY = 86400000;
const addDays = (iso: string, n: number) => isoDate(new Date(new Date(`${iso}T12:00:00Z`).getTime() + n * DAY));

/** Genera la semana siguiente si hoy es domingo y la semana está completada. Devuelve nº de sesiones creadas. */
export async function maybeGenerateNextWeekEarly(supabase: any, userId: string): Promise<number> {
  const today = madridTodayISO();
  if (new Date(`${today}T12:00:00Z`).getUTCDay() !== 0) return 0;

  const { data: u } = await supabase
    .from("profiles")
    .select(
      "id, weekly_auto_enabled, weekly_training_days, weekly_long_ride_day, weekly_bike_type, weekly_duration_minutes, weekly_target_basis, weekly_last_generated_at, nutrition_plan_enabled, nutrition_goal",
    )
    .eq("id", userId)
    .maybeSingle();
  if (!u || !u.weekly_auto_enabled) return 0;

  const days = ((u.weekly_training_days ?? []) as any[]).map(Number).filter((d) => d >= 0 && d <= 6);
  if (!days.length) return 0;

  // Idempotencia: ya generado hoy
  if (u.weekly_last_generated_at) {
    const last = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Madrid",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(u.weekly_last_generated_at));
    if (last === today) return 0;
  }

  const monday = weekStart(today);
  const nextMonday = addDays(monday, 7);
  const nextSunday = addDays(monday, 13);

  const { data: rows } = await supabase
    .from("workouts")
    .select("status,plan")
    .eq("user_id", userId)
    .limit(300);
  const all = (rows ?? []) as any[];
  const week = all.filter((w) => {
    const d = String(w.plan?.scheduled_date ?? "");
    return d >= monday && d < nextMonday;
  });
  if (!week.length || week.some((w) => w.status !== "completed")) return 0;

  // Si ya existen sesiones de la semana siguiente, no duplicar
  if (all.some((w) => String(w.plan?.scheduled_date ?? "") >= nextMonday)) return 0;

  const { generateWorkoutsCore } = await import("./workouts-gen.server");
  const inserted = await generateWorkoutsCore(supabase, userId, {
    bike_type: u.weekly_bike_type ?? "carretera",
    duration_minutes: u.weekly_duration_minutes ?? 60,
    target_basis: u.weekly_target_basis === "hr" ? "hr" : "power",
    training_days: days,
    long_ride_day: u.weekly_long_ride_day ?? null,
    max_count: days.length,
    from: new Date(`${today}T12:00:00Z`),
    until: nextSunday,
    nutrition_goal: u.nutrition_plan_enabled ? (u.nutrition_goal ?? "mantenimiento") : null,
  });

  if (u.nutrition_plan_enabled) {
    try {
      const { generateWeeklyNutritionCore } = await import("./nutrition-gen.server");
      await generateWeeklyNutritionCore(supabase, userId, {
        goal: u.nutrition_goal ?? "mantenimiento",
        week_start: nextMonday,
      });
    } catch (e) {
      console.error("[next-week-gen] nutrition", e);
    }
  }

  try {
    const { syncWorkoutEvent } = await import("./intervals.server");
    for (const w of inserted ?? []) {
      try { await syncWorkoutEvent(supabase, userId, w); } catch { /* noop */ }
    }
  } catch { /* noop */ }

  await supabase.from("profiles").update({ weekly_last_generated_at: new Date().toISOString() }).eq("id", userId);

  try {
    const { notifyUser } = await import("./web-push.server");
    await notifyUser(userId, {
      title: "✅ Semana completada",
      body: `Ya están creados los ${inserted?.length ?? 0} entrenamientos de la semana que viene.`,
      tag: `next-week-${today}`,
      url: "/entrenamientos",
    });
  } catch (e) {
    console.error("[next-week-gen] notify", e);
  }

  try {
    const { sendWeeklySummary } = await import("./weekly-summary.server");
    await sendWeeklySummary(supabase, userId);
  } catch (e) {
    console.error("[next-week-gen] summary", e);
  }

  return inserted?.length ?? 0;
}
