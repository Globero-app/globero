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
  count: z.number().int().min(1).max(30),
  duration_minutes: z.number().int().min(20).max(360),
  competition_id: z.string().uuid().optional().nullable(),
  target_basis: z.enum(["power", "hr"]).optional().default("power"),
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

    const { data: pastRaces } = await supabase
      .from("competitions")
      .select("name,date,type,distance_km,elevation_m,race_feedback")
      .eq("user_id", userId)
      .not("race_feedback", "is", null)
      .order("date", { ascending: false })
      .limit(5);

    // Readiness reciente (14 días) — se usa para modular la intensidad de la sesión del día
    const { data: readinessRows } = await supabase
      .from("readiness_entries")
      .select("entry_date,score,note")
      .eq("user_id", userId)
      .order("entry_date", { ascending: false })
      .limit(14);
    const readinessArr = (readinessRows ?? []) as Array<{ entry_date: string; score: number; note: string | null }>;
    const madridToday = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    const todayReadiness = readinessArr.find((h) => h.entry_date === madridToday) ?? null;
    const READINESS_TEXT: Record<number, string> = {
      1: "Nada preparado → NO planifiques sesión hoy: descanso total o movilidad suave",
      2: "Preparado para un paseo relajado → rodaje Z1-Z2 corto, sin intervalos",
      3: "Preparado para un entreno normal → sesión estándar planificada",
      4: "Preparado para un entreno exigente → puedes subir la carga o añadir calidad",
      5: "Preparado para dar lo máximo → sesión clave, máxima intensidad razonable",
    };
    const readinessStatus = todayReadiness
      ? `${todayReadiness.score}/5 — ${READINESS_TEXT[todayReadiness.score]}${todayReadiness.note ? ` (nota: ${todayReadiness.note})` : ""}`
      : "sin respuesta hoy";


    const ftp = profile.ftp ?? null;
    const weight = profile.weight_kg ?? 70;
    const maxHr: number | null = (profile as any).max_hr ?? null;
    const lthr: number | null = (profile as any).lthr ?? null;
    // Si el usuario pide FC pero no hay datos de FC, caemos a potencia si hay FTP
    const basis: "power" | "hr" = data.target_basis === "hr" && !maxHr && !lthr && ftp ? "power" : (data.target_basis ?? "power");
    const basisBlock = basis === "hr"
      ? `BASE DE PRESCRIPCIÓN: FRECUENCIA CARDÍACA (obligatorio)
- FC máx: ${maxHr ?? "no especificada (estima 220-edad)"} ppm · LTHR (umbral): ${lthr ?? "no especificado (estima 92% de FC máx)"} ppm
- TODOS los steps con esfuerzo deben usar target='hr' con target_low/target_high en PPM (bpm). No uses target='power' en ningún step.
- Zonas sobre LTHR: Z1 <81%, Z2 81-89%, Z3 90-93%, Z4 94-99%, Z5 100-102%, Z5b >102%. Si solo hay FC máx, usa % de FC máx: Z1 <68%, Z2 69-83%, Z3 84-94%, Z4 95-105%.
- Menciona en "summary" que la sesión está prescrita por frecuencia cardíaca.`
      : `BASE DE PRESCRIPCIÓN: POTENCIA / FTP (obligatorio)
- FTP: ${ftp ?? "no especificado"}W
- TODOS los steps con esfuerzo deben usar target='power' con target_low/target_high en VATIOS calculados sobre el FTP (Z2 56-75%, Z3 76-90%, Z4 91-105%, Z5 106-120%, Z6 121-150%).
- Solo si NO hay FTP disponible usa target='hr' o target='open'.
- Menciona en "summary" que la sesión está prescrita por potencia.`;

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
      // Hasta 3 por semana, hasta 30 por generación, respetando el máximo pedido por el usuario
      effectiveCount = Math.min(data.count, 30, Math.max(1, weeksUntil * 3));

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
- FTP: ${ftp ?? "no especificado"}W · FC máx: ${maxHr ?? "n/a"} ppm · LTHR: ${lthr ?? "n/a"} ppm
- Tipo de bici: ${data.bike_type}

${basisBlock}

PETICIÓN:
- Foco: ${competition ? "preparación específica para la competición indicada" : data.training_type} ${data.training_type === "mixto" && !competition ? "(combina resistencia, intervalos y fuerza)" : ""}
- Duración objetivo de CADA entrenamiento: ${data.duration_minutes} minutos
- Cantidad: ${effectiveCount} entrenamiento(s) distintos
${competitionBlock}

