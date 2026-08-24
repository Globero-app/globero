import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const MODEL = "google/gemini-3-flash-preview";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function callAI(messages: any[], schema?: any): Promise<any> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY no configurada");
  const body: any = { model: MODEL, messages };
  if (schema) {
    body.tools = [{ type: "function", function: { name: "respond", description: "Respuesta estructurada", parameters: schema } }];
    body.tool_choice = { type: "function", function: { name: "respond" } };
  }
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("Demasiadas peticiones a la IA. Espera unos segundos.");
    if (res.status === 402) throw new Error("Sin créditos de IA disponibles.");
    throw new Error(`AI ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = await res.json();
  const msg = json.choices?.[0]?.message;
  if (schema && msg?.tool_calls?.[0]?.function?.arguments) {
    return JSON.parse(msg.tool_calls[0].function.arguments);
  }
  return msg?.content ?? "";
}

const BIKE_TYPES = ["carretera", "gravel", "montana", "electrica"] as const;

const GenInput = z.object({
  bike_type: z.enum(BIKE_TYPES),
  duration_minutes: z.number().int().min(20).max(360),
  competition_id: z.string().uuid().optional().nullable(),
  target_basis: z.enum(["power", "hr"]).optional().default("power"),
  // 0 = domingo … 6 = sábado (getDay)
  training_days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  long_ride_day: z.number().int().min(0).max(6).optional().nullable(),
  /** Nº máximo de sesiones (por defecto tantas como días marcados). */
  max_count: z.number().int().min(1).max(90).optional(),
  /** Plan nutricional asociado. */
  nutrition_enabled: z.boolean().optional().default(false),
  nutrition_goal: z.enum(["perdida_peso", "mantenimiento", "masa_muscular"]).optional().nullable(),
  /** Elimina los entrenamientos pendientes futuros antes de generar. */
  replace_pending: z.boolean().optional().default(false),
});



const StepSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "Nombre corto del bloque (≤15 chars), ej 'Calentamiento'" },
    description: { type: "string", description: "Instrucción breve para el ciclista" },
    duration_type: { type: "string", enum: ["time", "open"] },
    duration_seconds: { type: "number", description: "Segundos si duration_type=time" },
    target: { type: "string", enum: ["power", "hr", "cadence", "open"] },
    target_low: { type: "number", description: "Vatios, bpm o rpm (mínimo). 0 si open." },
    target_high: { type: "number", description: "Vatios, bpm o rpm (máximo). 0 si open." },
    intensity: { type: "string", enum: ["warmup", "active", "interval", "recovery", "rest", "cooldown"] },
  },
  required: ["name", "description", "duration_type", "target", "target_low", "target_high", "intensity"],
};

const WorkoutSchema = {
  type: "object",
  properties: {
    name: { type: "string", description: "Nombre del entrenamiento (≤15 chars para FIT)" },
    title: { type: "string", description: "Título largo descriptivo" },
    summary: { type: "string", description: "Resumen 2-3 frases del objetivo y estructura" },
    focus: { type: "string", enum: ["resistencia", "intervalos", "fuerza", "mixto"] },
    estimated_tss: { type: "number" },
    scheduled_date: { type: "string", description: "Fecha planificada YYYY-MM-DD (solo si hay competición objetivo, si no cadena vacía)" },
    steps: { type: "array", items: StepSchema, minItems: 3 },
  },
  required: ["name", "title", "summary", "focus", "steps"],
};

export const generateWorkouts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GenInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { generateWorkoutsCore } = await import("./workouts-gen.server");

    // Guarda las preferencias para la generación automática de los domingos
    await supabase
      .from("profiles")
      .update({
        weekly_training_days: data.training_days,
        weekly_long_ride_day: data.long_ride_day ?? null,
        weekly_bike_type: data.bike_type,
        weekly_duration_minutes: data.duration_minutes,
        weekly_target_basis: data.target_basis ?? "power",
        nutrition_plan_enabled: !!data.nutrition_enabled,
        ...(data.nutrition_enabled && data.nutrition_goal ? { nutrition_goal: data.nutrition_goal } : {}),
      })
      .eq("id", userId);

    if (data.replace_pending) {
      const today = new Date().toISOString().slice(0, 10);
      const { data: pending } = await supabase
        .from("workouts")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "pending");
      const toDelete = (pending ?? []).filter((w: any) => {
        const d = (w.plan as any)?.scheduled_date;
        return !d || d >= today;
      });
      if (toDelete.length) {
        const { removeWorkoutEvent } = await import("./intervals.server");
        for (const w of toDelete) {
          try { await removeWorkoutEvent(supabase, userId, w); } catch { /* noop */ }
        }
        await supabase.from("workouts").delete().in("id", toDelete.map((w: any) => w.id));
      }
    }

    const inserted = await generateWorkoutsCore(supabase, userId, {

      bike_type: data.bike_type,
      duration_minutes: data.duration_minutes,
      competition_id: data.competition_id ?? null,
      target_basis: data.target_basis ?? "power",
      training_days: data.training_days,
      long_ride_day: data.long_ride_day ?? null,
      max_count: data.max_count,
      nutrition_goal: data.nutrition_enabled ? (data.nutrition_goal ?? "mantenimiento") : null,
    });

    // Plan nutricional: se regenera para todas las semanas afectadas por los nuevos días
    let nutritionOn = data.nutrition_enabled;
    let nutritionGoal: string = data.nutrition_goal ?? "mantenimiento";
    if (!nutritionOn) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("nutrition_plan_enabled,nutrition_goal")
        .eq("id", userId)
        .maybeSingle();
      if (prof?.nutrition_plan_enabled) {
        nutritionOn = true;
        nutritionGoal = prof.nutrition_goal ?? "mantenimiento";
      }
    }

    if (nutritionOn) {
      try {
        const { generateWeeklyNutritionCore, weekStartISO } = await import("./nutrition-gen.server");
        const dates = (inserted ?? [])
          .map((w: any) => w.plan?.scheduled_date)
          .filter(Boolean) as string[];
        const weeks = Array.from(
          new Set(dates.map((d) => weekStartISO(new Date(`${d}T12:00:00Z`)))),
        ).sort();
        if (!weeks.length) weeks.push(weekStartISO(new Date()));
        for (const week_start of weeks.slice(0, 4)) {
          await generateWeeklyNutritionCore(supabase, userId, { goal: nutritionGoal, week_start });
        }
      } catch (e) {
        console.error("nutrition-plan", e);
      }
    }


    return inserted;
  });


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
    return { ok: true };
  });

/* ============================================================
   Cambiar un entrenamiento a rodillo (indoor), 60-90 min
   ============================================================ */

const TrainerInput = z.object({ workout_id: z.string().uuid() });

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

    const result = await callAI([{ role: "user", content: prompt }], WorkoutSchema);

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

    const { data: updated, error } = await supabase
      .from("workouts")
      .update({ plan: newPlan, duration_minutes: mins, bike_type: "rodillo" })
      .eq("id", workout.id)
      .eq("user_id", userId)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);

    const { syncWorkoutEvent } = await import("./intervals.server");
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
    if (!backup?.plan) throw new Error("Este entrenamiento no tiene versión de exterior guardada");

    const restored = {
      ...backup.plan,
      indoor: false,
      converted_from_outdoor: false,
      outdoor_backup: null,
      scheduled_date: plan.scheduled_date ?? backup.plan.scheduled_date ?? null,
      intervals_event_id: plan.intervals_event_id ?? null,
    };

    const { data: updated, error } = await supabase
      .from("workouts")
      .update({
        plan: restored,
        duration_minutes: backup.duration_minutes ?? workout.duration_minutes,
        bike_type: backup.bike_type ?? "carretera",
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

/* ============================================================
   Programar el Test de FTP en el calendario (+ Intervals.icu)
   ============================================================ */

const FtpTestInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  basis: z.enum(["power", "hr"]),
});

function buildFtpTestSteps(basis: "power" | "hr", ftp: number, hrRef: number) {
  const p = (pct: number) => Math.round((pct / 100) * ftp);
  const h = (pct: number) => Math.round((pct / 100) * hrRef);
  const v = (pctPower: number, pctHr: number) =>
    basis === "hr"
      ? { target: "hr", target_low: h(pctHr), target_high: h(pctHr + 6) }
      : { target: "power", target_low: p(pctPower), target_high: p(pctPower + 15) };

  const steps: any[] = [
    { name: "Calentamiento", description: "Z1-Z2, cadencia 85-95 rpm", duration_type: "time", duration_seconds: 600, intensity: "warmup", ...v(45, 60) },
  ];
  for (let i = 0; i < 3; i++) {
    steps.push({ name: `Acel ${i + 1}`, description: "1 min alta cadencia 100-110 rpm", duration_type: "time", duration_seconds: 60, intensity: "interval", ...v(75, 82) });
    steps.push({ name: "Recuperacion", description: "1 min suave", duration_type: "time", duration_seconds: 60, intensity: "recovery", ...v(50, 65) });
  }
  steps.push({ name: "Rodaje", description: "Baja pulsaciones antes del bloque duro", duration_type: "time", duration_seconds: 300, intensity: "active", ...v(45, 62) });
  steps.push({
    name: "Test 20 min",
    description: basis === "hr"
      ? "Máximo esfuerzo sostenible 20 min. Apunta la FC media (LTHR ≈ 95% de esa media)."
      : "Máximo esfuerzo sostenible 20 min. Apunta la potencia media (FTP ≈ 95% de esa media).",
    duration_type: "time", duration_seconds: 1200, intensity: "interval", ...v(95, 95),
  });
  steps.push({ name: "Vuelta calma", description: "Z1 muy suave", duration_type: "time", duration_seconds: 600, intensity: "cooldown", ...v(40, 55) });
  return steps;
}

export const scheduleFtpTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => FtpTestInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("ftp,max_hr,lthr,intervals_athlete_id")
      .eq("id", userId)
      .maybeSingle();

    const ftp = profile?.ftp && profile.ftp > 0 ? profile.ftp : 200;
    const lthr = (profile as any)?.lthr ?? null;
    const maxHr = (profile as any)?.max_hr ?? null;
    const hrRef = lthr && lthr > 0 ? lthr : maxHr && maxHr > 0 ? Math.round(maxHr * 0.92) : 165;

    const steps = buildFtpTestSteps(data.basis, ftp, hrRef);
    const totalSec = steps.reduce((acc, s) => acc + (Number(s.duration_seconds) || 0), 0);

    const plan = {
      name: "Test FTP",
      title: data.basis === "hr" ? "Test de umbral 20 min (FC)" : "Test de FTP 20 min (potencia)",
      summary: data.basis === "hr"
        ? `Protocolo de 20 min para estimar tu LTHR por frecuencia cardíaca. Referencia actual: ${hrRef} ppm. LTHR ≈ 95% de la FC media de los 20 min.`
        : `Protocolo Coggan de 20 min para estimar tu FTP. Referencia actual: ${ftp} W. FTP ≈ 95% de la potencia media de los 20 min.`,
      focus: "intervalos",
      steps,
      target_basis: data.basis,
      scheduled_date: data.date,
      is_ftp_test: true,
    };

    const { data: inserted, error } = await supabase
      .from("workouts")
      .insert({
        user_id: userId,
        training_type: "intervalos",
        bike_type: "carretera",
        duration_minutes: Math.round(totalSec / 60),
        plan,
        status: "pending",
      })
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);

    let synced = false;
    if (profile?.intervals_athlete_id) {
      const { syncWorkoutEvent } = await import("./intervals.server");
      synced = !!(await syncWorkoutEvent(supabase, userId, inserted));
    }
    return { ok: true, workout: inserted, intervals_synced: synced };
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
