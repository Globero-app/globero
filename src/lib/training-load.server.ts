/* Motor de carga de entrenamiento: TSS, CTL/ATL/TSB, adherencia y tendencias.
   Solo servidor: no importar desde el cliente. */

export interface LoadPoint {
  date: string; // YYYY-MM-DD
  tss: number;
}

export interface TrainingLoadSummary {
  ctl: number;
  atl: number;
  tsb: number;
  weekly: Array<{ week_start: string; tss: number }>;
  ramp_pct: number | null;
  avg_weekly_tss_3w: number;
  adherence_pct: number | null;
  planned_28d: number;
  completed_28d: number;
  avg_rpe: number | null;
  readiness_7d: number | null;
  readiness_14d: number | null;
  readiness_trend: "up" | "down" | "flat" | "unknown";
  daily: LoadPoint[];
}

export interface WeekPrescription {
  target_tss: number;
  mode: "recovery" | "maintain" | "build" | "overload";
  reason: string;
  hard_sessions_max: number;
  polarized_note: string;
}

const DAY = 86400000;

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function madridTodayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Inicio de semana (lunes) en ISO. */
export function weekStart(dateISO: string): string {
  const d = new Date(`${dateISO}T12:00:00Z`);
  const dow = d.getUTCDay(); // 0 dom
  const diff = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return isoDate(d);
}

/** TSS de una actividad: usa la carga real de Intervals.icu y estima si no existe. */
export function estimateActivityTss(a: {
  moving_time?: number | null;
  average_watts?: number | null;
  average_heartrate?: number | null;
  icu_training_load?: number | null;
  suffer_score?: number | null;
}, ftp: number | null, lthr: number | null, maxHr: number | null): number {
  // 0) Carga real calculada por Intervals.icu
  if (a.icu_training_load && Number(a.icu_training_load) > 0) return Math.round(Number(a.icu_training_load));
  const hours = (Number(a.moving_time) || 0) / 3600;
  if (hours <= 0) return 0;

  // 1) Potencia
  if (ftp && ftp > 0 && a.average_watts && a.average_watts > 0) {
    const intensity = Number(a.average_watts) / ftp;
    return Math.round(hours * intensity * intensity * 100);
  }
  // 2) Frecuencia cardíaca (hrTSS aproximado sobre LTHR)
  const ref = lthr && lthr > 0 ? lthr : maxHr && maxHr > 0 ? Math.round(maxHr * 0.92) : null;
  if (ref && a.average_heartrate && a.average_heartrate > 0) {
    const ratio = Number(a.average_heartrate) / ref;
    return Math.round(hours * ratio * ratio * 100);
  }
  // 3) Suffer score
  if (a.suffer_score && a.suffer_score > 0) return Math.round(Number(a.suffer_score));
  // 4) Fallback: ~50 TSS/h (Z2)
  return Math.round(hours * 50);
}

/** TSS estimado de un entrenamiento planificado a partir de sus steps. */
export function estimatePlanTss(plan: any, ftp: number | null, lthr: number | null, maxHr: number | null, fallbackMinutes = 60): number {
  const steps: any[] = Array.isArray(plan?.steps) ? plan.steps : [];
  if (!steps.length) return Math.round((fallbackMinutes / 60) * 55);
  const hrRef = lthr && lthr > 0 ? lthr : maxHr && maxHr > 0 ? Math.round(maxHr * 0.92) : null;
  let sumIf2Sec = 0;
  let totalSec = 0;
  for (const s of steps) {
    const sec = Number(s?.duration_seconds) || 0;
    if (sec <= 0) continue;
    totalSec += sec;
    let intensity = 0.55;
    const mid = ((Number(s?.target_low) || 0) + (Number(s?.target_high) || 0)) / 2;
    if (s?.target === "power" && ftp && ftp > 0 && mid > 0) intensity = mid / ftp;
    else if (s?.target === "hr" && hrRef && mid > 0) intensity = mid / hrRef;
    else {
      const byIntensity: Record<string, number> = {
        warmup: 0.55, recovery: 0.5, rest: 0.4, cooldown: 0.5, active: 0.7, interval: 1.0,
      };
      intensity = byIntensity[s?.intensity] ?? 0.6;
    }
    intensity = Math.min(1.6, Math.max(0.3, intensity));
    sumIf2Sec += intensity * intensity * sec;
  }
  if (totalSec <= 0) return Math.round((fallbackMinutes / 60) * 55);
  return Math.round((sumIf2Sec / 3600) * 100);
}

