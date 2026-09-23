/* Ajuste rápido de la sesión de hoy: menos tiempo y/o menor intensidad.
   Determinista (sin IA) para respuesta inmediata. Solo servidor. */

import { estimatePlanTss, madridTodayISO } from "./training-load.server";

export type AdjustMode = { minutes?: number | null; easier?: boolean; harder?: boolean };

const KEEP_FULL = new Set(["warmup", "cooldown"]);

export function adjustPlan(plan: any, mode: AdjustMode, refs: { ftp: number | null; lthr: number | null; maxHr: number | null }) {
  const steps: any[] = Array.isArray(plan?.steps) ? plan.steps.map((s: any) => ({ ...s })) : [];
  if (!steps.length) return { plan, minutes: 0, tss: 0, notes: [] as string[] };

  const notes: string[] = [];
  const totalSec = steps.reduce((a, s) => a + (Number(s.duration_seconds) || 0), 0);

  // 1) Menos tiempo: recorta proporcionalmente los bloques centrales
  if (mode.minutes && mode.minutes > 0) {
    const targetSec = Math.round(mode.minutes * 60);
    if (targetSec < totalSec) {
      const fixedSec = steps
        .filter((s) => KEEP_FULL.has(s.intensity))
        .reduce((a, s) => a + (Number(s.duration_seconds) || 0), 0);
      // El calentamiento/vuelta a la calma también se recortan si hace falta
      let fixedScale = 1;
      if (fixedSec > targetSec * 0.5) fixedScale = (targetSec * 0.4) / fixedSec;
      const availableSec = Math.max(60, targetSec - fixedSec * fixedScale);
      const varSec = totalSec - fixedSec;
      const varScale = varSec > 0 ? availableSec / varSec : 1;

      for (const s of steps) {
        const sec = Number(s.duration_seconds) || 0;
        if (!sec) continue;
        const scale = KEEP_FULL.has(s.intensity) ? fixedScale : varScale;
        s.duration_seconds = Math.max(60, Math.round((sec * scale) / 30) * 30);
      }
      notes.push(`Duración ajustada a ~${mode.minutes} min`);
    }
  }

  // 2) Más suave: baja un escalón la intensidad de los bloques duros
  if (mode.easier) {
    for (const s of steps) {
      if (s.intensity === "interval") s.intensity = "active";
      const low = Number(s.target_low) || 0;
      const high = Number(s.target_high) || 0;
      if (s.target === "power" && low > 0) {
        s.target_low = Math.round(low * 0.88);
        s.target_high = Math.round(high * 0.88);
      } else if (s.target === "hr" && low > 0) {
        s.target_low = Math.round(low * 0.94);
        s.target_high = Math.round(high * 0.94);
      }
    }
    notes.push("Intensidad reducida (bloques duros a ritmo tempo/Z2)");
  }

  // 3) Más caña: sube un escalón los bloques de trabajo
  if (mode.harder) {
    for (const s of steps) {
      if (s.intensity === "active") s.intensity = "interval";
      const low = Number(s.target_low) || 0;
      const high = Number(s.target_high) || 0;
      if (s.target === "power" && low > 0) {
        s.target_low = Math.round(low * 1.08);
        s.target_high = Math.round(high * 1.08);
      } else if (s.target === "hr" && low > 0) {
        s.target_low = Math.round(low * 1.04);
        s.target_high = Math.round(high * 1.04);
      }
    }
    notes.push("Intensidad aumentada (bloques de trabajo más exigentes)");
  }

  const minutes = Math.round(steps.reduce((a, s) => a + (Number(s.duration_seconds) || 0), 0) / 60);
  const newPlan = {
    ...plan,
    steps,
    adjusted_at: new Date().toISOString(),
    adjust_notes: notes.join(" · "),
    summary: `${plan?.summary ?? ""}${notes.length ? ` [Ajustado hoy: ${notes.join(" · ")}]` : ""}`.trim(),
  };
  const tss = estimatePlanTss(newPlan, refs.ftp, refs.lthr, refs.maxHr, minutes);
  return { plan: newPlan, minutes, tss, notes };
}

/** Sustituye la sesión por un rodaje muy suave en Z1 (descanso activo). */
export function buildRecoveryPlan(
  plan: any,
  minutes: number,
  refs: { ftp: number | null; lthr: number | null; maxHr: number | null },
) {
  const total = Math.max(20, Math.min(60, Math.round(minutes)));
  const warm = Math.round(total * 0.2) * 60;
  const cool = Math.round(total * 0.2) * 60;
  const main = Math.max(300, total * 60 - warm - cool);

  const ftp = Number(refs.ftp) || 0;
  const maxHr = Number(refs.maxHr) || 0;
  const useHr = !ftp && maxHr > 0;
  const band = (loPct: number, hiPct: number) =>
    useHr
      ? { target: "hr", target_low: Math.round(maxHr * loPct), target_high: Math.round(maxHr * hiPct) }
      : ftp
        ? { target: "power", target_low: Math.round(ftp * loPct), target_high: Math.round(ftp * hiPct) }
        : { target: "rpe", target_low: 2, target_high: 3 };

  const steps = [
    { name: "Activación suave", intensity: "warmup", duration_seconds: warm, ...band(0.45, 0.55), cadence: "85-95 rpm" },
    { name: "Rodaje Z1 (descanso activo)", intensity: "recovery", duration_seconds: main, ...band(0.5, 0.58), cadence: "90-95 rpm, sin forzar" },
    { name: "Vuelta a la calma", intensity: "cooldown", duration_seconds: cool, ...band(0.4, 0.5), cadence: "libre" },
  ];

  const newPlan = {
    ...plan,
    title: "Recuperación activa (Z1)",
    session_goal: "recuperacion",
    energy_system: "aerobico_ligero",
    steps,
    adjusted_at: new Date().toISOString(),
    adjust_notes: "Sesión cambiada a recuperación activa en Z1",
    summary: `Rodaje muy suave de ${total} min en Z1 para favorecer la recuperación. Sin intervalos ni esfuerzos.`,
  };
  const tss = estimatePlanTss(newPlan, refs.ftp, refs.lthr, refs.maxHr, total);
  return { plan: newPlan, minutes: total, tss };
}

/** Devuelve la sesión pendiente de hoy (si existe). */
export async function todayWorkout(supabase: any, userId: string) {
  const today = madridTodayISO();
  const { data } = await supabase
    .from("workouts")
    .select("*")
    .eq("user_id", userId)
    .neq("status", "completed")
    .limit(100);
  return ((data ?? []) as any[]).find((w) => (w.plan as any)?.scheduled_date === today) ?? null;
}