ACTIVIDADES RECIENTES (Strava): ${recent && recent.length ? JSON.stringify(recent) : "ninguna"}

FEEDBACK PREVIO (RPE 1=fácil, 5=imposible): ${prevWorkouts && prevWorkouts.length ? JSON.stringify(prevWorkouts.map((w: any) => ({ tipo: w.training_type, min: w.duration_minutes, rpe: w.rpe, notas: w.feedback_notes }))) : "sin histórico"}

CARRERAS PASADAS (post-race feedback del usuario, úsalo para ajustar volumen, intensidad y enfoque en nutrición/ritmo): ${pastRaces && pastRaces.length ? JSON.stringify(pastRaces) : "sin carreras previas con feedback"}

READINESS DE HOY (${madridToday}, España peninsular): ${readinessStatus}
HISTÓRICO READINESS 14 días: ${readinessArr.length ? JSON.stringify(readinessArr) : "sin registros"}

INSTRUCCIONES:
1. Cada entrenamiento DEBE durar aproximadamente ${data.duration_minutes} minutos (suma de duration_seconds de los steps).
2. Incluye SIEMPRE un calentamiento (warmup) y vuelta a la calma (cooldown).
3. Define cada step con duration_type='time' y duration_seconds, salvo descansos abiertos (open).
4. Respeta ESTRICTAMENTE la BASE DE PRESCRIPCIÓN indicada arriba (${basis === "hr" ? "frecuencia cardíaca" : "potencia/FTP"}) en todos los steps.
5. Los descansos totales pueden usar target='open'.
6. Para entrenamientos de fuerza sobre la bici: usa cadencia baja (50-60rpm) con intensidad Z3-Z4 en la base de prescripción indicada.
7. Nombre del entrenamiento (name) MÁXIMO 15 caracteres. Title puede ser largo.
8. Ajusta volumen/intensidad según feedback previo: si RPE medio >4 reduce intensidad, si <2 aumenta.
9. TODO en ESPAÑOL.
10. Los entrenamientos deben ser DISTINTOS y progresivos.
11. LÓGICA DE MEJORA PROGRESIVA: ordena los ${effectiveCount} entrenamientos como un microciclo/mesociclo con progresión clara — arranque adaptativo, subida de carga, sesiones clave, y recuperación intercalada cada 3-4 días. La duración objetivo (${data.duration_minutes} min) es la referencia; puedes variar ±15% para respetar la progresión.
12. TIPO DE BICI (${data.bike_type}): adapta el enfoque al material — carretera (rodaje eficiente, cadencia alta), gravel (mixto asfalto+tierra, transiciones), montana (fuerza específica, técnica en subida, ritmo variable), electrica (foco en cadencia y FC, la potencia queda ayudada por el motor así que trabaja FC y duración).
13. FOCO SELECCIONADO (${competition ? "competición" : data.training_type}): construye el bloque respetando ese foco — resistencia = predominio Z2 con Z3 puntual, intervalos = Z4-Z5 con estructura clara de series/recuperación, fuerza = cadencia 50-60rpm con Z3-Z4, mixto = alterna los tres tipos entre sesiones.
14. MODULACIÓN POR READINESS: la PRIMERA sesión del plan (la más próxima en el tiempo) debe ajustarse al Readiness de HOY:
   - 1 (nada preparado) → propón descanso/movilidad muy suave y dilo en "summary".
   - 2 → rodaje Z1-Z2 corto sin intervalos, reduce duración un 30-40%.
   - 3 → mantén el plan estándar.
   - 4 o 5 → puedes mantener o subir la carga (bloque de calidad si toca sesión clave).
   Las sesiones posteriores se planifican con la lógica normal; el readiness del día influye SOLO en la primera.
${competition ? '11. Cada workout DEBE incluir "scheduled_date" (YYYY-MM-DD) y "focus" coherente con la fase de periodización.' : ""}`;

    const result = await callAI([{ role: "user", content: prompt }], PlanSchema);

    // Guarda cada entrenamiento individualmente
    const rows = (result.workouts as any[]).map((w) => ({
      user_id: userId,
      training_type: competition ? (w.focus ?? data.training_type) : data.training_type,
      bike_type: data.bike_type,
      duration_minutes: data.duration_minutes,
      plan: { ...w, target_basis: basis, competition_id: data.competition_id ?? null, competition_name: competition?.name ?? null, scheduled_date: w.scheduled_date ?? null },
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
