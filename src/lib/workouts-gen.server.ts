import { fetchDailyWeather, adviseForWorkout } from "./weather-daily.server";
import type { WeatherDay } from "./weather";

import { callAI } from "./ai-call.server";

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
    session_goal: {
      type: "string",
      enum: ["vo2max", "umbral", "tempo", "resistencia", "neuromuscular", "fuerza_resistencia", "recuperacion"],
      description: "Objetivo fisiológico principal de ESTA sesión (obligatorio, nunca mixto)",
    },
    energy_system: {
      type: "string",
      enum: ["aerobico", "umbral", "vo2", "anaerobico", "neuromuscular"],
      description: "Sistema energético dominante de la sesión",
    },
    why: { type: "string", description: "Una frase: por qué esta sesión hoy para este ciclista" },
    estimated_tss: { type: "number" },
    scheduled_date: { type: "string", description: "Fecha planificada YYYY-MM-DD" },
    steps: { type: "array", items: StepSchema, minItems: 3 },
  },
  required: ["name", "title", "summary", "focus", "session_goal", "energy_system", "why", "steps"],
};


const PlanSchema = {
  type: "object",
  properties: { workouts: { type: "array", items: WorkoutSchema } },
  required: ["workouts"],
};

const DAY_NAMES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** Genera las próximas fechas (YYYY-MM-DD) que caen en los días permitidos, empezando mañana (o desde `from`). */
export function buildSchedule(days: number[], count: number, maxDate?: string, from?: Date): { date: string; dow: number }[] {
  const allowed = new Set(days);
  const out: { date: string; dow: number }[] = [];
  const cursor = from ? new Date(from) : new Date();
  cursor.setUTCHours(12, 0, 0, 0);
  for (let i = 0; i < 730 && out.length < count; i++) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const iso = cursor.toISOString().slice(0, 10);
    if (maxDate && iso > maxDate) break;
    if (allowed.has(cursor.getUTCDay())) out.push({ date: iso, dow: cursor.getUTCDay() });
  }
  return out;
}

export type GenCoreInput = {
  bike_type: string;
  duration_minutes: number;
  competition_id?: string | null;
  target_basis?: "power" | "hr";
  training_days: number[];
  long_ride_day?: number | null;
  /** Fecha base: se planifica a partir del día siguiente. */
  from?: Date;
  /** Fecha límite (inclusive) YYYY-MM-DD: no se planifica más allá. */
  until?: string | null;
  /** Tope de sesiones (por defecto, tantas como días de entreno). */
  max_count?: number;
  /** Objetivo del plan nutricional para adaptar los entrenamientos. */
  nutrition_goal?: string | null;
};

const NUTRITION_TRAINING_RULES: Record<string, string> = {
  perdida_peso:
    "OBJETIVO PÉRDIDA DE PESO: prioriza volumen aeróbico Z2 y sesiones algo más largas a intensidad moderada para maximizar oxidación de grasas; incluye 1 sesión de calidad por semana (no más) y bloques de fuerza a baja cadencia; evita acumular sesiones muy intensas seguidas.",
  mantenimiento:
    "OBJETIVO MANTENIMIENTO: equilibrio clásico 80/20 entre volumen aeróbico e intensidad, manteniendo la carga estable respecto a semanas anteriores.",
  masa_muscular:
    "OBJETIVO GANAR MASA MUSCULAR: enfatiza fuerza específica sobre la bici (cadencia 50-60 rpm, Z3-Z4, series de 5-10 min), sprints y esfuerzos neuromusculares cortos; reduce el volumen puramente aeróbico y deja recuperación suficiente entre sesiones de fuerza.",
};

