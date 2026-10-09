/** Motor de nutrición en ruta: carbohidratos/hora según duración, intensidad (IF) y tolerancia gástrica. */
export type GutTolerance = "low" | "medium" | "high";
export type FuelItem = "gel" | "halfBar" | "sip";
export interface FuelSlot { minute: number; items: FuelItem[] }
export interface FuelPlan {
  carbsPerHour: number; totalCarbs: number; fluidPerHour: number;
  sipMl: number; bottles: number; gels: number; bars: number; drinkCarbs: number;
  schedule: FuelSlot[];
}

export const GEL_G = 25;
export const HALF_BAR_G = 20;
export const BOTTLE_ML = 500;
export const BOTTLE_CARBS_G = 30;
const CAP: Record<GutTolerance, number> = { low: 60, medium: 90, high: 120 };

export function carbsPerHour(hours: number, intensityFactor: number, tol: GutTolerance): number {
  const IF = intensityFactor;
  let base: number;
  if (hours < 1) base = IF >= 0.75 ? 30 : 0;
  else if (hours < 2) base = IF < 0.65 ? 30 : IF < 0.8 ? 45 : 60;
  else if (hours < 3) base = IF < 0.65 ? 45 : IF < 0.8 ? 60 : 75;
  else base = IF < 0.65 ? 60 : IF < 0.8 ? 75 : 90;
  if (tol === "low") base *= 0.8;
  if (tol === "high" && hours >= 2) base *= 1.2;
  return Math.min(CAP[tol], Math.round(base / 5) * 5);
}

/** IF estimado a partir de TSS planificado o de los bloques del plan. */
export function estimateIF(opts: { minutes: number; plannedTss?: number | null; steps?: any[]; ftp?: number | null }): number {
  const h = opts.minutes / 60;
  if (opts.plannedTss && h > 0) return Math.min(1.2, Math.sqrt(Number(opts.plannedTss) / (h * 100)));
  const steps = opts.steps ?? [];
  let t = 0, acc = 0;
  for (const s of steps) {
    const d = Number(s.duration_seconds) || 0;
    if (!d) continue;
    let pct = 0.6;
    if (s.target === "power" && opts.ftp) pct = ((Number(s.target_low) + Number(s.target_high)) / 2) / opts.ftp;
    else if (typeof s.target_low === "number" && s.target_low > 0 && s.target_low <= 2) pct = (s.target_low + (s.target_high ?? s.target_low)) / 2;
    t += d; acc += d * Math.pow(pct, 4);
  }
  return t ? Math.min(1.2, Math.pow(acc / t, 0.25)) : 0.65;
}

export function buildFuelPlan(minutes: number, intensityFactor: number, tol: GutTolerance, indoor = false): FuelPlan {
  const hours = minutes / 60;
  const rate = carbsPerHour(hours, intensityFactor, tol);
  const fluidPerHour = Math.round((500 + (intensityFactor >= 0.8 ? 150 : 0) + (indoor ? 250 : 0)) / 50) * 50;
  const bottles = Math.max(1, Math.ceil((fluidPerHour * hours) / BOTTLE_ML));
  const totalCarbs = Math.round(rate * hours);
  if (rate === 0) return { carbsPerHour: 0, totalCarbs: 0, fluidPerHour, bottles, gels: 0, bars: 0, drinkCarbs: 0, sipMl: Math.round(fluidPerHour / 4 / 10) * 10, schedule: sipsOnly(minutes) };
  const drinkCarbs = Math.min(totalCarbs, bottles * BOTTLE_CARBS_G);
  const slots: FuelSlot[] = [];
  for (let m = 20; m <= minutes - 10; m += 20) slots.push({ minute: m, items: ["sip"] });
  const foodNeeded = totalCarbs - drinkCarbs;
  const perSlot = slots.length ? foodNeeded / slots.length : 0;
  let deficit = 0, gels = 0, halves = 0;
  const solidsUntil = intensityFactor < 0.85 ? minutes * 0.6 : 0;
  for (const s of slots) {
    deficit += perSlot;
    if (s.minute <= solidsUntil && deficit >= HALF_BAR_G * 0.75) { s.items.push("halfBar"); halves++; deficit -= HALF_BAR_G; }
    else if (deficit >= GEL_G * 0.75) { s.items.push("gel"); gels++; deficit -= GEL_G; }
  }
  return { carbsPerHour: rate, totalCarbs, fluidPerHour, sipMl: Math.round(fluidPerHour / 3 / 10) * 10, bottles, gels, bars: Math.ceil(halves / 2), drinkCarbs, schedule: slots };
}

function sipsOnly(minutes: number): FuelSlot[] {
  const out: FuelSlot[] = [];
  for (let m = 15; m <= minutes - 5; m += 15) out.push({ minute: m, items: ["sip"] });
  return out;
}
