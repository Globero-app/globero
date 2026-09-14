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