/** Núcleo de generación de entrenamientos (siempre plan MIXTO). Reutilizable por el cron semanal. */
export async function generateWorkoutsCore(supabase: any, userId: string, input: GenCoreInput) {
  const { buildTrainingLoad, prescribeWeek, loadPromptBlock, weekStart } = await import("./training-load.server");
  const { validateWorkout, enforceWeeklyTss, avoidBackToBackHard, enforcePolarized } = await import("./workout-validator.server");
  const { refreshAthleteProfile, athletePromptBlock, minutesForDay } = await import("./athlete-profile.server");
  type AthleteProfile = Awaited<ReturnType<typeof refreshAthleteProfile>>;


  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (!profile) throw new Error("Perfil no encontrado");


  const { data: recent } = await supabase
    .from("intervals_activities")
    .select("name,distance,moving_time,total_elevation_gain,average_watts,icu_training_load,start_date")
    .eq("user_id", userId)
    .order("start_date", { ascending: false })
    .limit(10);

  const { data: prevWorkouts } = await supabase
    .from("workouts")
    .select("training_type,duration_minutes,rpe,feedback_notes,plan,completed_at,planned_tss,actual_tss,compliance")
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(12);

  const { data: pastRaces } = await supabase
    .from("competitions")
    .select("name,date,type,distance_km,elevation_m,race_feedback")
    .eq("user_id", userId)
    .not("race_feedback", "is", null)
    .order("date", { ascending: false })
    .limit(5);

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
  const maxHr: number | null = profile.max_hr ?? null;
  const lthr: number | null = profile.lthr ?? null;
  const basis: "power" | "hr" = input.target_basis === "hr" && !maxHr && !lthr && ftp ? "power" : (input.target_basis ?? "power");
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

  let competition: any = null;
  let competitionBlock = "";
  if (input.competition_id) {
    const { data: comp } = await supabase
      .from("competitions")
      .select("name,date,type,distance_km,elevation_m,duration_hours,intensity,notes")
      .eq("id", input.competition_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!comp) throw new Error("Competición no encontrada");
    competition = comp;
    const today = new Date();
    const eventDate = new Date(comp.date);
    const daysUntil = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntil <= 0) throw new Error("La competición ya ha pasado");
    const weeksUntil = Math.max(1, Math.ceil(daysUntil / 7));
    competitionBlock = `

COMPETICIÓN OBJETIVO:
- Nombre: ${comp.name}
- Fecha del evento: ${comp.date} (en ${daysUntil} días, ~${weeksUntil} semanas)
- Tipo: ${comp.type ?? "n/a"}
- Distancia: ${comp.distance_km ?? "n/a"} km · Desnivel: ${comp.elevation_m ?? "n/a"} m
- Duración estimada: ${comp.duration_hours ?? "n/a"} h · Intensidad: ${comp.intensity ?? "n/a"}
- Notas: ${comp.notes ?? "—"}

PERIODIZACIÓN OBLIGATORIA:
- Aplica progresión clásica: base → construcción → pico → tapering en la última semana antes del evento.
- El último entrenamiento antes del evento debe ser corto y de activación.`;
  }

  const chosenDays = input.training_days.slice().sort((a, b) => a - b);
  const maxCount = input.max_count ?? chosenDays.length;
  const limits = [competition?.date, input.until].filter(Boolean) as string[];
  const maxDate = limits.length ? limits.sort()[0] : undefined;
  const schedule = buildSchedule(chosenDays, maxCount, maxDate, input.from);
  if (!schedule.length) throw new Error("No hay días de entrenamiento disponibles");
  const effectiveCount = schedule.length;
  const longDay = input.long_ride_day ?? null;

  // ---- Perfil tipológico y meteorología ----
  const cyclistType = (profile.cyclist_type as string) ?? "mixto";
  const strengths = (profile.strengths as string | null) ?? "";
  const weaknesses = (profile.weaknesses as string | null) ?? "";
  const locationCity = (profile.location_city as string | null) ?? "";
  const windThreshold = Number(profile.weather_wind_threshold_kmh ?? 25);
  const autoIndoor = (profile.weather_auto_indoor as boolean | null) ?? true;

  let weatherMap: Map<string, WeatherDay> | null = null;
  if (locationCity.trim()) {
    try {
      weatherMap = await fetchDailyWeather(locationCity, schedule.map((s) => s.date));
    } catch (e) {
      console.warn("[workouts-gen] weather fetch failed", e);
    }
  }

  const weatherAdvices = schedule.map((s) => {
    const w = weatherMap?.get(s.date);
    if (!w) return null;
    return adviseForWorkout(w, windThreshold, autoIndoor);
  });

  const profileBlock = `
PERFIL TIPOLÓGICO DEL CICLISTA:
- Tipo: ${cyclistType}
${strengths ? `- Fortalezas: ${strengths}` : ""}
${weaknesses ? `- Debilidades a trabajar: ${weaknesses}` : ""}
AJUSTES POR PERFIL:
- Sprinter: prioriza trabajo neuromuscular, sprints, aceleraciones de 10-30 s y recuperaciones largas.
- Rodador: sesiones de umbral/tempo sostenido, Z3-Z4 prolongada y rodajes aeróbicos en llano.
- Escalador: rodajes largos de Z2, repeticiones en subida (2-10 min) y fuerza específica a baja cadencia.
- Contrarrelojista: trabajo aeróbico constante, series de umbral y simulaciones de crono en posición.
- Mixto: equilibrio entre cualidades sin sesgar demasiado.`;

  const weatherBlock = weatherMap
    ? `
PREVISIÓN METEOROLÓGICA (${locationCity}):
${schedule.map((s, i) => {
      const w = weatherMap!.get(s.date);
      const a = weatherAdvices[i];
      if (!w) return `- ${s.date}: sin datos`;
      return `- ${s.date}: ${w.summary}, viento ${w.wind_kmh} km/h, ${w.precip_mm} mm de lluvia.${a ? ` Ajuste: ${a.note}` : ""}`;
    }).join("\n")}
REGLAS METEOROLÓGICAS:
- Si un día tiene lluvia intensa (≥5 mm), frío extremo (≤2 °C), calor extremo (≥35 °C), tormenta o viento muy fuerte, y el perfil tiene weather_auto_indoor activado, propón ese entrenamiento como rodillo (indoor) y ajusta la duración a 60-90 min.
- En días de viento fuerte pero sin precipitación extrema, puedes reducir la duración de la tirada larga o cambiarla por una sesión de calidad corta.
- En días templados y sin viento, prioriza salida a exterior.`
    : "";

  // ---- Bloque de 4 semanas (periodización) ----
  const planWeekStart = weekStart(schedule[0].date);
  const { data: lastBlock } = await supabase
    .from("training_blocks")
    .select("*")
    .eq("user_id", userId)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { resolvePeriodization } = await import("./periodization.server");
  const periodization = resolvePeriodization({
    plan_week_start: planWeekStart,
    last_block: lastBlock ?? null,
    competition_date: competition?.date ?? null,
  });
  const blockFocus = periodization.focus;
  const weekIndex = periodization.week_index;
  const blockRow: any = lastBlock && weekIndex > 1 && lastBlock.focus === blockFocus ? lastBlock : null;

  // ---- Métricas de carga, ficha individual y prescripción de la semana ----
  const load = await buildTrainingLoad(supabase, userId, profile);
  let athlete: AthleteProfile | null = null;
  try {
    athlete = await refreshAthleteProfile(supabase, userId, profile);
  } catch (e) {
    console.warn("[workouts-gen] athlete profile failed", e);
  }
  const week = prescribeWeek(load, {
    sessions: effectiveCount,
    duration_minutes: input.duration_minutes,
    block_week_index: weekIndex,
    deload: periodization.is_deload || blockFocus === "tapering",
    progression_factor: periodization.progression_factor,
    personal: athlete
      ? {
          weekly_tss_ceiling: athlete.weekly_tss_ceiling,
          tsb_recovery_threshold: athlete.tsb_recovery_threshold,
          readiness_low_threshold: athlete.readiness_low_threshold,
          deload_every_weeks: athlete.deload_every_weeks,
        }
      : null,
  });

  const loadBlock = loadPromptBlock(load, week);
  const blockBlock = periodization.prompt_block;


  // ---- Biblioteca de sesiones con progresión personal ----
  const { SESSION_LIBRARY, progressionLevel, libraryPromptBlock } = await import("./session-library");
  const { data: goalRows } = await supabase
    .from("workouts")
    .select("session_goal")
    .eq("user_id", userId)
    .eq("status", "completed")
    .not("session_goal", "is", null)
    .limit(300);
  const goalCounts: Record<string, number> = {};
  for (const r of (goalRows ?? []) as any[]) {
    const g = String(r.session_goal);
    goalCounts[g] = (goalCounts[g] ?? 0) + 1;
  }
  const levels: Record<string, number> = {};
  for (const g of Object.keys(SESSION_LIBRARY)) levels[g] = progressionLevel(goalCounts[g] ?? 0);
  const libraryBlock = libraryPromptBlock(levels as any);

  // ---- Test de forma periódico ----
  const { data: lastTest } = await supabase
    .from("ftp_tests")
    .select("test_date")
    .eq("user_id", userId)
    .order("test_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastTestISO: string | null = lastTest?.test_date ?? (profile.ftp_test_completed_at ? String(profile.ftp_test_completed_at).slice(0, 10) : null);
  const weeksSinceTest = lastTestISO
    ? Math.floor((new Date(`${planWeekStart}T12:00:00Z`).getTime() - new Date(`${lastTestISO}T12:00:00Z`).getTime()) / (7 * 86400000))
    : 99;
  const { count: prevWorkoutCount } = await supabase
    .from("workouts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  const isFirstGeneration = !lastTestISO && !(prevWorkoutCount ?? 0);
  const needsTest =
    (isFirstGeneration || weeksSinceTest >= 6) &&
    week.mode !== "recovery" &&
    !periodization.is_deload &&
    blockFocus !== "tapering";
  const testIndex = effectiveCount >= 2 ? 1 : 0;
  const testBlock = needsTest
    ? `
TEST DE FTP (obligatorio esta semana): ${isFirstGeneration ? "es la primera semana de entrenamientos y hay que conocer sus umbrales." : `han pasado ${weeksSinceTest === 99 ? "más de 6" : weeksSinceTest} semanas desde el último test.`}
- Convierte la ${testIndex === 0 ? "PRIMERA" : "SEGUNDA"} sesión de la semana en un test de umbral: calentamiento progresivo de 20 min, 5 min de activación, 20 min ALL-OUT sostenidos (session_goal="umbral") y vuelta a la calma.
- Indica claramente en el título "Test FTP 20 min" y en el summary que el resultado servirá para actualizar el FTP, el umbral de FC y las zonas.`
    : "";

  const longRideStructure: Record<string, string> = {
    base: "rodaje continuo en Z2 con 2-3 bloques de 10 min de cadencia baja (55-60 rpm) en la parte central",
    construccion: "Z2 con 3 bloques de 15 min en tempo (Z3) repartidos en la segunda mitad",
    pico: "Z2 con 3-4 subidas o bloques de 8-10 min en Z4 en el último tercio, simulando el perfil de la competición",
    tapering: "Z2 continuo y corto, con 3-4 aceleraciones de 1 min para mantener sensaciones",
  };

  const scheduleBlock = `

CALENDARIO OBLIGATORIO (días elegidos por el ciclista: ${chosenDays.map((d) => DAY_NAMES[d]).join(", ")}):
${schedule.map((s, i) => `- Sesión ${i + 1}: ${s.date} (${DAY_NAMES[s.dow]})${longDay !== null && s.dow === longDay ? " → TIRADA LARGA" : ""}`).join("\n")}
- Devuelve EXACTAMENTE ${effectiveCount} entrenamientos, EN ESTE MISMO ORDEN, y pon en cada uno "scheduled_date" con la fecha indicada.
${longDay !== null ? `- Las sesiones marcadas como TIRADA LARGA (${DAY_NAMES[longDay]}) duran 1.5-2.5x la duración objetivo y tienen estructura propia según el bloque "${blockFocus}": ${longRideStructure[blockFocus] ?? longRideStructure.base}. Indícalo en el título y en el summary.` : ""}
- Reparte carga y recuperación entre sesiones consecutivas teniendo en cuenta los días reales del calendario.`;

  const prompt = `Eres un entrenador profesional de ciclismo. Diseña ${effectiveCount} entrenamiento(s) MIXTOS personalizados para este ciclista.

PERFIL:
- Edad: ${profile.age ?? "n/a"}, Sexo: ${profile.gender ?? "n/a"}, Peso: ${weight}kg
- FTP: ${ftp ?? "no especificado"}W · FC máx: ${maxHr ?? "n/a"} ppm · LTHR: ${lthr ?? "n/a"} ppm
- Tipo de bici: ${input.bike_type}

${profileBlock}

${athletePromptBlock(athlete, cyclistType)}


${basisBlock}

PETICIÓN:
- Foco: ${competition ? "preparación específica para la competición indicada, siempre con bloque MIXTO" : "MIXTO obligatorio: combina resistencia, intervalos y fuerza a lo largo del bloque"}
- Duración objetivo de CADA entrenamiento: ${input.duration_minutes} minutos (la tirada larga puede ser mayor)
- Cantidad: ${effectiveCount} entrenamiento(s) distintos
${input.nutrition_goal && NUTRITION_TRAINING_RULES[input.nutrition_goal] ? `\nPLAN NUTRICIONAL DEL CICLISTA: ${NUTRITION_TRAINING_RULES[input.nutrition_goal]}\nAdapta la estructura de las sesiones para favorecer ese objetivo y menciónalo en el summary.\n` : ""}
${competitionBlock}
${blockBlock}
${loadBlock}
${libraryBlock}
${testBlock}
${scheduleBlock}
${weatherBlock}

ACTIVIDADES RECIENTES (Intervals.icu): ${recent && recent.length ? JSON.stringify(recent) : "ninguna"}

ENTRENAMIENTOS YA REALIZADOS (prescrito vs ejecutado; RPE 1=fácil, 5=imposible): ${prevWorkouts && prevWorkouts.length ? JSON.stringify(prevWorkouts.map((w: any) => ({ tipo: w.training_type, min: w.duration_minutes, rpe: w.rpe, notas: w.feedback_notes, fecha: w.completed_at, tss_prescrito: w.planned_tss, tss_real: w.actual_tss, cumplimiento_pct: w.compliance }))) : "sin histórico"}
- Si el cumplimiento medio es <85% de forma repetida, BAJA los targets prescritos; si es >115%, súbelos.

CARRERAS PASADAS: ${pastRaces && pastRaces.length ? JSON.stringify(pastRaces) : "sin carreras previas con feedback"}

READINESS DE HOY (${madridToday}): ${readinessStatus}
HISTÓRICO READINESS 14 días: ${readinessArr.length ? JSON.stringify(readinessArr) : "sin registros"}

INSTRUCCIONES:
1. Cada entrenamiento DEBE durar aproximadamente ${input.duration_minutes} minutos (suma de duration_seconds), salvo que el ajuste meteorológico lo convierta en rodillo (60-90 min).
2. Incluye SIEMPRE calentamiento y vuelta a la calma.
3. duration_type='time' con duration_seconds salvo descansos abiertos.
4. Respeta ESTRICTAMENTE la BASE DE PRESCRIPCIÓN (${basis === "hr" ? "frecuencia cardíaca" : "potencia/FTP"}).
5. Fuerza sobre la bici: cadencia baja (50-60rpm) con intensidad Z3-Z4.
6. name MÁXIMO 15 caracteres. Title puede ser largo. TODO en ESPAÑOL.
7. PLAN MIXTO: alterna resistencia, intervalos y fuerza entre las sesiones del bloque; no repitas el mismo tipo dos días seguidos.
8. PROGRESIÓN Y MEJORA: usa el histórico de entrenamientos realizados (RPE, notas, cumplimiento) y las actividades de Intervals.icu para subir la carga de forma progresiva respecto a la semana anterior. Si el RPE medio >4 reduce intensidad; si <2 auméntala.
9. TIPO DE BICI (${input.bike_type}): adapta el enfoque al material.
10. MODULACIÓN POR READINESS: la PRIMERA sesión del plan se ajusta al Readiness de hoy (1 → descanso/movilidad, 2 → Z1-Z2 corto, 3 → estándar, 4-5 → puedes subir carga).
11. AJUSTE METEOROLÓGICO: si el día tiene condiciones adversas según la previsión, indícalo en el summary y, si procede, convierte la sesión en rodillo (indoor=true) con duración 60-90 min.`;

  const result = await callAI([{ role: "user", content: prompt }], PlanSchema, { fn: "workouts-gen" });

  // ---- Validación y corrección determinista ----
  const items = (result.workouts as any[]).slice(0, effectiveCount).map((w, i) => {
    const slot = schedule[i];
    const isLong = !!slot && longDay !== null && slot.dow === longDay;
    const weather = weatherMap?.get(slot?.date ?? w.scheduled_date ?? "") ?? null;
    const advice = weatherAdvices[i] ?? (weather ? adviseForWorkout(weather, windThreshold, autoIndoor) : null);
    const ctx = {
      ftp,
      lthr,
      maxHr,
      basis,
      duration_minutes: slot ? minutesForDay(athlete, slot.dow, input.duration_minutes) : input.duration_minutes,
      long_ride: isLong,
    };

    const v = validateWorkout(w, ctx);
    return {
      focus: w.focus ?? "mixto",
      plan: v.plan,
      tss: v.tss,
      minutes: v.minutes,
      ctx,
      date: slot?.date ?? w.scheduled_date ?? null,
      isLong,
      weather,
      advice,
    };
  });

  enforceWeeklyTss(items, week.target_tss);
  avoidBackToBackHard(items, Math.max(1, Math.round(athlete?.recovery_days_after_hard ?? 1)));
  enforcePolarized(items, week.mode === "recovery" ? 10 : 20);


  const rationaleBase = `Carga actual CTL ${load.ctl} / TSB ${load.tsb}${load.readiness_7d !== null ? ` · readiness 7d ${load.readiness_7d}/5` : ""} · semana ${week.mode} (${week.reason}) · bloque ${blockFocus} s${weekIndex}/4`;

  const rows = items.map((it, idx) => ({
    user_id: userId,
    training_type: it.focus,
    bike_type: input.bike_type,
    duration_minutes: it.minutes,
    planned_tss: it.tss,
    session_goal: it.plan?.session_goal ?? null,
    energy_system: it.plan?.energy_system ?? null,

    plan: {
      ...it.plan,
      target_basis: basis,
      competition_id: input.competition_id ?? null,
      competition_name: competition?.name ?? null,
      scheduled_date: it.date,
      long_ride: it.isLong,
      block_focus: blockFocus,
      block_week: weekIndex,
      week_mode: week.mode,
      week_target_tss: week.target_tss,
      rationale: `${rationaleBase} · TSS previsto ${it.tss}`,
      weather: it.weather ? {
        date: it.weather.date,
        summary: it.weather.summary,
        temp_max_c: it.weather.temp_max_c,
        wind_kmh: it.weather.wind_kmh,
        precip_mm: it.weather.precip_mm,
      } : null,
      weather_advice: it.advice ? {
        indoor: it.advice.indoor,
        reason: it.advice.reason,
        note: it.advice.note,
      } : null,
      is_ftp_test: needsTest && idx === testIndex,
    },
    status: "pending",
  }));

  const { data: inserted, error } = await supabase.from("workouts").insert(rows).select();
  if (error) throw new Error(error.message);

  // Persiste / avanza el bloque de entrenamiento
  const totalTss = items.reduce((a, i) => a + i.tss, 0);
  if (blockRow?.id) {
    await supabase
      .from("training_blocks")
      .update({ focus: blockFocus, week_index: weekIndex, target_tss: totalTss, competition_id: input.competition_id ?? null })
      .eq("id", blockRow.id)
      .eq("user_id", userId);
  } else {
    await supabase.from("training_blocks").insert({
      user_id: userId,
      start_date: planWeekStart,
      focus: blockFocus,
      week_index: weekIndex,
      target_tss: totalTss,
      competition_id: input.competition_id ?? null,
      notes: week.reason,
    });
  }

  return inserted;
}

