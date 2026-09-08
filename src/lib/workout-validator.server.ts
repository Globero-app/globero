/* Validación y corrección determinista de los entrenamientos generados por la IA.
   Solo servidor. */

import { computePowerZones, computeHrZones } from "./zones";
import { estimatePlanTss } from "./training-load.server";

const HARD = new Set(["interval"]);

export interface ValidateCtx {
  ftp: number | null;
  lthr: number | null;
  maxHr: number | null;
  basis: "power" | "hr";
  duration_minutes: number;
  long_ride: boolean;
}

function zoneFromStep(s: any, ctx: ValidateCtx): number {
  // Zona sugerida por la IA (si la indica) o inferida de la intensidad
  const z = Number(s?.zone);
  if (z >= 1 && z <= 7) return Math.round(z);
  const byIntensity: Record<string, number> = {
    warmup: 2, recovery: 1, rest: 1, cooldown: 1, active: 2, interval: 5,
  };
  // Si los targets vienen coherentes, deriva la zona de ellos
  const mid = ((Number(s?.target_low) || 0) + (Number(s?.target_high) || 0)) / 2;
  if (s?.target === "power" && ctx.ftp && mid > 0) {
    const pct = (mid / ctx.ftp) * 100;
    if (pct < 56) return 1;
    if (pct <= 75) return 2;
    if (pct <= 90) return 3;
    if (pct <= 105) return 4;
    if (pct <= 120) return 5;
    if (pct <= 150) return 6;
    return 7;
  }
  const ref = ctx.lthr ?? (ctx.maxHr ? Math.round(ctx.maxHr * 0.92) : null);
  if (s?.target === "hr" && ref && mid > 0) {
    const pct = (mid / ref) * 100;
    if (pct < 82) return 1;
    if (pct <= 88) return 2;
    if (pct <= 93) return 3;
    if (pct <= 99) return 4;
    if (pct <= 102) return 5;
    if (pct <= 106) return 6;
    return 7;
  }
  return byIntensity[s?.intensity] ?? 2;
}

/** Recalcula los targets del step desde las zonas del perfil. */
function applyZoneTargets(s: any, zone: number, ctx: ValidateCtx) {
  if (ctx.basis === "power" && ctx.ftp) {
    const zones = computePowerZones(ctx.ftp);
    const z = zones?.find((x) => x.id === zone) ?? zones?.[1];
    if (z) {
      s.target = "power";
      s.target_low = Math.round(z.low || Math.round(ctx.ftp * 0.5));
      s.target_high = Math.round(Number.isFinite(z.high) ? z.high : Math.round(ctx.ftp * 1.6));
    }
    return;
  }
  const zones = computeHrZones(ctx.lthr, ctx.maxHr);
  if (zones) {
    const z = zones.find((x) => x.id === zone) ?? zones[1];
    const ref = ctx.lthr ?? Math.round((ctx.maxHr ?? 190) * 0.92);
    s.target = "hr";
    s.target_low = Math.round(z.low || Math.round(ref * 0.6));
    s.target_high = Math.round(Number.isFinite(z.high) ? z.high : Math.round(ref * 1.1));
    return;
  }
  s.target = "open";
  s.target_low = 0;
  s.target_high = 0;
}

/**
 * Normaliza un entrenamiento: estructura, duración objetivo, targets reales desde zonas,
 * calentamiento/vuelta a la calma y TSS. Devuelve el plan corregido y su TSS.
 */
export function validateWorkout(plan: any, ctx: ValidateCtx): { plan: any; tss: number; minutes: number } {
  const out = { ...plan };
  let steps: any[] = Array.isArray(out.steps) ? out.steps.map((s: any) => ({ ...s })) : [];

  // Descarta steps vacíos
  steps = steps.filter((s) => s && (s.duration_type === "open" || (Number(s.duration_seconds) || 0) > 0));

  const targetMin = ctx.long_ride ? Math.round(ctx.duration_minutes * 1.8) : ctx.duration_minutes;

  if (!steps.length) {
    steps = [
      { name: "Calentamiento", description: "Rodaje progresivo suave", duration_type: "time", duration_seconds: 600, intensity: "warmup" },
      { name: "Bloque Z2", description: "Rodaje aeróbico constante", duration_type: "time", duration_seconds: Math.max(600, (targetMin - 20) * 60), intensity: "active" },
      { name: "Vuelta calma", description: "Pedaleo suave para recuperar", duration_type: "time", duration_seconds: 600, intensity: "cooldown" },
    ];
  }

  // Garantiza calentamiento y vuelta a la calma
  if (steps[0]?.intensity !== "warmup") {
    steps.unshift({ name: "Calentamiento", description: "Rodaje progresivo suave", duration_type: "time", duration_seconds: 600, intensity: "warmup" });
  }
  if (steps[steps.length - 1]?.intensity !== "cooldown") {
    steps.push({ name: "Vuelta calma", description: "Pedaleo suave para recuperar", duration_type: "time", duration_seconds: 600, intensity: "cooldown" });
  }

  // Targets reales desde zonas
  for (const s of steps) {
    const zone = zoneFromStep(s, ctx);
    s.zone = zone;
    applyZoneTargets(s, zone, ctx);
    if (s.duration_type !== "open") {
      s.duration_type = "time";
      s.duration_seconds = Math.max(30, Math.round(Number(s.duration_seconds) || 60));
    }
    if (typeof s.name === "string" && s.name.length > 15) s.name = s.name.slice(0, 15).trim();
  }

  // Ajuste de duración total (±10%)
  const total = () => steps.reduce((acc, s) => acc + (Number(s.duration_seconds) || 0), 0);
  const targetSec = targetMin * 60;
  let sec = total();
  if (sec > 0 && (sec < targetSec * 0.9 || sec > targetSec * 1.1)) {
    const k = targetSec / sec;
    // Escala solo los bloques no-interval para no desvirtuar las series
    const scalable = steps.filter((s) => s.duration_type === "time" && !HARD.has(s.intensity));
    if (scalable.length) {
      const fixed = steps.filter((s) => !scalable.includes(s)).reduce((a, s) => a + (Number(s.duration_seconds) || 0), 0);
      const scalableSec = sec - fixed;
      const needed = Math.max(60, targetSec - fixed);
      const k2 = scalableSec > 0 ? needed / scalableSec : 1;
      for (const s of scalable) s.duration_seconds = Math.max(60, Math.round(s.duration_seconds * k2));
    } else {
      for (const s of steps) if (s.duration_type === "time") s.duration_seconds = Math.max(60, Math.round(s.duration_seconds * k));
    }
    sec = total();
  }

  out.steps = steps;
  const tss = estimatePlanTss(out, ctx.ftp, ctx.lthr, ctx.maxHr, targetMin);
  out.estimated_tss = tss;
  out.target_basis = ctx.basis;

  return { plan: out, tss, minutes: Math.max(1, Math.round(sec / 60)) };
}