/** Serie diaria de TSS -> CTL/ATL exponenciales. */
export function computeCtlAtl(daily: LoadPoint[], todayISO: string): { ctl: number; atl: number } {
  const map = new Map(daily.map((d) => [d.date, d.tss]));
  const start = new Date(`${todayISO}T12:00:00Z`).getTime() - 90 * DAY;
  let ctl = 0;
  let atl = 0;
  const kC = 1 - Math.exp(-1 / 42);
  const kA = 1 - Math.exp(-1 / 7);
  for (let t = start; t <= new Date(`${todayISO}T12:00:00Z`).getTime(); t += DAY) {
    const iso = isoDate(new Date(t));
    const tss = map.get(iso) ?? 0;
    ctl = ctl + (tss - ctl) * kC;
    atl = atl + (tss - atl) * kA;
  }
  return { ctl: Math.round(ctl * 10) / 10, atl: Math.round(atl * 10) / 10 };
}

/** Recopila métricas del ciclista para alimentar la generación. */
export async function buildTrainingLoad(supabase: any, userId: string, profile: any): Promise<TrainingLoadSummary> {
  const today = madridTodayISO();
  const since = isoDate(new Date(new Date(`${today}T12:00:00Z`).getTime() - 90 * DAY));

  const ftp: number | null = profile?.ftp ?? null;
  const lthr: number | null = profile?.lthr ?? null;
  const maxHr: number | null = profile?.max_hr ?? null;

  const [{ data: acts }, { data: workouts }] = await Promise.all([
    supabase
      .from("intervals_activities")
      .select("moving_time,average_watts,average_heartrate,icu_training_load,start_date,distance,total_elevation_gain,name")
      .eq("user_id", userId)
      .gte("start_date", `${since}T00:00:00Z`)
      .order("start_date", { ascending: false })
      .limit(300),
    supabase
      .from("workouts")
      .select("id,status,rpe,duration_minutes,plan,completed_at,created_at,planned_tss,actual_tss,compliance")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const dailyMap = new Map<string, number>();
  for (const a of acts ?? []) {
    const d = String(a.start_date ?? "").slice(0, 10);
    if (!d) continue;
    const tss = estimateActivityTss(a, ftp, lthr, maxHr);
    dailyMap.set(d, (dailyMap.get(d) ?? 0) + tss);
  }

  // Si no hay actividades, usa entrenos completados como fuente de carga
  if (!dailyMap.size) {
    for (const w of workouts ?? []) {
      if (w.status !== "completed") continue;
      const d = String(w.completed_at ?? w.plan?.scheduled_date ?? "").slice(0, 10);
      if (!d || d < since) continue;
      const tss = Number(w.actual_tss) || Number(w.planned_tss) || estimatePlanTss(w.plan, ftp, lthr, maxHr, w.duration_minutes);
      dailyMap.set(d, (dailyMap.get(d) ?? 0) + tss);
    }
  }

  const daily: LoadPoint[] = [...dailyMap.entries()].map(([date, tss]) => ({ date, tss })).sort((a, b) => a.date.localeCompare(b.date));
  const { ctl, atl } = computeCtlAtl(daily, today);

  // Carga por semana (últimas 6, semanas de calendario continuas con relleno a 0)
  const weekMap = new Map<string, number>();
  for (const p of daily) weekMap.set(weekStart(p.date), (weekMap.get(weekStart(p.date)) ?? 0) + p.tss);
  const currentWeekStart = weekStart(today);
  const weekly: Array<{ week_start: string; tss: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const ws = isoDate(new Date(new Date(`${currentWeekStart}T12:00:00Z`).getTime() - i * 7 * DAY));
    weekly.push({ week_start: ws, tss: Math.round(weekMap.get(ws) ?? 0) });
  }

  const last3 = weekly.slice(-4, -1); // 3 semanas de calendario previas a la actual
  const avg3 = last3.length ? last3.reduce((s, w) => s + w.tss, 0) / last3.length : 0;
  const currentWeek = weekly[weekly.length - 1]!.tss;
  // Solo tiene sentido hablar de rampa con una base previa suficiente y carga real esta semana
  const ramp_pct =
    avg3 >= 100 && currentWeek >= 50 ? Math.round(((currentWeek - avg3) / avg3) * 1000) / 10 : null;


  // Adherencia 28 días sobre entrenos planificados con fecha pasada
  const from28 = isoDate(new Date(new Date(`${today}T12:00:00Z`).getTime() - 28 * DAY));
  let planned28 = 0;
  let completed28 = 0;
  const rpes: number[] = [];
  for (const w of workouts ?? []) {
    const sched = String(w.plan?.scheduled_date ?? "").slice(0, 10);
    const ref = sched || String(w.created_at ?? "").slice(0, 10);
    if (!ref || ref < from28 || ref > today) continue;
    planned28++;
    if (w.status === "completed") {
      completed28++;
      if (typeof w.rpe === "number") rpes.push(w.rpe);
    }
  }
  const adherence_pct = planned28 > 0 ? Math.round((completed28 / planned28) * 100) : null;
  const avg_rpe = rpes.length ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10 : null;

  const { data: readiness } = await supabase
    .from("readiness_entries")
    .select("entry_date,score")
    .eq("user_id", userId)
    .order("entry_date", { ascending: false })
    .limit(14);
  const rArr = (readiness ?? []) as Array<{ entry_date: string; score: number }>;
  const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
  const readiness_7d = avg(rArr.slice(0, 7).map((r) => r.score));
  const readiness_14d = avg(rArr.map((r) => r.score));
  const prev7 = avg(rArr.slice(7, 14).map((r) => r.score));
  let readiness_trend: TrainingLoadSummary["readiness_trend"] = "unknown";
  if (readiness_7d !== null && prev7 !== null) {
    const diff = readiness_7d - prev7;
    readiness_trend = diff > 0.3 ? "up" : diff < -0.3 ? "down" : "flat";
  }

  return {
    ctl,
    atl,
    tsb: Math.round((ctl - atl) * 10) / 10,
    weekly,
    ramp_pct,
    avg_weekly_tss_3w: Math.round(avg3),
    adherence_pct,
    planned_28d: planned28,
    completed_28d: completed28,
    avg_rpe,
    readiness_7d,
    readiness_14d,
    readiness_trend,
    daily: daily.slice(-90),
  };
}

/** Reglas duras: decide el TSS objetivo de la semana y el modo. */
export function prescribeWeek(load: TrainingLoadSummary, opts: {
  sessions: number;
  duration_minutes: number;
  block_week_index?: number; // 1..4 (4 = descarga)
  deload?: boolean;
  /** Multiplicador de sobrecarga progresiva del bloque (periodización). */
  progression_factor?: number;
  /** Umbrales personales del ciclista (ficha individual). */
  personal?: {
    weekly_tss_ceiling?: number | null;
    tsb_recovery_threshold?: number | null;
    readiness_low_threshold?: number | null;
    deload_every_weeks?: number | null;
  } | null;
}): WeekPrescription {
  const base = load.avg_weekly_tss_3w > 0
    ? load.avg_weekly_tss_3w
    : Math.round(opts.sessions * (opts.duration_minutes / 60) * 60);

  const p = opts.personal ?? {};
  const tsbLimit = Number.isFinite(Number(p.tsb_recovery_threshold)) ? Number(p.tsb_recovery_threshold) : -25;
  const readinessLimit = Number.isFinite(Number(p.readiness_low_threshold)) ? Number(p.readiness_low_threshold) : 2.5;
  const ceiling = Number(p.weekly_tss_ceiling) > 0 ? Number(p.weekly_tss_ceiling) : null;

  const reasons: string[] = [];
  let factor = 1.06;
  let mode: WeekPrescription["mode"] = "build";
  let hard = Math.max(1, Math.min(3, Math.round(opts.sessions / 2)));

  const cycle = Number(p.deload_every_weeks) >= 2 ? Number(p.deload_every_weeks) : 4;
  const deload = opts.deload || (opts.block_week_index ? opts.block_week_index % cycle === 0 : false);

  if (load.tsb < tsbLimit || (load.readiness_7d !== null && load.readiness_7d <= readinessLimit) || (load.adherence_pct !== null && load.adherence_pct < 60)) {
    mode = "recovery";
    factor = 0.6;
    hard = 1;
    reasons.push(
      load.tsb < tsbLimit ? `fatiga alta (TSB ${load.tsb}, su umbral ${tsbLimit})` : "",
      load.readiness_7d !== null && load.readiness_7d <= readinessLimit ? `readiness bajo (${load.readiness_7d}/5, su umbral ${readinessLimit})` : "",
      load.adherence_pct !== null && load.adherence_pct < 60 ? `adherencia ${load.adherence_pct}%` : "",
    );
  } else if (deload) {
    mode = "recovery";
    factor = 0.62;
    hard = 1;
    reasons.push(`descarga programada (ciclo personal ${cycle}:1)`);
  } else if (load.tsb > 10 && (load.readiness_7d === null || load.readiness_7d >= 4)) {
    mode = "overload";
    factor = 1.12;
    hard = Math.min(opts.sessions, hard + 1);
    reasons.push(`muy fresco (TSB ${load.tsb}) y readiness alto`);
  } else if (load.avg_rpe !== null && load.avg_rpe >= 4.2) {
    mode = "maintain";
    factor = 0.95;
    reasons.push(`RPE medio elevado (${load.avg_rpe}/5)`);
  } else if (load.avg_rpe !== null && load.avg_rpe <= 2) {
    factor = 1.08;
    reasons.push(`RPE medio bajo (${load.avg_rpe}/5): margen para progresar`);
  } else {
    reasons.push("progresión estándar sobre la media de las 3 semanas previas");
  }

  const pf = Number(opts.progression_factor);
  if (Number.isFinite(pf) && pf > 0 && mode !== "recovery") {
    factor = pf * (factor / 1.06);
    reasons.push(`sobrecarga progresiva del bloque (x${pf.toFixed(2)})`);
  }

  let target = Math.round(base * factor);
  // Techo personal: nunca por encima de lo que ya ha completado bien (+8%)
  if (ceiling && mode !== "recovery" && target > ceiling * 1.08) {
    target = Math.round(ceiling * 1.08);
    reasons.push(`limitado a su techo personal (${ceiling} TSS)`);
  }

  return {
    target_tss: Math.max(40, target),

    mode,
    reason: reasons.filter(Boolean).join(" · "),
    hard_sessions_max: hard,
    polarized_note:
      mode === "recovery"
        ? "Reparto: 95% del tiempo en Z1-Z2, como máximo un bloque corto de calidad."
        : "Reparto polarizado: ~80% del tiempo total de la semana en Z1-Z2 y ~20% en Z4 o superior; evita la zona gris Z3 prolongada.",
  };
}

export function loadPromptBlock(load: TrainingLoadSummary, week: WeekPrescription): string {
  return `
ESTADO ACTUAL DEL CICLISTA (calculado, no estimes estos números):
- CTL (forma, 42d): ${load.ctl} · ATL (fatiga, 7d): ${load.atl} · TSB (frescura): ${load.tsb}
- Carga semanal reciente (TSS): ${load.weekly.map((w) => `${w.week_start}=${w.tss}`).join(", ") || "sin datos"}
- Media semanal 3 semanas previas: ${load.avg_weekly_tss_3w} TSS · Rampa actual: ${load.ramp_pct === null ? "n/a" : `${load.ramp_pct}%`}
- Adherencia 28d: ${load.adherence_pct === null ? "n/a" : `${load.adherence_pct}% (${load.completed_28d}/${load.planned_28d})`}
- RPE medio de los entrenos completados: ${load.avg_rpe ?? "n/a"}/5
- Readiness medio 7d: ${load.readiness_7d ?? "n/a"}/5 · 14d: ${load.readiness_14d ?? "n/a"}/5 · tendencia: ${load.readiness_trend}

PRESCRIPCIÓN DE LA SEMANA (OBLIGATORIA):
- Modo: ${week.mode.toUpperCase()} (${week.reason})
- TSS TOTAL OBJETIVO de la semana: ${week.target_tss} (±10%). Reparte ese total entre las sesiones.
- Máximo ${week.hard_sessions_max} sesión(es) dura(s) (Z4 o superior) en toda la semana; el resto aeróbicas.
- ${week.polarized_note}
- Nunca coloques dos sesiones duras en días consecutivos.
- En "summary" de cada sesión indica su TSS estimado.`;
}
