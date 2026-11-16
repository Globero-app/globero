import { continuityWindow, summarizeWorkoutContinuity } from "./workout-continuity";

export const CONTINUITY_RULE = "La recuperación se justifica por actividades realizadas, readiness o descarga, nunca por sesiones solo planificadas, omitidas o sin confirmar. El cambio de semana no reinicia la fatiga. No acumules la carga de sesiones perdidas. Si el plan original presupone una tirada realizada, contrasta el histórico y corrige esa justificación sin inventar actividad.";

/** Owner-scoped history shared by planning, adaptations and advice. */
export async function loadWorkoutContinuity(supabase: any, userId: string, firstDate: string, today: string) {
  const window = continuityWindow(firstDate);
  const [{ data: rows, error }, { data: activities, error: activitiesError }] = await Promise.all([
    supabase.from("workouts")
      .select("status,duration_minutes,actual_tss,rpe,feedback_notes,completed_at,plan")
      .eq("user_id", userId)
      .gte("plan->>scheduled_date", window.since)
      .lte("plan->>scheduled_date", window.until)
      .order("created_at", { ascending: false }),
    supabase.from("intervals_activities")
      .select("name,start_date,moving_time,icu_training_load")
      .eq("user_id", userId)
      .gte("start_date", `${window.since}T00:00:00`)
      .lte("start_date", `${window.until}T23:59:59`)
      .order("start_date", { ascending: false }),
  ]);
  if (error || activitiesError) throw new Error("No se pudo consultar la semana anterior; vuelve a intentarlo.");
  return { ...summarizeWorkoutContinuity(rows ?? [], firstDate, today), actividades_realizadas: activities ?? [] };
}

export function continuityPrompt(history: Awaited<ReturnType<typeof loadWorkoutContinuity>>) {
  return `${CONTINUITY_RULE}\nCONTINUIDAD CON LA SEMANA ANTERIOR (min_prescritos NO implica ejecución): ${JSON.stringify(history)}`;
}