/** Recorta la carga de la semana si supera el objetivo, acortando los bloques de intervalos. */
export function enforceWeeklyTss(
  items: Array<{ plan: any; tss: number; minutes: number; ctx: ValidateCtx }>,
  targetTss: number,
): void {
  let total = items.reduce((a, i) => a + i.tss, 0);
  const limit = Math.round(targetTss * 1.1);
  let guard = 0;
  while (total > limit && guard++ < 10) {
    // Recorta la sesión con más TSS
    const worst = items.slice().sort((a, b) => b.tss - a.tss)[0];
    if (!worst) break;
    const intervals = (worst.plan.steps as any[]).filter((s) => HARD.has(s.intensity) && s.duration_type === "time");
    const pool = intervals.length ? intervals : (worst.plan.steps as any[]).filter((s) => s.duration_type === "time" && s.intensity === "active");
    if (!pool.length) break;
    for (const s of pool) s.duration_seconds = Math.max(60, Math.round(s.duration_seconds * 0.85));
    const re = validateWorkout(worst.plan, worst.ctx);
    worst.plan = re.plan;
    worst.tss = re.tss;
    worst.minutes = re.minutes;
    total = items.reduce((a, i) => a + i.tss, 0);
  }
}

/** Evita sesiones duras demasiado juntas según los días de recuperación del ciclista. */
export function avoidBackToBackHard(
  items: Array<{ plan: any; tss: number; minutes: number; ctx: ValidateCtx; date: string | null }>,
  minGapDays = 1,
): void {
  const gapMs = Math.max(1, Math.round(minGapDays)) * 86400000;
  const isHard = (i: { plan: any }) => (i.plan.steps as any[]).some((s) => (Number(s.zone) || 0) >= 4 && s.duration_type === "time" && s.duration_seconds >= 180);
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1];
    const cur = items[i];
    if (!prev.date || !cur.date) continue;
    const diff = new Date(`${cur.date}T12:00:00Z`).getTime() - new Date(`${prev.date}T12:00:00Z`).getTime();
    const tooClose = diff <= gapMs;
    if (!tooClose || !isHard(prev) || !isHard(cur)) continue;
    for (const s of cur.plan.steps as any[]) {
      if ((Number(s.zone) || 0) >= 4) {
        s.zone = 2;
        s.intensity = s.intensity === "interval" ? "active" : s.intensity;
      }
    }
    const re = validateWorkout(cur.plan, cur.ctx);
    cur.plan = { ...re.plan, softened_reason: `Suavizada: necesita ~${minGapDays} día(s) de recuperación entre sesiones duras` };
    cur.tss = re.tss;
    cur.minutes = re.minutes;
  }
}

/**
 * Reparto polarizado: limita el tiempo total semanal en zona gris (Z3) a `maxGreyPct`
 * y lo pasa a Z2, salvo en sesiones cuyo objetivo sea explícitamente tempo.
 */
export function enforcePolarized(
  items: Array<{ plan: any; tss: number; minutes: number; ctx: ValidateCtx }>,
  maxGreyPct = 20,
): void {
  const totalSec = items.reduce(
    (a, i) => a + (i.plan.steps as any[]).reduce((b, s) => b + (Number(s.duration_seconds) || 0), 0),
    0,
  );
  if (totalSec <= 0) return;
  const greySec = () =>
    items.reduce(
      (a, i) =>
        a + (i.plan.steps as any[]).reduce((b, s) => b + ((Number(s.zone) || 0) === 3 ? Number(s.duration_seconds) || 0 : 0), 0),
      0,
    );
  const limit = (maxGreyPct / 100) * totalSec;
  if (greySec() <= limit) return;

  for (const it of items) {
    if (greySec() <= limit) break;
    const goal = String(it.plan?.session_goal ?? "").toLowerCase();
    if (goal === "tempo" || goal === "fuerza_resistencia") continue;
    let changed = false;
    for (const s of it.plan.steps as any[]) {
      if ((Number(s.zone) || 0) === 3) {
        s.zone = 2;
        changed = true;
      }
    }
    if (!changed) continue;
    const re = validateWorkout(it.plan, it.ctx);
    it.plan = { ...re.plan, polarized_note: "Zona gris Z3 reducida a Z2 para mantener el reparto polarizado" };
    it.tss = re.tss;
    it.minutes = re.minutes;
  }
}

