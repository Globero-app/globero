/* Cálculo y almacenamiento de picos mean-max de potencia desde streams de Intervals.icu.
   Solo servidor. */

import { credsFromProfile } from "./intervals.server";
import { intervalsActivityStreams } from "./intervals-activities.server";

const DURATIONS = [
  1, 5, 10, 30,
  60, 120, 300, 600,
  1200, 1800, 3600,
];

async function credsFor(supabase: any, userId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("intervals_athlete_id,intervals_api_key")
    .eq("id", userId)
    .maybeSingle();
  return credsFromProfile(profile);
}

/** Calcula los mejores promedios de potencia para ventanas de tiempo fijas. */
function computeMeanMax(watts: number[], time: number[]): Record<number, number> {
  const peaks: Record<number, number> = {};
  if (!watts.length || time.length !== watts.length) return peaks;

  for (const windowSec of DURATIONS) {
    let best = 0;
    let sum = 0;
    let start = 0;
    for (let end = 0; end < watts.length; end++) {
      sum += watts[end] || 0;
      while (time[end] - time[start] >= windowSec) {
        const dur = time[end] - time[start];
        if (dur > 0) {
          const avg = sum / (end - start + 1);
          if (avg > best) best = avg;
        }
        sum -= watts[start] || 0;
        start++;
      }
    }
    if (best === 0 && watts.length > 0) {
      best = sum / Math.max(1, watts.length - start);
    }
    if (best > 0) peaks[windowSec] = Math.round(best);
  }
  return peaks;
}

/** Obtiene streams de potencia de una actividad y guarda sus picos. */
export async function fetchAndStorePowerPeaks(
  supabase: any,
  userId: string,
  activityId: string,
  activityDate: string,
  weightKg: number | null,
) {
  const creds = await credsFor(supabase, userId);
  if (!creds) return;

  let streams: Record<string, number[]> = {};
  try {
    streams = await intervalsActivityStreams(creds, String(activityId), "watts,time");
  } catch (e) {
    console.error("[power-peaks] streams", e);
    return;
  }
  const watts = streams["watts"] ?? [];
  const time = streams["time"] ?? watts.map((_, i) => i);
  if (!watts.length || time.length !== watts.length) return;

  const peaks = computeMeanMax(watts, time);
  const rows = Object.entries(peaks).map(([durationSeconds, wattsValue]) => ({
    user_id: userId,
    activity_id: String(activityId),
    duration_seconds: Number(durationSeconds),
    watts: wattsValue,
    wkg: weightKg && weightKg > 0 ? Math.round((wattsValue / weightKg) * 100) / 100 : null,
    activity_date: activityDate,
  }));

  if (!rows.length) return;

  await supabase.from("power_peaks").upsert(rows, { onConflict: "user_id, activity_id, duration_seconds" });
}

/** Recalcula picos para las actividades recientes que aún no los tienen. */
export async function syncMissingPowerPeaks(supabase: any, userId: string, opts: { limit?: number; sinceDays?: number } = {}) {
  const { data: profile } = await supabase.from("profiles").select("weight_kg").eq("id", userId).maybeSingle();
  const weight = profile?.weight_kg ? Number(profile.weight_kg) : null;

  const { data: existing } = await supabase
    .from("power_peaks")
    .select("activity_id")
    .eq("user_id", userId)
    .limit(1000);
  const existingIds = new Set((existing ?? []).map((r: any) => String(r.activity_id)));

  const since = new Date();
  since.setDate(since.getDate() - (opts.sinceDays ?? 90));

  const { data: acts } = await supabase
    .from("intervals_activities")
    .select("id,start_date,average_watts,type")
    .eq("user_id", userId)
    .gte("start_date", `${since.toISOString().slice(0, 10)}T00:00:00Z`)
    .gt("average_watts", 0)
    .order("start_date", { ascending: false })
    .limit(opts.limit ?? 20);

  const todo = (acts ?? []).filter((a: any) => !existingIds.has(String(a.id)));
  for (const a of todo) {
    const date = String(a.start_date ?? "").slice(0, 10);
    if (!date) continue;
    await fetchAndStorePowerPeaks(supabase, userId, String(a.id), date, weight);
  }
  return { processed: todo.length };
}

/** Devuelve la curva mean-max agregada (mejor valor por duración). */
export async function getPowerCurve(supabase: any, userId: string, opts: { sinceDays?: number } = {}) {
  const since = new Date();
  since.setDate(since.getDate() - (opts.sinceDays ?? 365));

  const { data: rows } = await supabase
    .from("power_peaks")
    .select("duration_seconds,watts,wkg,activity_date,activity_id")
    .eq("user_id", userId)
    .gte("activity_date", since.toISOString().slice(0, 10))
    .order("duration_seconds", { ascending: true });

  const ids = [...new Set(((rows ?? []) as any[]).map((r) => String(r.activity_id)))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: acts } = await supabase
      .from("intervals_activities")
      .select("id,name")
      .eq("user_id", userId)
      .in("id", ids);
    for (const a of (acts ?? []) as any[]) names.set(String(a.id), a.name ?? "Actividad");
  }

  const best = new Map<number, { watts: number; wkg: number | null; date: string; activity_id: string; name: string }>();
  for (const r of (rows ?? []) as any[]) {
    const ds = Number(r.duration_seconds);
    const watts = Number(r.watts);
    if (!best.has(ds) || watts > best.get(ds)!.watts) {
      best.set(ds, {
        watts,
        wkg: r.wkg ? Number(r.wkg) : null,
        date: String(r.activity_date),
        activity_id: String(r.activity_id),
        name: names.get(String(r.activity_id)) ?? "Actividad",
      });
    }
  }

  return [...best.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([seconds, v]) => ({
      seconds,
      label: formatDuration(seconds),
      watts: v.watts,
      wkg: v.wkg,
      date: v.date,
      activity: v.name,
    }));
}

function formatDuration(seconds: number): string {
  if (seconds >= 3600) return `${Math.round(seconds / 3600)}h`;
  if (seconds >= 60) return `${Math.round(seconds / 60)}min`;
  return `${seconds}s`;
}
