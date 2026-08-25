/* Cálculo y almacenamiento de picos mean-max de potencia desde streams de Strava.
   Solo servidor. */

const STRAVA_API = "https://www.strava.com/api/v3";

const DURATIONS = [
  1, 5, 10, 30,
  60, 120, 300, 600,
  1200, 1800, 3600,
];

async function refreshIfNeeded(supabase: any, userId: string): Promise<string | null> {
  const { data: profile } = await supabase.from("profiles").select("strava_access_token,strava_refresh_token,strava_expires_at,strava_client_id,strava_client_secret").eq("id", userId).maybeSingle();
  if (!profile?.strava_refresh_token) return null;
  const now = Math.floor(Date.now() / 1000);
  if (profile.strava_access_token && profile.strava_expires_at && profile.strava_expires_at - 60 > now) {
    return profile.strava_access_token;
  }
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: profile.strava_client_id,
      client_secret: profile.strava_client_secret,
      grant_type: "refresh_token",
      refresh_token: profile.strava_refresh_token,
    }),
  });
  if (!res.ok) return null;
  const tok = await res.json();
  await supabase.from("profiles").update({
    strava_access_token: tok.access_token,
    strava_refresh_token: tok.refresh_token,
    strava_expires_at: tok.expires_at,
  }).eq("id", userId);
  return tok.access_token;
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
    // Última ventana si no se cerró exactamente
    if (best === 0 && watts.length > 0) {
      best = sum / (watts.length - start);
    }
    if (best > 0) peaks[windowSec] = Math.round(best);
  }
  return peaks;
}

/** Obtiene streams de potencia de una actividad y guarda sus picos. */
export async function fetchAndStorePowerPeaks(supabase: any, userId: string, activityId: number | string, activityDate: string, weightKg: number | null) {
  const token = await refreshIfNeeded(supabase, userId);
  if (!token) return;

  const res = await fetch(`${STRAVA_API}/activities/${activityId}/streams?keys=watts,time&key_by_type=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return;
  const streams = await res.json();
  const watts: number[] | undefined = streams?.watts?.data;
  const time: number[] | undefined = streams?.time?.data;
  if (!watts?.length || !time?.length || watts.length !== time.length) return;

  const peaks = computeMeanMax(watts, time);
  const rows = Object.entries(peaks).map(([durationSeconds, wattsValue]) => ({
    user_id: userId,
    activity_id: Number(activityId),
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
  const existingIds = new Set((existing ?? []).map((r: any) => Number(r.activity_id)));

  const since = new Date();
  since.setDate(since.getDate() - (opts.sinceDays ?? 90));

  const { data: acts } = await supabase
    .from("strava_activities")
    .select("id,start_date,average_watts,type")
    .eq("user_id", userId)
    .gte("start_date", `${since.toISOString().slice(0, 10)}T00:00:00Z`)
    .gt("average_watts", 0)
    .order("start_date", { ascending: false })
    .limit(opts.limit ?? 20);

  const todo = (acts ?? []).filter((a: any) => !existingIds.has(Number(a.id)));
  for (const a of todo) {
    const date = String(a.start_date ?? "").slice(0, 10);
    if (!date) continue;
    await fetchAndStorePowerPeaks(supabase, userId, a.id, date, weight);
  }
  return { processed: todo.length };
}

/** Devuelve la curva mean-max agregada (mejor valor por duración). */
export async function getPowerCurve(supabase: any, userId: string, opts: { sinceDays?: number } = {}) {
  const since = new Date();
  since.setDate(since.getDate() - (opts.sinceDays ?? 365));

  const { data: rows } = await supabase
    .from("power_peaks")
    .select("duration_seconds,watts,wkg,activity_date,activity_id,strava_activities!inner(name)")
    .eq("user_id", userId)
    .gte("activity_date", since.toISOString().slice(0, 10))
    .order("duration_seconds", { ascending: true });

  const best = new Map<number, { watts: number; wkg: number | null; date: string; activity_id: number; name: string }>();
  for (const r of (rows ?? []) as any[]) {
    const ds = Number(r.duration_seconds);
    const watts = Number(r.watts);
    if (!best.has(ds) || watts > best.get(ds)!.watts) {
      best.set(ds, {
        watts,
        wkg: r.wkg ? Number(r.wkg) : null,
        date: String(r.activity_date),
        activity_id: Number(r.activity_id),
        name: r.strava_activities?.name ?? "Actividad",
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
