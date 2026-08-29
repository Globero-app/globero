/* Helpers de servidor para el Readiness diario (no importar desde el cliente). */

export const READINESS_LABELS: Record<number, string> = {
  1: "Nada preparado",
  2: "Preparado para un paseo relajado",
  3: "Preparado para un entreno normal",
  4: "Preparado para un entreno exigente",
  5: "Preparado para dar lo máximo",
};

export function madridToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export { callAI } from "./ai-call.server";

const StepSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    duration_type: { type: "string", enum: ["time", "open"] },
    duration_seconds: { type: "number" },
    target: { type: "string", enum: ["power", "hr", "cadence", "open"] },
    target_low: { type: "number" },
    target_high: { type: "number" },
    intensity: { type: "string", enum: ["warmup", "active", "interval", "recovery", "rest", "cooldown"] },
  },
  required: ["name", "description", "duration_type", "target", "target_low", "target_high", "intensity"],
};

export const AdaptSchema = {
  type: "object",
  properties: {
    message: { type: "string", description: "Explicación breve (1-2 frases, español) del ajuste realizado" },
    name: { type: "string", description: "Nombre corto del entrenamiento (≤15 caracteres)" },
    title: { type: "string" },
    summary: { type: "string" },
    duration_minutes: { type: "number", description: "Duración total resultante en minutos" },
    steps: { type: "array", items: StepSchema, minItems: 3 },
  },
  required: ["message", "name", "title", "summary", "duration_minutes", "steps"],
};

/** Escoge el entrenamiento pendiente correspondiente a hoy. */
export function pickTodayWorkout(workouts: any[], today: string): any | null {
  if (!workouts || !workouts.length) return null;
  const scheduled = workouts.find((w) => (w.plan?.scheduled_date ?? null) === today);
  if (scheduled) return scheduled;
  const undated = workouts.filter((w) => !w.plan?.scheduled_date);
  if (undated.length) return undated[0];
  const past = workouts.filter((w) => (w.plan?.scheduled_date ?? "") < today);
  return past.length ? past[past.length - 1] : null;
}

export function buildAdaptPrompt(opts: {
  score: number;
  note?: string | null;
  profile: any;
  workout: any;
  history: Array<{ entry_date: string; score: number }>;
}): string {
  const { score, note, profile, workout, history } = opts;
  return `Eres un entrenador profesional de ciclismo. El ciclista ha respondido su READINESS de hoy y debes ADAPTAR el entrenamiento que tiene asignado.

READINESS DE HOY: ${score}/5 — "${READINESS_LABELS[score]}"
Nota del ciclista: ${note || "—"}
Histórico readiness (14 días): ${history.length ? JSON.stringify(history) : "sin registros"}

PERFIL: edad ${profile?.age ?? "n/a"}, peso ${profile?.weight_kg ?? "n/a"}kg, FTP ${profile?.ftp ?? "no especificado"}W, FC máx ${profile?.max_hr ?? "n/a"}, LTHR ${profile?.lthr ?? "n/a"}.

ENTRENAMIENTO ORIGINAL (JSON): ${JSON.stringify({ ...workout.plan, competition_id: undefined })}
Duración original: ${workout.duration_minutes} min · Tipo: ${workout.training_type} · Bici: ${workout.bike_type}

REGLAS DE ADAPTACIÓN SEGÚN READINESS:
- 2 (paseo relajado): convierte la sesión en rodaje suave Z1-Z2 sin intervalos, reduce la duración un 30-40%.
- 4 (entreno exigente): mantén o incrementa ligeramente la carga; puedes añadir un bloque de calidad.
- 5 (dar lo máximo): sesión clave, sube intensidad y/o volumen de forma razonable (máximo +20%) sin comprometer la recuperación.

INSTRUCCIONES:
1. Devuelve el entrenamiento COMPLETO adaptado con todos sus steps (calentamiento y vuelta a la calma incluidos).
2. Si hay FTP usa target='power' en vatios; si no, target='hr' en bpm o 'open'.
3. name ≤ 15 caracteres. TODO en ESPAÑOL.
4. "message": explica en 1-2 frases qué has cambiado y por qué, dirigiéndote al ciclista.`;
}
