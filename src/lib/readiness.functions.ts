import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SaveInput = z.object({
  score: z.number().int().min(1).max(5),
  note: z.string().max(500).optional().nullable(),
});

export const saveReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SaveInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { madridToday, callAI, AdaptSchema, pickTodayWorkout, buildAdaptPrompt, READINESS_LABELS } =
      await import("./readiness.server");
    const today = madridToday();

    const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();

    const { data: pending } = await supabase
      .from("workouts")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    const workout = pickTodayWorkout((pending ?? []) as any[], today);

    const { data: hist } = await supabase
      .from("readiness_entries")
      .select("entry_date,score")
      .eq("user_id", userId)
      .order("entry_date", { ascending: false })
      .limit(14);

    let action: "none" | "suggest_delete" | "adapted" = "none";
    let message = "";

    if (!workout) {
      action = "none";
      message =
        data.score === 1
          ? "No tienes ningún entrenamiento pendiente para hoy. Descansa y recupera."
          : `Registrado: ${READINESS_LABELS[data.score]}. No tienes entrenamiento pendiente para hoy.`;
    } else if (data.score === 1) {
      action = "suggest_delete";
      message = `Hoy no estás preparado para entrenar. Te sugiero eliminar la sesión "${workout.plan?.title ?? workout.plan?.name ?? "de hoy"}" y priorizar descanso, hidratación y sueño. Mañana volvemos.`;
    } else if (data.score === 3) {
      action = "none";
      message = `Readiness registrado: ${READINESS_LABELS[data.score]}. El entrenamiento de hoy se mantiene sin cambios.`;
    } else {
      // Ajuste determinista por reglas (sin llamada a la IA).
      const adapted = deterministicAdapt({ score: data.score, workout, profile });
      const newPlan = {
        ...(workout.plan as any),
        name: adapted.name,
        title: adapted.title,
        summary: adapted.summary,
        steps: adapted.steps,
        readiness_adapted: { score: data.score, date: today, message: adapted.message },
      };
      const durationMinutes = Math.max(
        15,
        Math.round(
          (adapted.steps as any[]).reduce((total, step) => total + (Number(step.duration_seconds) || 0), 0) / 60,
        ) || Math.round(adapted.duration_minutes || workout.duration_minutes),
      );
      const { estimatePlanTss } = await import("./training-load.server");
      const plannedTss = estimatePlanTss(
        newPlan,
        profile?.ftp ?? null,
        (profile as any)?.lthr ?? null,
        (profile as any)?.max_hr ?? null,
        durationMinutes,
      );
      const { data: updated, error: upErr } = await supabase
        .from("workouts")
        .update({
          plan: newPlan,
          duration_minutes: durationMinutes,
          planned_tss: plannedTss,
        })
        .eq("id", workout.id)
        .eq("user_id", userId)
        .select()
        .maybeSingle();
      if (upErr) throw new Error(upErr.message);
      if (!updated) throw new Error("No se pudo recuperar el entrenamiento adaptado");
      const { syncWorkoutEvent } = await import("./intervals.server");
      let intervalsEventId: string | null;
      try {
        intervalsEventId = await syncWorkoutEvent(supabase, userId, updated, { strict: true });
      } catch (syncError) {
        await supabase
          .from("workouts")
          .update({
            plan: workout.plan,
            duration_minutes: workout.duration_minutes,
            planned_tss: workout.planned_tss,
          })
          .eq("id", workout.id)
          .eq("user_id", userId);
        throw syncError;
      }
      action = "adapted";
      message = `${adapted.message}${intervalsEventId ? " Actualizado también en Intervals.icu." : ""}`;
    }

    const { error } = await supabase.from("readiness_entries").upsert(
      {
        user_id: userId,
        entry_date: today,
        score: data.score,
        note: data.note ?? null,
        ai_action: action,
        ai_message: message,
        workout_id: workout?.id ?? null,
      },
      { onConflict: "user_id,entry_date" },
    );
    if (error) throw new Error(error.message);

    return { ok: true, entry_date: today, action, message, workout_id: workout?.id ?? null };
  });

export const getRecentReadiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("readiness_entries")
      .select("entry_date,score,note,ai_action,ai_message,workout_id")
      .eq("user_id", userId)
      .order("entry_date", { ascending: false })
      .limit(14);
    return data ?? [];
  });

export const discardTodayWorkout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workout_id: z.string().uuid() }).parse(d))
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
      await removeWorkoutEvent(supabase, userId, workout, { strict: true });
    }
    const { error } = await supabase.from("workouts").delete().eq("id", data.workout_id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
