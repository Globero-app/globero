/* Progreso: series CTL/ATL/TSB, PRs de potencia y estado de umbrales.
   Solo servidor. */

import {
  estimateActivityTss,
  estimatePlanTss,
  isoDate,
  madridTodayISO,
  weekStart,
} from "./training-load.server";

const DAY = 86400000;

export interface ProgressPoint {
  date: string;
  tss: number;
  ctl: number;
  atl: number;
  tsb: number;
}

export interface PowerPr {
  key: string;
  label: string;
  watts: number;
  wkg: number | null;
  date: string;
  activity: string;
}

const PR_BUCKETS: Array<{ key: string; label: string; minSeconds: number }> = [
  { key: "20m", label: "≥ 20 min", minSeconds: 20 * 60 },
  { key: "45m", label: "≥ 45 min", minSeconds: 45 * 60 },
  { key: "1h", label: "≥ 1 h", minSeconds: 60 * 60 },
  { key: "2h", label: "≥ 2 h", minSeconds: 120 * 60 },
  { key: "3h", label: "≥ 3 h", minSeconds: 180 * 60 },
];

export async function buildProgress(supabase: any, userId: string, profile: any) {
  const today = madridTodayISO();
  const todayMs = new Date(`${today}T12:00:00Z`).getTime();
  const since365 = isoDate(new Date(todayMs - 365 * DAY));

  const ftp: number | null = profile?.ftp ?? null;
  const lthr: number | null = profile?.lthr ?? null;
  const maxHr: number | null = profile?.max_hr ?? null;
  const weight: number | null = profile?.weight_kg ? Number(profile.weight_kg) : null;

  const [{ data: acts }, { data: workouts }] = await Promise.all([
    supabase
      .from("strava_activities")
      .select("name,start_date,moving_time,distance,total_elevation_gain,average_watts,average_heartrate,suffer_score")
      .eq("user_id", userId)
      .gte("start_date", `${since365}T00:00:00Z`)
      .order("start_date", { ascending: false })
      .limit(1000),
    supabase
      .from("workouts")
      .select("status,plan,completed_at,planned_tss,actual_tss,duration_minutes,compliance")
      .eq("user_id", userId)
      .limit(400),
  ]);

  const activities = (acts ?? []) as any[];

  // ── Serie diaria de TSS ────────────────────────────────────────────
  const dailyMap = new Map<string, number>();
  for (const a of activities) {
    const d = String(a.start_date ?? "").slice(0, 10);
    if (!d) continue;
    dailyMap.set(d, (dailyMap.get(d) ?? 0) + estimateActivityTss(a, ftp, lthr, maxHr));
  }
  if (!dailyMap.size) {
    for (const w of (workouts ?? []) as any[]) {
      if (w.status !== "completed") continue;
      const d = String(w.completed_at ?? w.plan?.scheduled_date ?? "").slice(0, 10);
      if (!d) continue;
      const tss = Number(w.actual_tss) || Number(w.planned_tss) ||
        estimatePlanTss(w.plan, ftp, lthr, maxHr, w.duration_minutes);
      dailyMap.set(d, (dailyMap.get(d) ?? 0) + tss);
    }
  }

  const kC = 1 - Math.exp(-1 / 42);
  const kA = 1 - Math.exp(-1 / 7);
  let ctl = 0;
  let atl = 0;
  const series: ProgressPoint[] = [];
  const start = todayMs - 365 * DAY;
  for (let t = start; t <= todayMs; t += DAY) {
    const iso = isoDate(new Date(t));
    const tss = dailyMap.get(iso) ?? 0;
    ctl += (tss - ctl) * kC;
    atl += (tss - atl) * kA;
    series.push({
      date: iso,
      tss,
      ctl: Math.round(ctl * 10) / 10,
      atl: Math.round(atl * 10) / 10,
      tsb: Math.round((ctl - atl) * 10) / 10,
    });
  }

  // ── TSS semanal (últimas 16 semanas) ──────────────────────────────
  const weekMap = new Map<string, number>();
  for (const [d, tss] of dailyMap) weekMap.set(weekStart(d), (weekMap.get(weekStart(d)) ?? 0) + tss);
  const weekly = [...weekMap.entries()]
    .map(([week_start, tss]) => ({ week_start, tss: Math.round(tss) }))
    .sort((a, b) => a.week_start.localeCompare(b.week_start))
    .slice(-16);

  // ── PRs de potencia ───────────────────────────────────────────────
  const prs: PowerPr[] = [];
  for (const b of PR_BUCKETS) {
    let best: any = null;
    for (const a of activities) {
      const w = Number(a.average_watts) || 0;
      if (w <= 0) continue;
      if ((Number(a.moving_time) || 0) < b.minSeconds) continue;
      if (!best || w > Number(best.average_watts)) best = a;
    }
    if (best) {
      const watts = Math.round(Number(best.average_watts));
      prs.push({
        key: b.key,
        label: b.label,
        watts,
        wkg: weight ? Math.round((watts / weight) * 100) / 100 : null,
        date: String(best.start_date ?? "").slice(0, 10),
        activity: best.name ?? "Actividad",
      });
    }
  }

  // Récords de volumen
  const longest = activities.reduce(
    (m: any, a: any) => (!m || Number(a.distance) > Number(m.distance) ? a : m),
    null,
  );
  const climbiest = activities.reduce(
    (m: any, a: any) => (!m || Number(a.total_elevation_gain) > Number(m.total_elevation_gain) ? a : m),
    null,
  );

  const last = series[series.length - 1];
  return {
    series: series.slice(-180),
    weekly,
    prs,
    current: last ? { ctl: last.ctl, atl: last.atl, tsb: last.tsb } : { ctl: 0, atl: 0, tsb: 0 },
    ctl_30d_ago: series[series.length - 31]?.ctl ?? null,
    records: {
      longest_km: longest ? Math.round(Number(longest.distance) / 100) / 10 : null,
      longest_name: longest?.name ?? null,
      elevation_m: climbiest ? Math.round(Number(climbiest.total_elevation_gain)) : null,
      elevation_name: climbiest?.name ?? null,
      activities_12m: activities.length,
    },
    ftp,
    lthr,
    max_hr: maxHr,
    weight_kg: weight,
  };
}

