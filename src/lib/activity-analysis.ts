// Utilidades de análisis de actividad Strava basadas en streams

export type Streams = {
  time?: { data: number[] };
  watts?: { data: number[] };
  heartrate?: { data: number[] };
  cadence?: { data: number[] };
  distance?: { data: number[] };
  altitude?: { data: number[] };
  velocity_smooth?: { data: number[] };
  latlng?: { data: [number, number][] };
  grade_smooth?: { data: number[] };
  moving?: { data: boolean[] };
};

/** Muestrea un array manteniendo N puntos aprox para gráficos */
export function downsample<T>(arr: T[], n = 400): T[] {
  if (arr.length <= n) return arr;
  const step = arr.length / n;
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * step)]);
  return out;
}

/** Curva mean-max: mejor potencia media sostenida para cada duración */
export function meanMaxCurve(watts: number[], durations = DEFAULT_DURATIONS): { seconds: number; watts: number }[] {
  if (!watts?.length) return [];
  // Prefix sum para promedios O(1)
  const prefix = new Array(watts.length + 1).fill(0);
  for (let i = 0; i < watts.length; i++) prefix[i + 1] = prefix[i] + (watts[i] ?? 0);
  return durations
    .filter((d) => d <= watts.length)
    .map((d) => {
      let best = 0;
      for (let i = 0; i + d <= watts.length; i++) {
        const avg = (prefix[i + d] - prefix[i]) / d;
        if (avg > best) best = avg;
      }
      return { seconds: d, watts: Math.round(best) };
    });
}

const DEFAULT_DURATIONS = [
  1, 5, 10, 15, 30, 60, 120, 180, 300, 600, 900, 1200, 1800, 2700, 3600, 5400,
];

/** Zonas de potencia por %FTP (Coggan). */
export function powerZoneDistribution(watts: number[], ftp: number) {
  const zones = [
    { name: "Z1 Rec", max: 0.55, color: "#94a3b8" },
    { name: "Z2 End", max: 0.75, color: "#22c55e" },
    { name: "Z3 Temp", max: 0.9, color: "#facc15" },
    { name: "Z4 Umb", max: 1.05, color: "#fb923c" },
    { name: "Z5 VO2", max: 1.2, color: "#ef4444" },
    { name: "Z6 An", max: 1.5, color: "#a855f7" },
    { name: "Z7 Neu", max: Infinity, color: "#ec4899" },
  ];
  const counts = zones.map(() => 0);
  for (const w of watts) {
    const pct = w / ftp;
    const idx = zones.findIndex((z) => pct <= z.max);
    if (idx >= 0) counts[idx]++;
  }
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  return zones.map((z, i) => ({
    name: z.name,
    color: z.color,
    seconds: counts[i],
    percent: Math.round((counts[i] / total) * 100),
  }));
}

/** Zonas de FC por %FCmax (Karvonen simplificado, 5 zonas). */
export function hrZoneDistribution(hr: number[], hrMax: number) {
  const zones = [
    { name: "Z1", max: 0.6, color: "#94a3b8" },
    { name: "Z2", max: 0.7, color: "#22c55e" },
    { name: "Z3", max: 0.8, color: "#facc15" },
    { name: "Z4", max: 0.9, color: "#fb923c" },
    { name: "Z5", max: Infinity, color: "#ef4444" },
  ];
  const counts = zones.map(() => 0);
  for (const b of hr) {
    const pct = b / hrMax;
    const idx = zones.findIndex((z) => pct <= z.max);
    if (idx >= 0) counts[idx]++;
  }
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  return zones.map((z, i) => ({
    name: z.name,
    color: z.color,
    seconds: counts[i],
    percent: Math.round((counts[i] / total) * 100),
  }));
}

