/* Agregado semanal de actividades: km, horas, vatios medios, desnivel y carga (TSS).
   Solo servidor. */

import { isoDate, madridTodayISO, weekStart } from "./training-load.server";

const DAY = 86400000;

export interface WeekStat {
  week_start: string;
  km: number;
  hours: number;
  avg_watts: number | null;
  elevation_m: number;
  tss: number;
  activities: number;
}

export interface WeeklyStats {
  weeks: WeekStat[];
  current: WeekStat | null;
  previous: WeekStat | null;
  avg4: { km: number; hours: number; avg_watts: number | null; elevation_m: number; tss: number } | null;
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

export async function buildWeeklyStats(supabase: any, userId: string, weeks = 12): Promise<WeeklyStats> {
  const today = madridTodayISO();
  const thisWeek = weekStart(today);
  const firstWeek = isoDate(new Date(new Date(`${thisWeek}T12:00:00Z`).getTime() - (weeks - 1) * 7 * DAY));

  const { data } = await supabase
    .from("intervals_activities")
    .select("start_date,distance,moving_time,average_watts,total_elevation_gain,icu_training_load")
    .eq("user_id", userId)
    .gte("start_date", `${firstWeek}T00:00:00Z`)
    .order("start_date", { ascending: true })
    .limit(1000);

  const acc = new Map<string, { km: number; sec: number; wattSec: number; wattTime: number; elev: number; tss: number; n: number }>();
  for (let i = 0; i < weeks; i++) {
    const ws = isoDate(new Date(new Date(`${firstWeek}T12:00:00Z`).getTime() + i * 7 * DAY));
    acc.set(ws, { km: 0, sec: 0, wattSec: 0, wattTime: 0, elev: 0, tss: 0, n: 0 });
  }

  for (const a of (data ?? []) as any[]) {
    const d = String(a.start_date ?? "").slice(0, 10);
    if (!d) continue;
    const ws = weekStart(d);
    const bucket = acc.get(ws);
    if (!bucket) continue;
    const sec = Number(a.moving_time) || 0;
    const watts = Number(a.average_watts) || 0;
    bucket.km += (Number(a.distance) || 0) / 1000;
    bucket.sec += sec;
    bucket.elev += Number(a.total_elevation_gain) || 0;
    bucket.tss += Number(a.icu_training_load) || 0;
    if (watts > 0 && sec > 0) {
      bucket.wattSec += watts * sec;
      bucket.wattTime += sec;
    }
    bucket.n += 1;
  }

  const list: WeekStat[] = [...acc.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week_start, b]) => ({
      week_start,
      km: round1(b.km),
      hours: round1(b.sec / 3600),
      avg_watts: b.wattTime > 0 ? Math.round(b.wattSec / b.wattTime) : null,
      elevation_m: Math.round(b.elev),
      tss: Math.round(b.tss),
      activities: b.n,
    }));

  const current = list[list.length - 1] ?? null;
  const previous = list[list.length - 2] ?? null;
  const prev4 = list.slice(-5, -1);
  const avg4 = prev4.length
    ? (() => {
        const wattVals = prev4.map((w) => w.avg_watts).filter((v): v is number => v != null);
        return {
          km: round1(prev4.reduce((a, w) => a + w.km, 0) / prev4.length),
          hours: round1(prev4.reduce((a, w) => a + w.hours, 0) / prev4.length),
          avg_watts: wattVals.length ? Math.round(wattVals.reduce((a, b) => a + b, 0) / wattVals.length) : null,
          elevation_m: Math.round(prev4.reduce((a, w) => a + w.elevation_m, 0) / prev4.length),
          tss: Math.round(prev4.reduce((a, w) => a + w.tss, 0) / prev4.length),
        };
      })()
    : null;

  return { weeks: list, current, previous, avg4 };
}
