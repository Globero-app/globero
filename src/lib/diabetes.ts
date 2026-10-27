/* Contexto de diabetes compartido entre prompts de nutrición y calculadoras. */
export interface DiabetesProfile { has_diabetes?: boolean | null; diabetes_type?: string | null; cgm_device?: string | null; glucose_target_min?: number | null; glucose_target_max?: number | null; glucose_rescue_grams?: number | null }

export const GLUCOSE_DEFAULTS = { min: 120, max: 180, rescue: 15 } as const;

/** Límites glucémicos del atleta con valores seguros por defecto. */
export function glucoseTargets(p?: DiabetesProfile | null) {
  return {
    min: p?.glucose_target_min ?? GLUCOSE_DEFAULTS.min,
    max: p?.glucose_target_max ?? GLUCOSE_DEFAULTS.max,
    rescue: p?.glucose_rescue_grams ?? GLUCOSE_DEFAULTS.rescue,
  };
}

const TYPE: Record<string, string> = { type1: "tipo 1", type2: "tipo 2", lada: "LADA", mody: "MODY", other: "otro" };
const CGM: Record<string, string> = { none: "sin MCG", libre: "FreeStyle Libre", dexcom: "Dexcom", medtronic: "Medtronic Guardian", eversense: "Eversense", other: "otro MCG" };

export function diabetesPrompt(p?: DiabetesProfile | null): string {
  if (!p?.has_diabetes) return "";
  const t = TYPE[p.diabetes_type ?? ""] ?? "tipo no indicado";
  const c = CGM[p.cgm_device ?? ""] ?? "MCG no indicado";
  const g = glucoseTargets(p);
  return `\n- DIABETES (${t}, ${c}): rango glucémico objetivo del atleta ${g.min}–${g.max} mg/dL y ${g.rescue} g de CHO de rescate; indica CHO exactos por comida y toma, reparte CHO de forma regular, prioriza bajo índice glucémico fuera del ejercicio, incluye proteína/grasa/fibra en comidas principales, evita picos de azúcar libre fuera de entrenos, añade un snack con CHO antes de dormir tras sesiones intensas o largas${p.cgm_device && p.cgm_device !== "none" ? " y recuerda revisar la tendencia del MCG antes, durante y después" : " y recuerda medir glucemia antes, durante y después"}. No des dosis de insulina ni medicación.`;
}

export function hasDiabetes(p?: DiabetesProfile | null): boolean {
  return !!p?.has_diabetes;
}

export type DiabetesWarning = "pre" | "hypo" | "hyper" | "reserve" | "post" | "night";

/** Avisos de sesión según intensidad (IF) y duración (min) para atletas con diabetes. */
export function workoutDiabetesWarnings(minutes: number, intensityFactor: number, diabetesType?: string | null): DiabetesWarning[] {
  const w: DiabetesWarning[] = ["pre"];
  if (intensityFactor >= 0.85) w.push("hyper");
  if (intensityFactor < 0.85 || minutes >= 60) w.push("hypo");
  w.push("reserve", "post");
  if ((minutes >= 90 || intensityFactor >= 0.85) && diabetesType !== "type2") w.push("night");
  return w;
}

/** Contexto médico seguro para informes post-sesión y Coach IA. */
export function diabetesCoachContext(p?: DiabetesProfile | null): string {
  if (!p?.has_diabetes) return "";
  const t = TYPE[p.diabetes_type ?? ""] ?? "tipo no indicado";
  const cgm = !!p.cgm_device && p.cgm_device !== "none";
  const g = glucoseTargets(p);
  return `ATLETA CON DIABETES (${t}; rango objetivo ${g.min}–${g.max} mg/dL, rescate ${g.rescue} g CHO; ${cgm ? `usa MCG ${CGM[p.cgm_device!] ?? ""}` : "sin MCG, mide con glucómetro"}). En tus consejos incluye UNA recomendación breve y segura de control glucémico relacionada con la sesión (medir antes/después${cgm ? ", revisar la tendencia del MCG" : ""}, CHO rápidos de reserva, riesgo de hipoglucemia tardía/nocturna tras sesiones largas o intensas, posible hiperglucemia transitoria en series intensas). NUNCA indiques dosis ni ajustes de insulina o medicación; remite a su equipo médico para ello.`;
}
