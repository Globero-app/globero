/* Resumen semanal automático: cumplimiento de la semana que acaba y
   objetivos de la siguiente. Se envía por push y/o Telegram según preferencia. */

import { buildTrainingLoad, isoDate, madridTodayISO, weekStart } from "./training-load.server";

const DAY = 86400000;

export async function buildWeeklySummaryText(supabase: any, userId: string) {
  const today = madridTodayISO();
  const todayMs = new Date(`${today}T12:00:00Z`).getTime();
  const thisWeek = weekStart(today);
  const nextWeek = isoDate(new Date(new Date(`${thisWeek}T12:00:00Z`).getTime() + 7 * DAY));
  const from = thisWeek;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();

  const { data: workouts } = await supabase
    .from("workouts")
    .select("status,plan,planned_tss,actual_tss,compliance,duration_minutes,rpe")
    .eq("user_id", userId)
    .limit(300);

  const all = (workouts ?? []) as any[];
  const inWeek = (d: string) => d >= from && d < nextWeek;
  const week = all.filter((w) => inWeek(String(w.plan?.scheduled_date ?? "")));
  const done = week.filter((w) => w.status === "completed");
  const plannedTss = week.reduce((a, w) => a + (Number(w.planned_tss) || 0), 0);
  const actualTss = done.reduce((a, w) => a + (Number(w.actual_tss) || Number(w.planned_tss) || 0), 0);
  const adherence = week.length ? Math.round((done.length / week.length) * 100) : null;

  const next = all
    .filter((w) => {
      const d = String(w.plan?.scheduled_date ?? "");
      return d >= nextWeek && d < isoDate(new Date(new Date(`${nextWeek}T12:00:00Z`).getTime() + 7 * DAY));
    })
    .sort((a, b) => String(a.plan?.scheduled_date).localeCompare(String(b.plan?.scheduled_date)));
  const nextTss = next.reduce((a, w) => a + (Number(w.planned_tss) || 0), 0);
  const nextMinutes = next.reduce((a, w) => a + (Number(w.duration_minutes) || 0), 0);

  const load = await buildTrainingLoad(supabase, userId, profile);

  // Próxima competición
  const { data: comps } = await supabase
    .from("competitions")
    .select("name,date")
    .eq("user_id", userId)
    .gte("date", today)
    .order("date", { ascending: true })
    .limit(1);
  const comp: any = comps?.[0] ?? null;
  const daysToComp = comp ? Math.round((new Date(`${comp.date}T12:00:00Z`).getTime() - todayMs) / DAY) : null;

  const lines: string[] = [];
  lines.push(`Semana ${thisWeek}: ${done.length}/${week.length} sesiones${adherence !== null ? ` (${adherence}%)` : ""}.`);
  if (plannedTss > 0) lines.push(`Carga: ${Math.round(actualTss)} TSS de ${Math.round(plannedTss)} previstos.`);
  lines.push(`Forma: CTL ${Math.round(load.ctl)} · ATL ${Math.round(load.atl)} · TSB ${Math.round(load.tsb)}.`);
  if (next.length) {
    lines.push(`Próxima semana: ${next.length} sesiones · ${Math.round(nextMinutes / 60 * 10) / 10} h · ${Math.round(nextTss)} TSS objetivo.`);
  }
  if (comp) lines.push(`${comp.name} en ${daysToComp} días.`);
  if (load.readiness_7d != null) lines.push(`Readiness 7d: ${load.readiness_7d}/5 (${load.readiness_trend}).`);

  const short = `${done.length}/${week.length} sesiones${adherence !== null ? ` · ${adherence}%` : ""} · TSB ${Math.round(load.tsb)}${next.length ? ` · próxima semana ${next.length} ses. / ${Math.round(nextTss)} TSS` : ""}`;

  return { title: "📊 Resumen semanal", body: short, detail: lines.join("\n"), adherence, week_sessions: week.length };
}

/** Envía el resumen semanal al usuario por su canal preferido. */
export async function sendWeeklySummary(supabase: any, userId: string): Promise<boolean> {
  try {
    const s = await buildWeeklySummaryText(supabase, userId);
    const { notifyUser } = await import("./web-push.server");
    await notifyUser(userId, {
      title: s.title,
      body: s.detail,
      tag: `weekly-summary-${madridTodayISO()}`,
      url: "/progreso",
    });
    return true;
  } catch (e) {
    console.error("[weekly-summary]", e);
    return false;
  }
}
