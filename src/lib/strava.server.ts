/** Conexión con Strava: tokens OAuth, refresco y actualización de actividades. Solo servidor. */

const TOKEN_URL = "https://www.strava.com/oauth/token";
const API = "https://www.strava.com/api/v3";

export const STRAVA_DESCRIPTION_LINE = "atleta de https://globero.app/";

type StravaProfile = {
  strava_access_token?: string | null;
  strava_refresh_token?: string | null;
  strava_token_expires_at?: string | null;
};

/** Devuelve un access token válido (refrescándolo si hace falta) o null. */
export async function getStravaAccessToken(supabase: any, userId: string): Promise<string | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("strava_access_token,strava_refresh_token,strava_token_expires_at")
    .eq("id", userId)
    .maybeSingle();
  const p = (profile ?? {}) as StravaProfile;
  if (!p.strava_access_token && !p.strava_refresh_token) return null;

  const expMs = p.strava_token_expires_at ? new Date(p.strava_token_expires_at).getTime() : 0;
  if (p.strava_access_token && expMs - Date.now() > 120_000) return p.strava_access_token;
  if (!p.strava_refresh_token) return p.strava_access_token ?? null;

  const clientId = process.env["STRAVA_CLIENT_ID"];
  const clientSecret = process.env["STRAVA_CLIENT_SECRET"];
  if (!clientId || !clientSecret) return p.strava_access_token ?? null;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: p.strava_refresh_token,
    }),
  });
  if (!res.ok) {
    console.error("[strava] refresh", res.status);
    return null;
  }
  const t = (await res.json()) as { access_token?: string; refresh_token?: string; expires_at?: number };
  if (!t.access_token) return null;
  await supabase
    .from("profiles")
    .update({
      strava_access_token: t.access_token,
      strava_refresh_token: t.refresh_token ?? p.strava_refresh_token,
      strava_token_expires_at: t.expires_at ? new Date(t.expires_at * 1000).toISOString() : null,
    })
    .eq("id", userId);
  return t.access_token;
}

/** Busca el id de Strava de una actividad de Intervals.icu (por strava_id o por hora de inicio). */
async function resolveStravaActivityId(
  supabase: any,
  userId: string,
  intervalsActivityId: string,
  token: string,
): Promise<string | null> {
  const { data: act } = await supabase
    .from("intervals_activities")
    .select("start_date,moving_time,raw")
    .eq("id", String(intervalsActivityId))
    .eq("user_id", userId)
    .maybeSingle();
  const raw = (act?.raw ?? {}) as any;
  const direct = raw.strava_id ?? raw.stravaId ?? raw.external_id;
  if (direct && /^\d+$/.test(String(direct))) return String(direct);
  if (!act?.start_date) return null;

  const startMs = new Date(act.start_date).getTime();
  const after = Math.floor((startMs - 6 * 3600_000) / 1000);
  const before = Math.floor((startMs + 6 * 3600_000) / 1000);
  const res = await fetch(`${API}/athlete/activities?after=${after}&before=${before}&per_page=30`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.error("[strava] list activities", res.status);
    return null;
  }
  const list = (await res.json()) as any[];
  let best: { id: string; diff: number } | null = null;
  for (const a of list ?? []) {
    const diff = Math.abs(new Date(a.start_date).getTime() - startMs);
    if (diff <= 20 * 60_000 && (!best || diff < best.diff)) best = { id: String(a.id), diff };
  }
  return best?.id ?? null;
}

/**
 * Renombra la actividad en Strava con el nombre del entreno y añade la firma de Globero.
 * No lanza errores.
 */
export async function renameStravaActivity(
  supabase: any,
  userId: string,
  intervalsActivityId: string,
  name: string,
): Promise<boolean> {
  try {
    const title = name.trim().slice(0, 100);
    if (!title) return false;
    const token = await getStravaAccessToken(supabase, userId);
    if (!token) return false;
    const stravaId = await resolveStravaActivityId(supabase, userId, intervalsActivityId, token);
    if (!stravaId) return false;
    const res = await fetch(`${API}/activities/${stravaId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: title, description: STRAVA_DESCRIPTION_LINE }),
    });
    if (!res.ok) {
      console.error("[strava] update activity", res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error("[strava] rename", e);
    return false;
  }
}