export interface ThresholdStatus {
  stale: boolean;
  ftp_age_days: number | null;
  ftp: number | null;
  lthr: number | null;
  max_hr: number | null;
  suggested_ftp: number | null;
  suggested_lthr: number | null;
  reasons: string[];
  recommendation: string;
  suggested_test_date: string | null;
  suggested_basis: "power" | "hr";
}

/** Detecta si el FTP / LTHR están desactualizados y propone un test. */
export async function assessThresholds(supabase: any, userId: string, profile: any): Promise<ThresholdStatus> {
  const today = madridTodayISO();
  const todayMs = new Date(`${today}T12:00:00Z`).getTime();
  const since = isoDate(new Date(todayMs - 60 * DAY));

  const ftp: number | null = profile?.ftp ?? null;
  const lthr: number | null = profile?.lthr ?? null;
  const maxHr: number | null = profile?.max_hr ?? null;
  const lastTest: string | null = profile?.ftp_test_completed_at ?? null;

  const { data: acts } = await supabase
    .from("strava_activities")
    .select("name,start_date,moving_time,average_watts,average_heartrate")
    .eq("user_id", userId)
    .gte("start_date", `${since}T00:00:00Z`)
    .order("start_date", { ascending: false })
    .limit(200);

  const reasons: string[] = [];
  const ftp_age_days = lastTest
    ? Math.round((todayMs - new Date(lastTest).getTime()) / DAY)
    : null;

  // Mejor esfuerzo largo reciente → FTP estimado (95% de un ≥20 min duro)
  let bestWatts = 0;
  let bestHr = 0;
  for (const a of (acts ?? []) as any[]) {
    if ((Number(a.moving_time) || 0) >= 20 * 60) {
      bestWatts = Math.max(bestWatts, Number(a.average_watts) || 0);
      bestHr = Math.max(bestHr, Number(a.average_heartrate) || 0);
    }
  }
  const suggested_ftp = bestWatts > 0 ? Math.round(bestWatts * 0.95) : null;
  const suggested_lthr = bestHr > 0 ? Math.round(bestHr * 0.98) : null;

  if (!ftp || ftp <= 0) reasons.push("No tienes un FTP definido en el perfil.");
  if (!lthr && !maxHr) reasons.push("No tienes umbral de FC (LTHR) ni FC máxima.");
  if (ftp_age_days === null && ftp) reasons.push("No consta ningún test de umbral realizado.");
  if (ftp_age_days !== null && ftp_age_days > 56) reasons.push(`Han pasado ${ftp_age_days} días desde tu último test (recomendado cada 6-8 semanas).`);
  if (ftp && suggested_ftp && suggested_ftp > ftp * 1.04) {
    reasons.push(`Tus salidas recientes sugieren un FTP cercano a ${suggested_ftp} W (actual ${ftp} W): probablemente te has quedado corto.`);
  }
  if (ftp && suggested_ftp && suggested_ftp < ftp * 0.9 && bestWatts > 0) {
    reasons.push(`Tus salidas recientes rinden por debajo de tu FTP registrado (${ftp} W): puede estar sobreestimado.`);
  }
  if (lthr && bestHr > lthr * 1.06) {
    reasons.push(`Has sostenido ${Math.round(bestHr)} ppm de media en salidas largas, por encima de tu LTHR actual (${lthr} ppm).`);
  }

  // Próximo día "razonable": dentro de 3-7 días
  const suggestedDate = isoDate(new Date(todayMs + 4 * DAY));

  const basis: "power" | "hr" = ftp && ftp > 0 ? "power" : "hr";
  const recommendation = reasons.length
    ? "Programa un test de 20 min antes de generar el próximo bloque: llega descansado (2 días suaves previos), realiza el protocolo a la misma hora del día y con el mismo material, y actualiza el resultado en tu perfil para que la IA recalcule tus zonas."
    : "Tus umbrales están actualizados. Repite el test dentro de 6-8 semanas o cuando notes que las series al umbral te resultan demasiado fáciles.";

  return {
    stale: reasons.length > 0,
    ftp_age_days,
    ftp,
    lthr,
    max_hr: maxHr,
    suggested_ftp,
    suggested_lthr,
    reasons,
    recommendation,
    suggested_test_date: reasons.length ? suggestedDate : null,
    suggested_basis: basis,
  };
}
