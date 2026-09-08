import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { callAI } from "./ai-call.server";
import { WorkoutSchema } from "./workouts-schemas";

const TrainerInput = z.object({ workout_id: z.string().uuid() });

/** Cambiar un entrenamiento a rodillo (indoor), 60-90 min */
export const convertWorkoutToTrainer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TrainerInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: workout } = await supabase
      .from("workouts")
      .select("*")
      .eq("id", data.workout_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!workout) throw new Error("Entrenamiento no encontrado");

    const { data: profile } = await supabase
      .from("profiles")
      .select("ftp,max_hr,lthr")
      .eq("id", userId)
      .maybeSingle();

    const plan: any = workout.plan ?? {};
    const basis: "power" | "hr" = plan.target_basis === "hr" ? "hr" : "power";

    const prompt = `Eres un entrenador profesional de ciclismo. Adapta el siguiente entrenamiento de exterior para hacerlo EN RODILLO (indoor trainer).

ENTRENAMIENTO ORIGINAL (JSON):
${JSON.stringify({ title: plan.title, summary: plan.summary, focus: plan.focus, duration_minutes: workout.duration_minutes, steps: plan.steps ?? [] })}

REFERENCIAS DEL CICLISTA: FTP ${profile?.ftp ?? "n/a"}W · FC máx ${(profile as any)?.max_hr ?? "n/a"} ppm · LTHR ${(profile as any)?.lthr ?? "n/a"} ppm

REGLAS OBLIGATORIAS:
1. Duración TOTAL entre 60 y 90 minutos (la suma de duration_seconds debe estar entre 3600 y 5400 s). Nunca más de 90 min.
2. Mantén el objetivo fisiológico del entrenamiento original; si el original era más largo, condensa el trabajo (más densidad, menos rodaje).
3. Base de prescripción: ${basis === "hr" ? "FRECUENCIA CARDÍACA (target='hr' en ppm)" : "POTENCIA/FTP (target='power' en vatios)"} en todos los steps con esfuerzo.
4. Sin descansos abiertos largos: en rodillo usa siempre duration_type='time'.
5. Incluye calentamiento y vuelta a la calma. Añade cambios de cadencia para evitar monotonía.
6. name MÁXIMO 15 caracteres. Todo en ESPAÑOL. Indica en "summary" que es una sesión de rodillo.`;

    const result = await callAI([{ role: "user", content: prompt }], WorkoutSchema, { fn: "workout-custom", userId });

    const steps = (result.steps ?? []) as any[];
    const totalSec = steps.reduce((acc, s) => acc + (Number(s.duration_seconds) || 0), 0);
    const mins = Math.min(90, Math.max(60, totalSec > 0 ? Math.round(totalSec / 60) : 75));

    const newPlan = {
      ...plan,
      ...result,
      outdoor_backup: plan.outdoor_backup ?? {
        plan: { ...plan },
        duration_minutes: workout.duration_minutes,
        bike_type: workout.bike_type,
      },
      name: (result.name ?? plan.name ?? "Rodillo").slice(0, 15),
      title: result.title ?? plan.title,
      steps,
      target_basis: basis,
      indoor: true,
      scheduled_date: plan.scheduled_date ?? null,
      intervals_event_id: plan.intervals_event_id ?? null,
      converted_from_outdoor: true,
    };

    const { estimatePlanTss } = await import("./training-load.server");
    const tss = estimatePlanTss(newPlan, profile?.ftp ?? null, (profile as any)?.lthr ?? null, (profile as any)?.max_hr ?? null, mins);
    newPlan.estimated_tss = tss;

    const { data: updated, error } = await supabase
      .from("workouts")
      .update({ plan: newPlan, duration_minutes: mins, bike_type: "rodillo", planned_tss: tss, actual_tss: null, actual_if: null, compliance: null })
      .eq("id", workout.id)
      .eq("user_id", userId)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);

    const { syncWorkoutEvent, intervalsPushZones } = await import("./intervals.server");
    // Asegura que VirtualRide tenga el mismo FTP que Ride para que los porcentajes
    // se rendericen correctamente en Intervals.icu.
    try { await intervalsPushZones(supabase, userId); } catch (e) { console.error("push zones on trainer", e); }
    const eventId = await syncWorkoutEvent(supabase, userId, updated);

    return { ok: true, workout: updated, intervals_synced: !!eventId };
  });

/** Revertir un entrenamiento de rodillo a su versión original de exterior */
export const revertWorkoutToOutdoor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TrainerInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: workout } = await supabase
      .from("workouts")
      .select("*")
      .eq("id", data.workout_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!workout) throw new Error("Entrenamiento no encontrado");

    const plan: any = workout.plan ?? {};
    const backup = plan.outdoor_backup;
    const basePlan = backup?.plan ?? plan;

    const restored = {
      ...basePlan,
      indoor: false,
      converted_from_outdoor: false,
      outdoor_backup: null,
      scheduled_date: plan.scheduled_date ?? basePlan.scheduled_date ?? null,
      intervals_event_id: plan.intervals_event_id ?? null,
    };

    const mins = backup?.duration_minutes ?? workout.duration_minutes ?? 60;

    const { data: profile } = await supabase
      .from("profiles")
      .select("ftp,max_hr,lthr")
      .eq("id", userId)
      .maybeSingle();
    const { estimatePlanTss } = await import("./training-load.server");
    const tss = estimatePlanTss(restored, profile?.ftp ?? null, (profile as any)?.lthr ?? null, (profile as any)?.max_hr ?? null, mins);
    restored.estimated_tss = tss;

    const { data: updated, error } = await supabase
      .from("workouts")
      .update({
        plan: restored,
        duration_minutes: mins,
        bike_type: backup?.bike_type ?? "carretera",
        planned_tss: tss,
        actual_tss: null,
        actual_if: null,
        compliance: null,
      })
      .eq("id", workout.id)
      .eq("user_id", userId)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);

    const { syncWorkoutEvent } = await import("./intervals.server");
    const eventId = await syncWorkoutEvent(supabase, userId, updated);

    return { ok: true, workout: updated, intervals_synced: !!eventId };
  });
