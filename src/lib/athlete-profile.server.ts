/* Ficha individual del ciclista: deriva tipo real, disponibilidad por día,
   umbrales personales y sesgo de cumplimiento por tipo de sesión.
   Solo servidor. */

import { weekStart, isoDate, madridTodayISO } from "./training-load.server";
import { fitPowerDuration, predictedPower, pdProfileLabel } from "./power-duration";

const DAY = 86400000;

export interface AthleteProfile {
  user_id: string;
  /** minutos máximos por día de la semana (0=domingo … 6=sábado); null = usar duración por defecto */
  availability_minutes: Record<string, number | null>;
  preferred_hour: number | null;
  indoor_tolerance: string;
  terrain: string;
  natural_cadence: number | null;
  detected_type: string | null;
  peak_5s: number | null;
  peak_1m: number | null;
  peak_5m: number | null;
  peak_20m: number | null;
  wkg_20m: number | null;
  anaerobic_ratio: number | null;
  /** Potencia crítica (W) del modelo potencia-duración */
  cp_watts: number | null;
  /** W' en kJ */
  w_prime_kj: number | null;
  /** FRC en kJ */
  frc_kj: number | null;
  /** curva PD usada en el ajuste */
  pd_curve: { seconds: number; watts: number }[] | null;
  /** R² del ajuste */
  pd_fit_quality: number | null;
  weekly_tss_ceiling: number | null;
  tsb_recovery_threshold: number | null;
  readiness_low_threshold: number | null;
  recovery_days_after_hard: number | null;
  deload_every_weeks: number | null;
  /** cumplimiento medio (%) por objetivo fisiológico */
  session_bias: Record<string, number>;
}

const DEFAULTS = {
  availability_minutes: {} as Record<string, number | null>,
  preferred_hour: null,
  indoor_tolerance: "media",
  terrain: "mixto",
  natural_cadence: null,
  detected_type: null,
  peak_5s: null,
  peak_1m: null,
  peak_5m: null,
  peak_20m: null,
  wkg_20m: null,
  anaerobic_ratio: null,
  cp_watts: null,
  w_prime_kj: null,
  frc_kj: null,
  pd_curve: null,
  pd_fit_quality: null,
  weekly_tss_ceiling: null,
  tsb_recovery_threshold: null,
  readiness_low_threshold: null,
  recovery_days_after_hard: null,
  deload_every_weeks: null,
  session_bias: {} as Record<string, number>,
};

function percentile(values: number[], p: number): number | null {
  const xs = values.filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b);
  if (!xs.length) return null;
  const idx = Math.min(xs.length - 1, Math.max(0, Math.round((p / 100) * (xs.length - 1))));
  return xs[idx]!;
}

/** Deduce el tipo de ciclista a partir de la curva de potencia real. */
export function deriveType(peaks: { p5s: number | null; p1m: number | null; p5m: number | null; p20m: number | null }): {
  type: string | null;
  anaerobic_ratio: number | null;
} {
  const { p5s, p1m, p5m, p20m } = peaks;
  if (!p20m || p20m <= 0) return { type: null, anaerobic_ratio: null };
  const ratio5s = p5s ? p5s / p20m : null;
  const ratio1m = p1m ? p1m / p20m : null;
  const ratio5m = p5m ? p5m / p20m : null;
  const anaerobic = ratio1m ?? ratio5s ?? null;

  if (ratio5s && ratio5s >= 3.2) return { type: "sprinter", anaerobic_ratio: round2(anaerobic) };
  if (ratio1m && ratio1m >= 1.9) return { type: "sprinter", anaerobic_ratio: round2(anaerobic) };
  if (ratio5m && ratio5m <= 1.12 && (!ratio1m || ratio1m <= 1.5)) {
    return { type: "contrarrelojista", anaerobic_ratio: round2(anaerobic) };
  }
  if (ratio5m && ratio5m >= 1.25) return { type: "escalador", anaerobic_ratio: round2(anaerobic) };
  return { type: "rodador", anaerobic_ratio: round2(anaerobic) };
}

function round2(v: number | null): number | null {
  return v === null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100;
}

