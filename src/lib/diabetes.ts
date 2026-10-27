/* Contexto de diabetes compartido entre prompts de nutrición y calculadoras. */
export interface DiabetesProfile { has_diabetes?: boolean | null; diabetes_type?: string | null; cgm_device?: string | null }

const TYPE: Record<string, string> = { type1: "tipo 1", type2: "tipo 2", lada: "LADA", mody: "MODY", other: "otro" };
const CGM: Record<string, string> = { none: "sin MCG", libre: "FreeStyle Libre", dexcom: "Dexcom", medtronic: "Medtronic Guardian", eversense: "Eversense", other: "otro MCG" };

export function diabetesPrompt(p?: DiabetesProfile | null): string {
  if (!p?.has_diabetes) return "";
  const t = TYPE[p.diabetes_type ?? ""] ?? "tipo no indicado";
  const c = CGM[p.cgm_device ?? ""] ?? "MCG no indicado";
  return `\n- DIABETES (${t}, ${c}): indica CHO exactos por comida y toma, reparte CHO de forma regular, prioriza bajo índice glucémico fuera del ejercicio, incluye proteína/grasa/fibra en comidas principales, evita picos de azúcar libre fuera de entrenos, añade un snack con CHO antes de dormir tras sesiones intensas o largas${p.cgm_device && p.cgm_device !== "none" ? " y recuerda revisar la tendencia del MCG antes, durante y después" : " y recuerda medir glucemia antes, durante y después"}. No des dosis de insulina ni medicación.`;
}

export function hasDiabetes(p?: DiabetesProfile | null): boolean {
  return !!p?.has_diabetes;
}
