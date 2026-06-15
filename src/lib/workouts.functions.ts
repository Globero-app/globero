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

const TRAINING_TYPES = ["resistencia", "intervalos", "fuerza", "mixto"] as const;
const BIKE_TYPES = ["carretera", "gravel", "montana", "electrica"] as const;

const GenInput = z.object({
  training_type: z.enum(TRAINING_TYPES),
  bike_type: z.enum(BIKE_TYPES),
  count: z.number().int().min(1).max(10),
  duration_minutes: z.number().int().min(20).max(360),
  competition_id: z.string().uuid().optional().nullable(),
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

const PlanSchema = {
  type: "object",
  properties: {
    workouts: { type: "array", items: WorkoutSchema },
  },
  required: ["workouts"],
};

export const generateWorkouts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GenInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (!profile) throw new Error("Perfil no encontrado");

    const { data: recent } = await supabase
      .from("strava_activities")
      .select("name,distance,moving_time,total_elevation_gain,average_watts,suffer_score,start_date")
      .eq("user_id", userId)
      .order("start_date", { ascending: false })
      .limit(10);

    const { data: prevWorkouts } = await supabase
      .from("workouts")
      .select("training_type,duration_minutes,rpe,feedback_notes,plan,completed_at")
      .eq("user_id", userId)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(8);

    const ftp = profile.ftp ?? null;
    const weight = profile.weight_kg ?? 70;

    // Si hay competición, sobreescribimos cantidad y construimos plan periodizado
    let competition: any = null;
    let effectiveCount = data.count;
    let competitionBlock = "";
    if (data.competition_id) {
      const { data: comp } = await supabase
        .from("competitions")
        .select("name,date,type,distance_km,elevation_m,duration_hours,intensity,notes")
        .eq("id", data.competition_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (!comp) throw new Error("Competición no encontrada");
      competition = comp;

      const today = new Date();
      const eventDate = new Date(comp.date);
      const daysUntil = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntil <= 0) throw new Error("La competición ya ha pasado");
      const weeksUntil = Math.max(1, Math.ceil(daysUntil / 7));
      // Máximo 3 por semana, máximo 10 por generación
      effectiveCount = Math.min(10, Math.max(1, weeksUntil * 3));

      competitionBlock = `

COMPETICIÓN OBJETIVO:
- Nombre: ${comp.name}
- Fecha del evento: ${comp.date} (en ${daysUntil} días, ~${weeksUntil} semanas)
- Tipo: ${comp.type ?? "n/a"}
- Distancia: ${comp.distance_km ?? "n/a"} km · Desnivel: ${comp.elevation_m ?? "n/a"} m
- Duración estimada: ${comp.duration_hours ?? "n/a"} h · Intensidad: ${comp.intensity ?? "n/a"}
- Notas: ${comp.notes ?? "—"}

PERIODIZACIÓN OBLIGATORIA:
- Genera exactamente ${effectiveCount} entrenamientos (máximo 3 por semana durante ${weeksUntil} semanas hasta el día del evento).
- Distribuye los entrenamientos cronológicamente con campo "scheduled_date" (formato YYYY-MM-DD) entre HOY (${today.toISOString().slice(0, 10)}) y la fecha del evento, sin exceder 3 por semana.
- Combina resistencia, intervalos y fuerza según las demandas de la competición (más resistencia si es larga, más intervalos si es corta/intensa, fuerza si tiene mucho desnivel).
- Aplica progresión clásica: base → construcción → pico → tapering en la última semana antes del evento (volumen e intensidad bajos los últimos 5-7 días).
- El último entrenamiento debe ser corto y de activación 1-2 días antes del evento.`;
    }

    const prompt = `Eres un entrenador profesional de ciclismo. Diseña ${effectiveCount} entrenamiento(s) personalizados para este ciclista.

PERFIL:
- Edad: ${profile.age ?? "n/a"}, Sexo: ${profile.gender ?? "n/a"}, Peso: ${weight}kg
- FTP: ${ftp ?? "no especificado (usa HR o RPE en ese caso)"}W
- Tipo de bici: ${data.bike_type}

PETICIÓN:
- Foco: ${competition ? "preparación específica para la competición indicada" : data.training_type} ${data.training_type === "mixto" && !competition ? "(combina resistencia, intervalos y fuerza)" : ""}
- Duración objetivo de CADA entrenamiento: ${data.duration_minutes} minutos
- Cantidad: ${effectiveCount} entrenamiento(s) distintos
${competitionBlock}

ACTIVIDADES RECIENTES (Strava): ${recent && recent.length ? JSON.stringify(recent) : "ninguna"}

FEEDBACK PREVIO (RPE 1=fácil, 5=imposible): ${prevWorkouts && prevWorkouts.length ? JSON.stringify(prevWorkouts.map((w: any) => ({ tipo: w.training_type, min: w.duration_minutes, rpe: w.rpe, notas: w.feedback_notes }))) : "sin histórico"}

INSTRUCCIONES:
1. Cada entrenamiento DEBE durar aproximadamente ${data.duration_minutes} minutos (suma de duration_seconds de los steps).
2. Incluye SIEMPRE un calentamiento (warmup) y vuelta a la calma (cooldown).
3. Define cada step con duration_type='time' y duration_seconds, salvo descansos abiertos (open).
4. Si hay FTP, usa target='power' con target_low/high en VATIOS basados en zonas (Z2 56-75%, Z3 76-90%, Z4 91-105%, Z5 106-120%, Z6 121-150%).
5. Si NO hay FTP, usa target='hr' con bpm aproximados (180-edad como FCmax base) o target='open'.
6. Para entrenamientos de fuerza sobre la bici: usa cadencia baja (50-60rpm) con potencia Z3-Z4.
7. Nombre del entrenamiento (name) MÁXIMO 15 caracteres. Title puede ser largo.
8. Ajusta volumen/intensidad según feedback previo: si RPE medio >4 reduce intensidad, si <2 aumenta.
9. TODO en ESPAÑOL.
10. Los entrenamientos deben ser DISTINTOS y progresivos.
${competition ? '11. Cada workout DEBE incluir "scheduled_date" (YYYY-MM-DD) y "focus" coherente con la fase de periodización.' : ""}`;

    const result = await callAI([{ role: "user", content: prompt }], PlanSchema);

    // Guarda cada entrenamiento individualmente
    const rows = (result.workouts as any[]).map((w) => ({
      user_id: userId,
      training_type: competition ? (w.focus ?? data.training_type) : data.training_type,
      bike_type: data.bike_type,
      duration_minutes: data.duration_minutes,
      plan: { ...w, competition_id: data.competition_id ?? null, competition_name: competition?.name ?? null, scheduled_date: w.scheduled_date ?? null },
      status: "pending",
    }));
    const { data: inserted, error } = await supabase.from("workouts").insert(rows).select();
    if (error) throw new Error(error.message);
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
    const { error } = await supabase.from("workouts").delete().eq("id", data.workout_id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
