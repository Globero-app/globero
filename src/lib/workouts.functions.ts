import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export { generateWorkouts } from "./workouts-generate.functions";
export { convertWorkoutToTrainer, revertWorkoutToOutdoor } from "./workouts-trainer.functions";
export { scheduleFtpTest } from "./workouts-ftp.functions";

const CompleteInput = z.object({
  workout_id: z.string().uuid(),
  rpe: z.number().int().min(1).max(5),
  notes: z.string().max(1000).optional(),
});

export const completeWorkout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CompleteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("workouts")
      .update({
        status: "completed",
        rpe: data.rpe,
        feedback_notes: data.notes ?? null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", data.workout_id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const DeleteInput = z.object({ workout_id: z.string().uuid() });
export const deleteWorkout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DeleteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: workout } = await supabase
      .from("workouts")
      .select("*")
      .eq("id", data.workout_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (workout) {
      const { removeWorkoutEvent } = await import("./intervals.server");
      await removeWorkoutEvent(supabase, userId, workout);
    }
    const { error } = await supabase.from("workouts").delete().eq("id", data.workout_id).eq("user_id", userId);
    if (error) throw new Error(error.message);

    // Semana adaptable: redistribuye la carga restante de esa semana
    let rebalanced: any = null;
    const schedDate = (workout?.plan as any)?.scheduled_date as string | undefined;
    if (workout && workout.status === "pending" && schedDate) {
      try {
        const { rebalanceWeekCore } = await import("./week-rebalance.server");
        rebalanced = await rebalanceWeekCore(supabase, userId, schedDate);
      } catch (e) {
        console.error("week-rebalance", e);
      }
    }
    return { ok: true, rebalanced };
  });

const RebalanceInput = z.object({
  week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** Redistribuir manualmente la carga de la semana actual */
export const rebalanceWeek = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RebalanceInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { madridTodayISO } = await import("./training-load.server");
    const { rebalanceWeekCore } = await import("./week-rebalance.server");
    return rebalanceWeekCore(supabase, userId, data.week_start ?? madridTodayISO());
  });

/** Métricas de carga de entrenamiento (CTL/ATL/TSB) y prescripción semanal */
export const getTrainingLoad = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { buildTrainingLoad } = await import("./training-load.server");
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    const load = await buildTrainingLoad(supabase, userId, profile);
    const { data: block } = await supabase
      .from("training_blocks")
      .select("focus,week_index,start_date,target_tss")
      .eq("user_id", userId)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { load, block: block ?? null };
  });
