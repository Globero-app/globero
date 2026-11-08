import { chooseReportActivity, workoutReportDate } from "./workout-report.helpers";

/** Resolve only the caller's completed workout and preserve existing feedback. */
export async function resolveWorkoutReportActivity(supabase: any, userId: string, workoutId: string) {
  const { data: workout, error } = await supabase.from("workouts")
    .select("id,status,plan,completed_at,duration_minutes").eq("user_id", userId).eq("id", workoutId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!workout || workout.status !== "completed") throw new Error("Entrenamiento completado no encontrado");
  const plan = { ...(workout.plan ?? {}) };
  const day = workoutReportDate(workout);
  if (!day) throw new Error("El entrenamiento no tiene una fecha válida");
  let activityId = plan.strava_activity_id ?? plan.intervals_activity_id ?? null;
  const { data: daily, error: dailyError } = await supabase.from("daily_activities")
    .select("activity_id,rpe,feel,feedback_completed,date").eq("user_id", userId).eq("date", day);
  if (dailyError) throw new Error(dailyError.message);
  if (!activityId) {
    const start = new Date(`${day}T00:00:00Z`);
    const from = new Date(start.getTime() - 86400000).toISOString();
    const to = new Date(start.getTime() + 2 * 86400000).toISOString();
    const [{ data: activities, error: activityError }, { data: others, error: otherError }] = await Promise.all([
      supabase.from("intervals_activities").select("id,start_date,moving_time").eq("user_id", userId).gte("start_date", from).lt("start_date", to),
      supabase.from("workouts").select("plan").eq("user_id", userId).neq("id", workoutId).eq("status", "completed"),
    ]);
    if (activityError || otherError) throw new Error((activityError ?? otherError).message);
    const excluded = new Set<string>((others ?? []).flatMap((w: any) => [w.plan?.strava_activity_id, w.plan?.intervals_activity_id].filter(Boolean).map(String)));
    const activity = chooseReportActivity(activities ?? [], day, workout.duration_minutes, excluded);
    activityId = activity?.id ?? (daily ?? []).find((d: any) => !excluded.has(d.activity_id) && !d.activity_id.startsWith("workout:"))?.activity_id ?? null;
    if (activityId) plan.intervals_activity_id = String(activityId);
  }
  const feedbackId = String(activityId ?? plan.feedback_activity_id ?? `workout:${workoutId}`);
  plan.feedback_activity_id = feedbackId;
  const feedback = (daily ?? []).find((d: any) => d.activity_id === feedbackId)
    ?? (daily ?? []).find((d: any) => d.feedback_completed && d.rpe != null && d.feel != null);
  const { error: insertError } = await supabase.from("daily_activities").upsert({
    user_id: userId, activity_id: feedbackId, date: day,
    feedback_completed: feedback?.feedback_completed ?? false,
    rpe: feedback?.rpe ?? null, feel: feedback?.feel ?? null,
  }, { onConflict: "user_id,activity_id", ignoreDuplicates: true });
  if (insertError) throw new Error(insertError.message);
  const { error: updateError } = await supabase.from("workouts").update({ plan, updated_at: new Date().toISOString() })
    .eq("id", workoutId).eq("user_id", userId);
  if (updateError) throw new Error(updateError.message);
  return { feedbackId, day };
}