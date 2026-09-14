import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const QuickInput = z.object({
  workout_id: z.string().uuid(),
  action: z.enum(["easier", "harder", "shorter", "skip"]),
  minutes: z.number().int().min(20).max(300).optional().nullable(),
});

/** Ajuste rápido desde la tarjeta del entrenamiento. */
export const quickAdjustWorkout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => QuickInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: w } = await supabase
      .from("workouts")
      .select("*")
      .eq("id", data.workout_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!w) throw new Error("Entrenamiento no encontrado");

    const { data: profile } = await supabase
      .from("profiles")
      .select("ftp,lthr,max_hr,intervals_athlete_id")
      .eq("id", userId)
      .maybeSingle();
    const refs = {
      ftp: profile?.ftp ?? null,
      lthr: (profile as any)?.lthr ?? null,
      maxHr: (profile as any)?.max_hr ?? null,
    };

    if (data.action === "skip") {
      const { skipWorkoutNow } = await import("./daily-adjust.server");
      return await skipWorkoutNow(supabase, userId, w);
    }

    const { adjustPlan } = await import("./adjust.server");
    const mode =
      data.action === "shorter"
        ? { minutes: data.minutes ?? Math.max(30, Math.round(w.duration_minutes * 0.6)) }
        : data.action === "easier"
          ? { easier: true }
          : { harder: true };

    const res = adjustPlan(w.plan, mode as any, refs);
    const { data: updated, error } = await supabase
      .from("workouts")
      .update({ plan: res.plan, duration_minutes: res.minutes, planned_tss: res.tss })
      .eq("id", w.id)
      .eq("user_id", userId)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);

    if ((profile as any)?.intervals_athlete_id && updated) {
      try {
        const { syncWorkoutEvent } = await import("./intervals.server");
        await syncWorkoutEvent(supabase, userId, updated);
      } catch { /* noop */ }
    }
    return { ok: true, minutes: res.minutes, tss: res.tss, notes: res.notes };
  });

/** Entrenos no realizados con propuesta de reubicación pendiente. */
export const listRescheduleProposals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("workouts")
      .select("id,duration_minutes,plan,status")
      .eq("user_id", userId)
      .eq("status", "skipped")
      .limit(50);
    return ((data ?? []) as any[])
      .filter((w) => (w.plan as any)?.reschedule_proposal?.to)
      .map((w) => ({
        id: w.id,
        title: (w.plan as any)?.title ?? (w.plan as any)?.name ?? "Sesión",
        original_date: (w.plan as any)?.original_date ?? (w.plan as any)?.scheduled_date ?? null,
        proposed_date: (w.plan as any)?.reschedule_proposal?.to as string,
        duration_minutes: w.duration_minutes,
      }));
  });

const ResolveInput = z.object({
  workout_id: z.string().uuid(),
  accept: z.boolean(),
});

/** Acepta o rechaza la reubicación propuesta de un entreno no realizado. */
export const resolveReschedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ResolveInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: w } = await supabase
      .from("workouts")
      .select("*")
      .eq("id", data.workout_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!w) throw new Error("Entrenamiento no encontrado");
    const plan: any = { ...((w.plan as any) ?? {}) };
    const to = plan?.reschedule_proposal?.to as string | undefined;

    if (!data.accept || !to) {
      plan.reschedule_proposal = null;
      await supabase.from("workouts").update({ plan }).eq("id", w.id).eq("user_id", userId);
      const { rebalanceWeekCore } = await import("./week-rebalance.server");
      const { weekStart, madridTodayISO } = await import("./training-load.server");
      const r = await rebalanceWeekCore(supabase, userId, weekStart(madridTodayISO()));
      return { ok: true, rescheduled: false, rebalanced: r };
    }

    plan.scheduled_date = to;
    plan.reschedule_proposal = null;
    plan.rescheduled_at = new Date().toISOString();
    const { data: updated } = await supabase
      .from("workouts")
      .update({ plan, status: "pending" })
      .eq("id", w.id)
      .eq("user_id", userId)
      .select()
      .maybeSingle();
    if (updated) {
      try {
        const { syncWorkoutEvent } = await import("./intervals.server");
        await syncWorkoutEvent(supabase, userId, updated);
      } catch { /* noop */ }
    }
    return { ok: true, rescheduled: true, date: to };
  });
