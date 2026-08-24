/** Helpers de servidor para la API de Strava */

const STRAVA_TOKEN = "https://www.strava.com/oauth/token";
const STRAVA_API = "https://www.strava.com/api/v3";

/** Devuelve un access token válido (refresca si hace falta) o null si no está conectado */
export async function getStravaToken(supabase: any, userId: string): Promise<string | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("strava_client_id,strava_client_secret,strava_access_token,strava_refresh_token,strava_expires_at")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.strava_refresh_token || !profile.strava_client_id || !profile.strava_client_secret) return null;
  const now = Math.floor(Date.now() / 1000);
  if (profile.strava_access_token && profile.strava_expires_at && profile.strava_expires_at - 60 > now) {
    return profile.strava_access_token;
  }
  const res = await fetch(STRAVA_TOKEN, {
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
  await supabase
    .from("profiles")
    .update({
      strava_access_token: tok.access_token,
      strava_refresh_token: tok.refresh_token,
      strava_expires_at: tok.expires_at,
    })
    .eq("id", userId);
  return tok.access_token as string;
}

/** Renombra una actividad en Strava (requiere scope activity:write). No lanza errores. */
export async function renameStravaActivity(
  supabase: any,
  userId: string,
  activityId: string,
  name: string,
  opts?: { indoor?: boolean },
): Promise<boolean> {
  try {
    if (!name?.trim()) return false;
    const token = await getStravaToken(supabase, userId);
    if (!token) return false;
    const res = await fetch(`${STRAVA_API}/activities/${activityId}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim().slice(0, 120),
        ...(opts?.indoor === undefined
          ? {}
          : { trainer: opts.indoor, sport_type: opts.indoor ? "VirtualRide" : "Ride" }),
      }),
    });
    if (!res.ok) {
      console.error("strava rename", res.status, (await res.text()).slice(0, 200));
      return false;
    }
    await supabase.from("strava_activities").update({ name: name.trim().slice(0, 120) }).eq("id", activityId).eq("user_id", userId);
    return true;
  } catch (e) {
    console.error("strava rename error", e);
    return false;
  }
}
