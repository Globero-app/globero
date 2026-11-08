import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ReportInput = z.object({ workout_id: z.string().uuid(), regenerate: z.boolean().optional() });
const FeedbackInput = z.object({ workout_id: z.string().uuid(), rpe: z.number().int().min(1).max(10), feel: z.number().int().min(1).max(5) });

export const generateWorkoutReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ReportInput.parse(data))
  .handler(async ({ data, context }) => {
    const { resolveWorkoutReportActivity } = await import("./workout-report-link.server");
    await resolveWorkoutReportActivity(context.supabase, context.userId, data.workout_id);
    const { generateAndNotifyWorkoutReport } = await import("./workout-report.server");
    const ok = await generateAndNotifyWorkoutReport(context.supabase, context.userId, data.workout_id, data.regenerate);
    if (!ok) throw new Error("No se ha podido generar el informe. Inténtalo de nuevo.");
    return { ok: true };
  });

export const saveWorkoutFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => FeedbackInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { resolveWorkoutReportActivity } = await import("./workout-report-link.server");
    const { feedbackId } = await resolveWorkoutReportActivity(supabase, userId, data.workout_id);
    if (feedbackId) {
      const { error } = await supabase.from("daily_activities").update({ rpe: data.rpe, feel: data.feel, feedback_completed: true })
        .eq("user_id", userId).eq("activity_id", feedbackId);
      if (error) throw new Error(error.message);
      // Preserve the existing Intervals feedback synchronization, when connected.
      const { data: profile } = await supabase.from("profiles").select("intervals_athlete_id,intervals_api_key,intervals_oauth").eq("id", userId).maybeSingle();
      const { credsFromProfile, intervalsUpdateActivity } = await import("./intervals.server");
      const creds = credsFromProfile(profile);
      if (creds) {
        try { await intervalsUpdateActivity(creds, feedbackId, { rpe: data.rpe, feel: data.feel }); }
        catch (error) { console.error("[workout-feedback] intervals sync", error); }
      }
    } else {
      const { data: workout, error: readError } = await supabase.from("workouts").select("plan").eq("user_id", userId).eq("id", data.workout_id).maybeSingle();
      if (readError || !workout) throw new Error("Entrenamiento no encontrado");
      const plan = workout.plan && typeof workout.plan === "object" && !Array.isArray(workout.plan) ? workout.plan : {};
      const { error } = await supabase.from("workouts").update({ plan: { ...plan, workout_feedback: { rpe: data.rpe, feel: data.feel } } })
        .eq("user_id", userId).eq("id", data.workout_id);
      if (error) throw new Error(error.message);
    }
    const { error: workoutError } = await supabase.from("workouts").update({ rpe: Math.max(1, Math.round(data.rpe / 2)) })
      .eq("user_id", userId).eq("id", data.workout_id);
    if (workoutError) throw new Error(workoutError.message);
    const { generateAndNotifyWorkoutReport } = await import("./workout-report.server");
    const report = await generateAndNotifyWorkoutReport(supabase, userId, data.workout_id);
    return { ok: true, report };
  });