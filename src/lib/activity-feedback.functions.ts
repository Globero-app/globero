import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/** Registro pendiente de valorar (RPE/Feel) más reciente */
export const getPendingActivityFeedback = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("daily_activities")
      .select("id, activity_id, date")
      .eq("user_id", userId)
      .eq("feedback_completed", false)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ?? null;
  });

const Input = z.object({
  activity_id: z.string().min(1),
  rpe: z.number().int().min(1).max(10),
  feel: z.number().int().min(1).max(5),
});

export const saveActivityFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("daily_activities")
      .update({ rpe: data.rpe, feel: data.feel, feedback_completed: true })
      .eq("user_id", userId)
      .eq("activity_id", data.activity_id);
    if (error) throw new Error(error.message);

    const { data: profile } = await supabase
      .from("profiles")
      .select("intervals_athlete_id,intervals_api_key")
      .eq("id", userId)
      .maybeSingle();

    const { credsFromProfile, intervalsUpdateActivity } = await import("./intervals.server");
    const creds = credsFromProfile(profile);
    let synced = false;
    if (creds) {
      try {
        await intervalsUpdateActivity(creds, data.activity_id, { rpe: data.rpe, feel: data.feel });
        synced = true;
      } catch (e) {
        console.error("intervals activity update error", e);
      }
    }
    // Informe IA del entrenamiento enlazado a esta actividad
    let report = false;
    try {
      const { data: candidates } = await supabase
        .from("workouts")
        .select("id,plan")
        .eq("user_id", userId)
        .eq("status", "completed")
        .order("updated_at", { ascending: false })
        .limit(50);
      const match = (candidates ?? []).find(
        (w: any) => String((w.plan as any)?.strava_activity_id ?? "") === String(data.activity_id),
      );
      if (match) {
        await supabase
          .from("workouts")
          .update({ rpe: Math.max(1, Math.min(5, Math.round(data.rpe / 2))) })
          .eq("id", match.id)
          .eq("user_id", userId);
        const { generateAndNotifyWorkoutReport } = await import("./workout-report.server");
        report = await generateAndNotifyWorkoutReport(supabase, userId, match.id);
      }
    } catch (e) {
      console.error("workout report error", e);
    }

    return { ok: true, synced, report };
  });