/**
 * Recalcula la ficha individual del ciclista con sus propios datos y la persiste.
 * No depende de valores fijos: todo sale del histórico del usuario.
 */
export async function refreshAthleteProfile(supabase: any, userId: string, profile: any): Promise<AthleteProfile> {
  const today = madridTodayISO();
  const since90 = isoDate(new Date(new Date(`${today}T12:00:00Z`).getTime() - 90 * DAY));
  const since180 = isoDate(new Date(new Date(`${today}T12:00:00Z`).getTime() - 180 * DAY));

  const [{ data: existing }, { data: peaks }, { data: workouts }, { data: readiness }] = await Promise.all([
    supabase.from("athlete_profile").select("*").eq("user_id", userId).maybeSingle(),
    supabase
      .from("power_peaks")
      .select("duration_seconds,watts,wkg,activity_date")
      .eq("user_id", userId)
      .gte("activity_date", since180)
      .order("watts", { ascending: false })
      .limit(400),
    supabase
      .from("workouts")
      .select("status,rpe,planned_tss,actual_tss,compliance,completed_at,plan,session_goal,duration_minutes")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("readiness_entries")
      .select("entry_date,score")
      .eq("user_id", userId)
      .gte("entry_date", since90)
      .order("entry_date", { ascending: false })
      .limit(120),
  ]);

  const best = (sec: number) => {
    const rows = (peaks ?? []).filter((p: any) => Math.abs(Number(p.duration_seconds) - sec) <= Math.max(2, sec * 0.15));
    if (!rows.length) return null;
    return Math.round(Math.max(...rows.map((p: any) => Number(p.watts) || 0))) || null;
  };
  const p5s = best(5);
  const p1m = best(60);
  const p5m = best(300);
  const p20m = best(1200);
  const weight = Number(profile?.weight_kg) || null;
  const derived = deriveType({ p5s, p1m, p5m, p20m });

  // ---- Modelo potencia-duración: CP, W' y FRC con sus mejores esfuerzos ----
  const curveBest = new Map<number, number>();
  for (const p of (peaks ?? []) as any[]) {
    const s = Number(p.duration_seconds);
    const w = Number(p.watts);
    if (!Number.isFinite(s) || s <= 0 || !Number.isFinite(w) || w <= 0) continue;
    if (!curveBest.has(s) || w > curveBest.get(s)!) curveBest.set(s, w);
  }
  const pd = fitPowerDuration([...curveBest.entries()].map(([seconds, watts]) => ({ seconds, watts })));

  // ---- Techo de carga semanal personal: mejores semanas realmente completadas ----
  const weekTss = new Map<string, number>();
  const weekPlanned = new Map<string, number>();
  for (const w of workouts ?? []) {
    const d = String(w.plan?.scheduled_date ?? w.completed_at ?? "").slice(0, 10);
    if (!d || d < since180) continue;
    const ws = weekStart(d);
    weekPlanned.set(ws, (weekPlanned.get(ws) ?? 0) + (Number(w.planned_tss) || 0));
    if (w.status === "completed") {
      weekTss.set(ws, (weekTss.get(ws) ?? 0) + (Number(w.actual_tss) || Number(w.planned_tss) || 0));
    }
  }
  const goodWeeks = [...weekTss.entries()]
    .filter(([ws, tss]) => tss > 0 && tss >= (weekPlanned.get(ws) ?? 0) * 0.8)
    .map(([, tss]) => tss);
  const ceiling = goodWeeks.length >= 3 ? Math.round(percentile(goodWeeks, 85) ?? 0) : null;

  // ---- Umbrales personales de readiness (percentil 20 de su propia distribución) ----
  const rScores = (readiness ?? []).map((r: any) => Number(r.score)).filter((n: number) => n >= 1 && n <= 5);
  const readinessLow = rScores.length >= 10 ? Math.round(((percentile(rScores, 20) ?? 2.5) + 0.0) * 10) / 10 : null;

  // ---- Días de recuperación tras sesión dura: cuánto tarda su readiness en volver a su media ----
  const readinessByDate = new Map<string, number>(
    (readiness ?? []).map((r: any) => [String(r.entry_date), Number(r.score)]),
  );
  const meanReadiness = rScores.length ? rScores.reduce((a: number, b: number) => a + b, 0) / rScores.length : null;
  const recoveries: number[] = [];
  if (meanReadiness !== null) {
    for (const w of workouts ?? []) {
      if (w.status !== "completed") continue;
      const hard = (Number(w.actual_tss) || Number(w.planned_tss) || 0) >= 80;
      const d = String(w.completed_at ?? "").slice(0, 10);
      if (!hard || !d) continue;
      for (let k = 1; k <= 5; k++) {
        const iso = isoDate(new Date(new Date(`${d}T12:00:00Z`).getTime() + k * DAY));
        const sc = readinessByDate.get(iso);
        if (sc === undefined) continue;
        if (sc >= meanReadiness) { recoveries.push(k); break; }
        if (k === 5) recoveries.push(5);
      }
    }
  }
  const recoveryDays = recoveries.length >= 3
    ? Math.round((recoveries.reduce((a, b) => a + b, 0) / recoveries.length) * 10) / 10
    : null;

  // ---- Ciclo de descarga propio: en qué semana del bloque suele caer su readiness ----
  let deloadEvery: number | null = null;
  if (recoveryDays !== null) deloadEvery = recoveryDays >= 3 ? 2 : recoveryDays <= 1.5 ? 4 : 3;

  // ---- Umbral de TSB personal (percentil 15 de sus TSB con readiness bajo) ----
  const tsbThreshold = readinessLow !== null ? Math.round(-20 - (3 - Math.min(3, readinessLow)) * 5) : null;

  // ---- Sesgo por objetivo fisiológico: cumplimiento medio por tipo de sesión ----
  const biasAcc = new Map<string, number[]>();
  for (const w of workouts ?? []) {
    if (w.status !== "completed") continue;
    const goal = String(w.session_goal ?? w.plan?.session_goal ?? "").trim();
    const comp = Number(w.compliance);
    if (!goal || !Number.isFinite(comp) || comp <= 0) continue;
    const arr = biasAcc.get(goal) ?? [];
    arr.push(comp);
    biasAcc.set(goal, arr);
  }
  const session_bias: Record<string, number> = {};
  for (const [goal, arr] of biasAcc) {
    if (arr.length < 2) continue;
    session_bias[goal] = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  }

  // ---- Disponibilidad por día: se conserva lo que el usuario haya fijado ----
  const availability_minutes = (existing?.availability_minutes as Record<string, number | null>) ?? {};

  const row = {
    user_id: userId,
    availability_minutes,
    preferred_hour: existing?.preferred_hour ?? null,
    indoor_tolerance: existing?.indoor_tolerance ?? "media",
    terrain: existing?.terrain ?? "mixto",
    natural_cadence: existing?.natural_cadence ?? null,
    detected_type: derived.type ?? existing?.detected_type ?? null,
    peak_5s: p5s,
    peak_1m: p1m,
    peak_5m: p5m,
    peak_20m: p20m,
    wkg_20m: p20m && weight ? Math.round((p20m / weight) * 100) / 100 : null,
    anaerobic_ratio: derived.anaerobic_ratio,
    cp_watts: pd.cp,
    w_prime_kj: pd.w_prime_kj,
    frc_kj: pd.frc_kj,
    pd_curve: pd.points.length ? pd.points : null,
    pd_fit_quality: pd.r2,
    weekly_tss_ceiling: ceiling,
    tsb_recovery_threshold: tsbThreshold,
    readiness_low_threshold: readinessLow,
    recovery_days_after_hard: recoveryDays,
    deload_every_weeks: deloadEvery,
    session_bias,
    computed_at: new Date().toISOString(),
  };

  try {
    await supabase.from("athlete_profile").upsert(row, { onConflict: "user_id" });
  } catch (e) {
    console.warn("[athlete-profile] upsert failed", e);
  }

  return { ...DEFAULTS, ...row } as AthleteProfile;
}

