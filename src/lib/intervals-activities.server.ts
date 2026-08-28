/** Sincronización de actividades desde Intervals.icu (fuente única de datos). Solo servidor. */

import type { IntervalsCreds } from "./intervals.server";
import { credsFromProfile, intervalsListActivities } from "./intervals.server";

const BASE = "https://intervals.icu/api/v1";

function authHeader(apiKey: string) {
  return `Basic ${Buffer.from(`API_KEY:${apiKey}`).toString("base64")}`;
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function mapActivityRow(a: any, userId: string) {
  const start = a.start_date_local ?? a.start_date ?? null;
  return {
    id: String(a.id),
    user_id: userId,
    name: a.name ?? null,
    type: a.type ?? a.sport ?? null,
    start_date: start ? new Date(start).toISOString() : null,
    moving_time: Number(a.moving_time ?? a.elapsed_time ?? 0) || null,
    distance: Number(a.distance ?? 0) || null,
    total_elevation_gain: Number(a.total_elevation_gain ?? a.icu_elevation_gain ?? 0) || null,
    average_speed: Number(a.average_speed ?? 0) || null,
    average_heartrate: Number(a.average_heartrate ?? a.icu_average_hr ?? 0) || null,
    max_heartrate: Number(a.max_heartrate ?? 0) || null,
    average_watts: Number(a.icu_average_watts ?? a.average_watts ?? 0) || null,
    icu_training_load: Number(a.icu_training_load ?? a.training_load ?? 0) || null,
    icu_intensity: Number(a.icu_intensity ?? 0) || null,
    raw: a,
    synced_at: new Date().toISOString(),
  };
}

/** Descarga y guarda las actividades del atleta. Devuelve cuántas se han guardado. */
export async function syncIntervalsActivities(
  supabase: any,
  userId: string,
  opts: { days?: number; creds?: IntervalsCreds | null } = {},
): Promise<number> {
  let creds = opts.creds ?? null;
  if (!creds) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("intervals_athlete_id,intervals_api_key,intervals_oauth")
      .eq("id", userId)
      .maybeSingle();
    creds = credsFromProfile(profile);
  }
  if (!creds) return 0;

  let days = opts.days ?? 14;
  // Primera sincronización: trae un año completo
  const { count } = await supabase
    .from("intervals_activities")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (!count) days = Math.max(days, 365);

  let acts: any[] = [];
  try {
    acts = await intervalsListActivities(creds, isoDaysAgo(days));
  } catch (e) {
    console.error("[intervals-activities] list", e);
    return 0;
  }
  const rows = acts.filter((a) => a?.id).map((a) => mapActivityRow(a, userId));
  if (!rows.length) return 0;
  const { error } = await supabase.from("intervals_activities").upsert(rows, { onConflict: "id" });
  if (error) {
    console.error("[intervals-activities] upsert", error);
    return 0;
  }
  return rows.length;
}

/** Streams de una actividad (por defecto potencia y tiempo). */
export async function intervalsActivityStreams(
  creds: IntervalsCreds,
  activityId: string,
  types = "watts,time",
): Promise<Record<string, number[]>> {
  const res = await fetch(`${BASE}/activity/${activityId}/streams?types=${types}`, {
    headers: { Authorization: authHeader(creds.apiKey) },
  });
  if (!res.ok) return {};
  const json = await res.json();
  const out: Record<string, any[]> = {};
  const put = (type: string, s: any) => {
    const data = s?.data ?? s;
    if (!Array.isArray(data)) return;
    // Intervals.icu devuelve latlng como data = lat[] y data2 = lng[]
    if (type === "latlng" && Array.isArray(s?.data2)) {
      out[type] = data.map((lat: number, i: number) => [lat, s.data2[i]] as [number, number]);
    } else {
      out[type] = data;
    }
  };
  if (Array.isArray(json)) {
    for (const s of json) if (s?.type) put(String(s.type), s);
  } else if (json && typeof json === "object") {
    for (const [k, v] of Object.entries(json as any)) put(k, v);
  }
  return out as Record<string, number[]>;

}

