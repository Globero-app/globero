import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const AdjustInput = z.object({
  minutes: z.number().int().min(20).max(300).optional().nullable(),
  easier: z.boolean().optional().default(false),
});

/** Sesión pendiente de hoy (para el módulo "Ajustar hoy"). */
export const getTodayWorkout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { todayWorkout } = await import("./adjust.server");
    const w = await todayWorkout(supabase, userId);
    if (!w) return null;
    return {
      id: w.id,
      duration_minutes: w.duration_minutes,
      training_type: w.training_type,
      bike_type: w.bike_type,
      planned_tss: w.planned_tss,
      plan: w.plan,
    };
  });

/** Recalcula la sesión de hoy con menos tiempo y/o menor intensidad. */
export const adjustTodayWorkout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AdjustInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { todayWorkout, adjustPlan } = await import("./adjust.server");
    const workout = await todayWorkout(supabase, userId);
    if (!workout) throw new Error("No tienes ninguna sesión pendiente para hoy");

    const { data: profile } = await supabase
      .from("profiles")
      .select("ftp,lthr,max_hr,intervals_athlete_id")
      .eq("id", userId)
      .maybeSingle();

    const { plan, minutes, tss, notes } = adjustPlan(workout.plan, {
      minutes: data.minutes ?? null,
      easier: !!data.easier,
    }, {
      ftp: profile?.ftp ?? null,
      lthr: (profile as any)?.lthr ?? null,
      maxHr: (profile as any)?.max_hr ?? null,
    });

    const { data: updated, error } = await supabase
      .from("workouts")
      .update({ plan, duration_minutes: minutes, planned_tss: tss })
      .eq("id", workout.id)
      .eq("user_id", userId)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);

    let synced = false;
    if (updated) {
      try {
        const { syncWorkoutEvent } = await import("./intervals.server");
        await syncWorkoutEvent(supabase, userId, updated);
        synced = true;
      } catch { /* noop */ }
    }

    return { ok: true, minutes, tss, notes, intervals_synced: synced, workout: updated };
  });