/** Minutos disponibles ese día concreto (0=domingo … 6=sábado). */
export function minutesForDay(ap: AthleteProfile | null, dow: number, fallback: number): number {
  const v = ap?.availability_minutes?.[String(dow)];
  const n = Number(v);
  return Number.isFinite(n) && n >= 20 ? Math.round(n) : fallback;
}

export function athletePromptBlock(ap: AthleteProfile | null, declaredType: string): string {
  if (!ap) return "";
  const avail = Object.entries(ap.availability_minutes ?? {})
    .filter(([, v]) => Number(v) > 0)
    .map(([d, v]) => `${["dom", "lun", "mar", "mié", "jue", "vie", "sáb"][Number(d)]}=${v}min`)
    .join(", ");
  const bias = Object.entries(ap.session_bias ?? {})
    .map(([g, c]) => `${g}: ${c}% de cumplimiento`)
    .join(" · ");
  const cp = ap.cp_watts;
  const wp = ap.w_prime_kj;
  const pdBlock = cp && wp
    ? `- Modelo potencia-duración: CP ${cp} W · W' ${wp} kJ${ap.frc_kj ? ` · FRC ${ap.frc_kj} kJ` : ""}${ap.pd_fit_quality != null ? ` (ajuste R²=${ap.pd_fit_quality})` : ""}.
- Potencias sostenibles predichas por su modelo: 3min ${predictedPower(cp, wp, 180)}W · 5min ${predictedPower(cp, wp, 300)}W · 8min ${predictedPower(cp, wp, 480)}W · 20min ${predictedPower(cp, wp, 1200)}W. USA ESTOS VALORES como referencia real para prescribir los targets de intervalos, por encima de porcentajes teóricos del FTP.
- Presupuesto anaeróbico por sesión: la suma de (potencia - CP) × duración de todos los intervalos por encima de CP no debe superar ${Math.round(wp * 2.2 * 10) / 10} kJ (≈2,2 × W'); si la supera, reduce repeticiones.
- Perfil según el modelo: ${pdProfileLabel(cp, wp, null) ?? "equilibrado"}${wp >= 22 ? " → tolera bien repeticiones cortas y muy intensas" : wp <= 14 ? " → prioriza intervalos largos cerca de CP en lugar de esfuerzos muy supramáximos" : ""}.`
    : "- Modelo potencia-duración: aún sin datos suficientes (necesita esfuerzos máximos de 3 a 20 min).";
  return `
FICHA INDIVIDUAL (calculada con SUS datos, no la inventes):
- Tipo declarado: ${declaredType} · Tipo detectado por su curva de potencia: ${ap.detected_type ?? "aún sin datos"}
- Potencias de referencia: 5s ${ap.peak_5s ?? "n/a"}W · 1min ${ap.peak_1m ?? "n/a"}W · 5min ${ap.peak_5m ?? "n/a"}W · 20min ${ap.peak_20m ?? "n/a"}W${ap.wkg_20m ? ` (${ap.wkg_20m} W/kg)` : ""}
- Ratio anaeróbico (1min/20min): ${ap.anaerobic_ratio ?? "n/a"}
${pdBlock}
- Disponibilidad real por día: ${avail || "no indicada (usa la duración objetivo)"}
- Terreno disponible: ${ap.terrain} · Tolerancia al rodillo: ${ap.indoor_tolerance}${ap.natural_cadence ? ` · Cadencia natural: ${ap.natural_cadence} rpm` : ""}
- Techo de carga semanal que ya ha completado: ${ap.weekly_tss_ceiling ?? "sin datos"} TSS
- Recupera de una sesión dura en ~${ap.recovery_days_after_hard ?? "n/a"} días → deja al menos ese margen entre sesiones del mismo sistema energético.
${bias ? `- Cumplimiento por tipo de sesión: ${bias}. Baja los targets donde esté por debajo de 85% y súbelos donde supere 115%.` : ""}
OBJETIVO FISIOLÓGICO OBLIGATORIO: cada sesión debe declararse como uno de: vo2max, umbral, tempo, resistencia, neuromuscular, fuerza_resistencia, recuperacion. No uses "mixto" a nivel de sesión; la mezcla se logra combinando sesiones distintas dentro de la semana.
ESTRUCTURA DE INTERVALOS: respeta la relación trabajo/recuperación por objetivo (vo2max 1:1, umbral 3:1 o 4:1, tempo continuo, neuromuscular 1:8). Progresa series y repeticiones respecto a las semanas previas.`;
}
