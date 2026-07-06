import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const STRAVA_TOKEN = "https://www.strava.com/oauth/token";
const STRAVA_API = "https://www.strava.com/api/v3";

async function refreshIfNeeded(supabase: any, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (!profile?.strava_refresh_token || !profile.strava_client_id || !profile.strava_client_secret) {
    throw new Error("Strava no conectado. Configúralo en Perfil.");
  }
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
  if (!res.ok) throw new Error("Error refrescando token Strava");
  const tok = await res.json();
  await supabase.from("profiles").update({
    strava_access_token: tok.access_token,
    strava_refresh_token: tok.refresh_token,
    strava_expires_at: tok.expires_at,
  }).eq("id", userId);
  return tok.access_token;
}

const ExchangeInput = z.object({ code: z.string().min(1) });

export const stravaExchange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ExchangeInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("strava_client_id,strava_client_secret").eq("id", userId).maybeSingle();
    if (!profile?.strava_client_id || !profile?.strava_client_secret) {
      throw new Error("Falta Client ID o Secret de Strava en tu perfil.");
    }
    const res = await fetch(STRAVA_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: profile.strava_client_id,
        client_secret: profile.strava_client_secret,
        code: data.code,
        grant_type: "authorization_code",
      }),
    });
    const tok = await res.json();
    if (!res.ok) throw new Error(tok.message || "Error autorizando Strava");
    await supabase.from("profiles").update({
      strava_access_token: tok.access_token,
      strava_refresh_token: tok.refresh_token,
      strava_expires_at: tok.expires_at,
      strava_athlete_id: tok.athlete?.id ?? null,
    }).eq("id", userId);
    return { ok: true };
  });

export const stravaSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const token = await refreshIfNeeded(supabase, userId);
    const res = await fetch(`${STRAVA_API}/athlete/activities?per_page=20`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Strava API ${res.status}`);
    const acts = await res.json();
    const rows = (acts as any[]).map((a) => ({
      id: a.id,
      user_id: userId,
      name: a.name,
      type: a.sport_type ?? a.type,
      distance: a.distance,
      moving_time: a.moving_time,
      total_elevation_gain: a.total_elevation_gain,
      average_speed: a.average_speed,
      average_heartrate: a.average_heartrate,
      average_watts: a.average_watts,
      suffer_score: a.suffer_score,
      start_date: a.start_date,
      raw: a,
    }));
    if (rows.length) {
      await supabase.from("strava_activities").upsert(rows, { onConflict: "id" });
    }
    return { count: rows.length };
  });

export const stravaDisconnect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await context.supabase.from("profiles").update({
      strava_access_token: null,
      strava_refresh_token: null,
      strava_expires_at: null,
      strava_athlete_id: null,
    }).eq("id", context.userId);
    return { ok: true };
  });

const DetailInput = z.object({ id: z.union([z.string(), z.number()]).transform((v) => String(v)) });

export const stravaActivityDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DetailInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const token = await refreshIfNeeded(supabase, userId);
    const headers = { Authorization: `Bearer ${token}` };
    const streamKeys = "time,latlng,altitude,distance,velocity_smooth,heartrate,cadence,watts,temp,moving,grade_smooth";
    const [actRes, streamsRes] = await Promise.all([
      fetch(`${STRAVA_API}/activities/${data.id}?include_all_efforts=true`, { headers }),
      fetch(`${STRAVA_API}/activities/${data.id}/streams?keys=${streamKeys}&key_by_type=true`, { headers }),
    ]);
    if (!actRes.ok) throw new Error(`Strava API ${actRes.status}`);
    const activity = await actRes.json();
    const streams = streamsRes.ok ? await streamsRes.json() : {};
    return { activity, streams };
  });