/** Datos del atleta en Intervals.icu (incluye icu_ftp, icu_resting_hr…). */
export async function intervalsGetAthlete(creds: IntervalsCreds): Promise<any> {
  const path = String(creds.athleteId).startsWith("i") ? creds.athleteId : `i${creds.athleteId}`;
  const res = await fetch(`${BASE}/athlete/${path}`, { headers: { Authorization: authHeader(creds.apiKey) } });
  if (!res.ok) return null;
  return res.json();
}

/** FTP estimado: eFTP de Intervals o 95% del mejor esfuerzo largo. */
export async function estimateFtpFromIntervals(supabase: any, userId: string): Promise<number | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("intervals_athlete_id,intervals_api_key,intervals_oauth")
    .eq("id", userId)
    .maybeSingle();
  const creds = credsFromProfile(profile);
  if (creds) {
    try {
      const athlete = await intervalsGetAthlete(creds);
      const ftp = Number(athlete?.icu_ftp ?? athlete?.ftp ?? 0);
      if (ftp > 0) return Math.round(ftp);
    } catch (e) {
      console.error("[intervals] athlete ftp", e);
    }
  }
  const { data: acts } = await supabase
    .from("intervals_activities")
    .select("average_watts,moving_time,type")
    .eq("user_id", userId)
    .gt("average_watts", 0)
    .limit(500);
  const rides = (acts ?? []).filter(
    (a: any) => (Number(a.moving_time) || 0) >= 1200 && /ride|bike|cycl|virtual/i.test(String(a.type ?? "")),
  );
  if (!rides.length) return null;
  const best = Math.max(...rides.map((a: any) => Number(a.average_watts) || 0));
  return best > 0 ? Math.round(best * 0.95) : null;
}

/** FC máx y LTHR estimados desde el histórico de Intervals.icu. */
export async function estimateHrFromIntervals(
  supabase: any,
  userId: string,
): Promise<{ max_hr: number | null; lthr: number | null }> {
  const { data: acts } = await supabase
    .from("intervals_activities")
    .select("average_heartrate,max_heartrate,moving_time")
    .eq("user_id", userId)
    .limit(1000);
  const rows = (acts ?? []) as any[];
  const maxHr = Math.max(0, ...rows.map((a) => Number(a.max_heartrate) || 0));
  const bestAvg = Math.max(
    0,
    ...rows.filter((a) => (Number(a.moving_time) || 0) >= 1200).map((a) => Number(a.average_heartrate) || 0),
  );
  const max_hr = maxHr > 0 ? Math.round(maxHr) : null;
  const lthr = bestAvg > 0 ? Math.round(bestAvg * 0.98) : max_hr ? Math.round(max_hr * 0.92) : null;
  return { max_hr, lthr };
}

/** Renombra una actividad en Intervals.icu con el nombre del entreno planificado. No lanza errores. */
export async function renameIntervalsActivity(
  supabase: any,
  userId: string,
  activityId: string,
  name: string,
): Promise<void> {
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("intervals_athlete_id,intervals_api_key,intervals_oauth")
      .eq("id", userId)
      .maybeSingle();
    const creds = credsFromProfile(profile);
    if (!creds || !name.trim()) return;
    const res = await fetch(`${BASE}/activity/${activityId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: authHeader(creds.apiKey) },
      body: JSON.stringify({ name: name.trim().slice(0, 120) }),
    });
    if (!res.ok) {
      console.error("[intervals] rename", res.status);
      return;
    }
    await supabase
      .from("intervals_activities")
      .update({ name: name.trim().slice(0, 120) })
      .eq("id", String(activityId))
      .eq("user_id", userId);
  } catch (e) {
    console.error("[intervals] rename error", e);
  }
}