/** Detecta intervalos: bloques con potencia sostenida > threshold % FTP durante ≥ minSec */
export function detectIntervals(
  watts: number[],
  time: number[],
  ftp: number,
  opts: { thresholdPct?: number; minSec?: number; gapSec?: number } = {},
): { start: number; end: number; duration: number; avgWatts: number }[] {
  const th = (opts.thresholdPct ?? 0.88) * ftp;
  const minSec = opts.minSec ?? 30;
  const gapSec = opts.gapSec ?? 10;
  const intervals: { start: number; end: number; duration: number; avgWatts: number }[] = [];
  let i = 0;
  while (i < watts.length) {
    if ((watts[i] ?? 0) >= th) {
      let j = i;
      let gap = 0;
      let sum = 0;
      let count = 0;
      while (j < watts.length && ((watts[j] ?? 0) >= th || gap < gapSec)) {
        if ((watts[j] ?? 0) >= th) {
          gap = 0;
          sum += watts[j];
          count++;
        } else {
          gap++;
        }
        j++;
      }
      const startT = time[i] ?? i;
      const endT = time[Math.min(j - gap, watts.length - 1)] ?? j;
      const dur = endT - startT;
      if (dur >= minSec && count > 0) {
        intervals.push({ start: startT, end: endT, duration: dur, avgWatts: Math.round(sum / count) });
      }
      i = j;
    } else {
      i++;
    }
  }
  return intervals;
}

/** Extrae los tramos "interval" del plan del workout con sus targets. */
export function extractPlannedIntervals(plan: any): { name: string; duration: number; targetLow: number; targetHigh: number }[] {
  const steps: any[] = plan?.steps ?? [];
  return steps
    .filter((s) => s.intensity === "interval" && s.target === "power")
    .map((s) => ({
      name: s.name,
      duration: Number(s.duration_seconds ?? 0),
      targetLow: Number(s.target_low ?? 0),
      targetHigh: Number(s.target_high ?? 0),
    }));
}

/** Cumplimiento del plan: empareja intervalos planificados con detectados por orden. */
export function complianceScore(
  planned: ReturnType<typeof extractPlannedIntervals>,
  detected: ReturnType<typeof detectIntervals>,
): { matched: number; total: number; percent: number; details: any[] } {
  if (planned.length === 0) return { matched: 0, total: 0, percent: 0, details: [] };
  const details: any[] = [];
  let matched = 0;
  const usedIdx = new Set<number>();
  for (const p of planned) {
    // Busca detected libre con mejor solape en duración
    let bestIdx = -1;
    let bestScore = 0;
    detected.forEach((d, idx) => {
      if (usedIdx.has(idx)) return;
      const durScore = 1 - Math.min(1, Math.abs(d.duration - p.duration) / Math.max(p.duration, 1));
      const targetMid = (p.targetLow + p.targetHigh) / 2 || 1;
      const wattScore = 1 - Math.min(1, Math.abs(d.avgWatts - targetMid) / targetMid);
      const s = durScore * 0.5 + wattScore * 0.5;
      if (s > bestScore) { bestScore = s; bestIdx = idx; }
    });
    if (bestIdx >= 0 && bestScore >= 0.55) {
      usedIdx.add(bestIdx);
      matched++;
      const d = detected[bestIdx];
      details.push({
        planned: p, detected: d, ok: true,
        durationPct: Math.round((d.duration / Math.max(p.duration, 1)) * 100),
        wattsPct: Math.round((d.avgWatts / Math.max((p.targetLow + p.targetHigh) / 2, 1)) * 100),
      });
    } else {
      details.push({ planned: p, detected: null, ok: false, durationPct: 0, wattsPct: 0 });
    }
  }
  return { matched, total: planned.length, percent: Math.round((matched / planned.length) * 100), details };
}

/** Normalized Power aproximada */
export function normalizedPower(watts: number[]): number {
  if (!watts?.length) return 0;
  const window = 30;
  const rolled: number[] = [];
  let sum = 0;
  for (let i = 0; i < watts.length; i++) {
    sum += watts[i] ?? 0;
    if (i >= window) sum -= watts[i - window] ?? 0;
    if (i >= window - 1) rolled.push(sum / window);
  }
  const p4 = rolled.reduce((a, b) => a + Math.pow(b, 4), 0) / (rolled.length || 1);
  return Math.round(Math.pow(p4, 0.25));
}

export function formatDuration(sec: number): string {
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return rs ? `${m}m${rs}s` : `${m}min`;
  const h = Math.floor(m / 60);
  return `${h}h${m % 60}m`;
}
