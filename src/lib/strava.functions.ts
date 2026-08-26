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
      await supabase.from("intervals_activities").upsert(rows, { onConflict: "id" });
    }
    // Auto-FTP: si el usuario no tiene FTP definido, calcularlo tras el sync
    try {
      const { data: prof } = await supabase.from("profiles").select("ftp").eq("id", userId).maybeSingle();
      if (!prof?.ftp) {
        const est = await computeFtpFromActivities(supabase, userId);
        if (est) await supabase.from("profiles").update({ ftp: est }).eq("id", userId);
      }
    } catch (e) { console.error("auto-ftp", e); }
    // Auto-FC: estima FC máx y LTHR si faltan
    try {
      const { data: prof } = await supabase.from("profiles").select("max_hr,lthr").eq("id", userId).maybeSingle();
      if (!prof?.max_hr || !prof?.lthr) {
        const { max_hr, lthr } = await computeHrFromActivities(supabase, userId);
        const update: { max_hr?: number; lthr?: number } = {};
        if (!prof?.max_hr && max_hr) update.max_hr = max_hr;
        if (!prof?.lthr && lthr) update.lthr = lthr;
        if (Object.keys(update).length) await supabase.from("profiles").update(update).eq("id", userId);
      }
    } catch (e) { console.error("auto-hr", e); }
    // Picos mean-max de potencia para la curva de Progreso
    try {
      const { syncMissingPowerPeaks } = await import("./power-peaks.server");
      await syncMissingPowerPeaks(supabase, userId, { limit: 15, sinceDays: 90 });
    } catch (e) { console.error("power-peaks-sync", e); }
    // Push del servidor si el usuario lo tiene habilitado
    if (rows.length) {
      try {
        const { data: prof } = await supabase.from("profiles").select("notify_strava_push").eq("id", userId).maybeSingle();
        if ((prof as any)?.notify_strava_push) {
          const { notifyUser } = await import("./web-push.server");
          await notifyUser(userId, {
            title: "✅ Strava sincronizado",
            body: `${rows.length} actividad${rows.length === 1 ? "" : "es"} importada${rows.length === 1 ? "" : "s"}.`,
            tag: `strava-sync-${new Date().toISOString().slice(0, 10)}`,
            url: "/entrenamientos",
          });
        }
      } catch (e) { console.error("push strava sync", e); }
    }
    return { count: rows.length };
  });

async function computeFtpFromActivities(supabase: any, userId: string): Promise<number | null> {
  const { data: acts } = await supabase
    .from("intervals_activities")
    .select("average_watts,moving_time,type")
    .eq("user_id", userId);
  if (!acts?.length) return null;
  // Solo ciclismo con potencia
  const cycling = acts.filter((a: any) =>
    a.average_watts && a.average_watts > 0 &&
    typeof a.type === "string" && /ride|bike|cycl/i.test(a.type),
  );
  if (!cycling.length) return null;
  // Preferimos esfuerzos ≥ 20 min: FTP ≈ 0.95 × mejor potencia media 20'
  const long = cycling.filter((a: any) => (a.moving_time ?? 0) >= 1200);
  if (long.length) {
    const best = Math.max(...long.map((a: any) => a.average_watts));
    return Math.round(best * 0.95);
  }
  // Fallback: promedio de las 5 mejores medias, factor 0.90
  const top = cycling.map((a: any) => a.average_watts).sort((a: number, b: number) => b - a).slice(0, 5);
  const avg = top.reduce((s: number, v: number) => s + v, 0) / top.length;
  return Math.round(avg * 0.9);
}

export const stravaEstimateFtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const ftp = await computeFtpFromActivities(supabase, userId);
    if (!ftp) throw new Error("No hay actividades con potencia suficientes para estimar FTP. Sincroniza Strava.");
    await supabase.from("profiles").update({ ftp }).eq("id", userId);
    return { ftp };
  });

async function computeHrFromActivities(
  supabase: any,
  userId: string,
): Promise<{ max_hr: number | null; lthr: number | null }> {
  const { data: acts } = await supabase
    .from("intervals_activities")
    .select("average_heartrate,moving_time,type,raw")
    .eq("user_id", userId);
  if (!acts?.length) return { max_hr: null, lthr: null };
  const rides = acts.filter(
    (a: any) => typeof a.type === "string" && /ride|bike|cycl/i.test(a.type),
  );
  const pool = rides.length ? rides : acts;

  // FC máx: mayor max_heartrate registrado en las actividades
  const maxima = pool
    .map((a: any) => Number(a.raw?.max_heartrate ?? 0))
    .filter((v: number) => v > 100 && v < 230);
  const max_hr = maxima.length ? Math.round(Math.max(...maxima)) : null;

  // LTHR: mejor FC media en esfuerzos ≥ 20 min × 0,95 (Friel)
  const long = pool.filter(
    (a: any) => (a.moving_time ?? 0) >= 1200 && a.average_heartrate > 0,
  );
  let lthr: number | null = null;
  if (long.length) {
    const best = Math.max(...long.map((a: any) => Number(a.average_heartrate)));
    lthr = Math.round(best * 0.95);
  } else if (max_hr) {
    lthr = Math.round(max_hr * 0.92);
  }
  if (lthr && max_hr && lthr > max_hr) lthr = Math.round(max_hr * 0.92);
  return { max_hr, lthr };
}

export const stravaEstimateHr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { max_hr, lthr } = await computeHrFromActivities(supabase, userId);
    if (!max_hr && !lthr) {
      throw new Error(
        "No hay actividades con frecuencia cardíaca suficientes. Sincroniza Strava con un pulsómetro.",
      );
    }
    const update: { max_hr?: number; lthr?: number } = {};
    if (max_hr) update.max_hr = max_hr;
    if (lthr) update.lthr = lthr;
    await supabase.from("profiles").update(update).eq("id", userId);
    return { max_hr, lthr };
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

/**
 * Importa una actividad de Strava como test FTP: busca el mejor esfuerzo de 20 min
 * de potencia media y calcula FTP = 95%. Actualiza el perfil y marca el test como realizado.
 */
const FtpImportInput = z.object({
  activity_id: z.union([z.string(), z.number()]).transform((v) => String(v)),
});

export const stravaImportFtpTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => FtpImportInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const token = await refreshIfNeeded(supabase, userId);
    const headers = { Authorization: `Bearer ${token}` };
    const [actRes, streamsRes] = await Promise.all([
      fetch(`${STRAVA_API}/activities/${data.activity_id}`, { headers }),
      fetch(`${STRAVA_API}/activities/${data.activity_id}/streams?keys=time,watts,heartrate&key_by_type=true`, { headers }),
    ]);
    if (!actRes.ok) throw new Error(`Strava API ${actRes.status}`);
    const activity = await actRes.json();
    const streams = streamsRes.ok ? await streamsRes.json() : {};
    const watts: number[] | undefined = streams?.watts?.data;
    const time: number[] | undefined = streams?.time?.data;

    // Estrategia 1: mejor ventana rodante de 20 min sobre el stream de watts
    let best20 = 0;
    let usedMethod: "stream_20min" | "activity_20min_avg" | "activity_avg_x0.95" = "activity_avg_x0.95";

    if (watts && watts.length && time && time.length === watts.length) {
      // Sumatorio prefijado para media rápida por tiempo (asumimos ~1s por muestra)
      const targetWindow = 20 * 60;
      let start = 0;
      let sum = 0;
      for (let end = 0; end < watts.length; end++) {
        sum += watts[end] || 0;
        while (time[end] - time[start] >= targetWindow) {
          const dur = time[end] - time[start];
          if (dur > 0) {
            const avg = sum / (end - start + 1);
            if (avg > best20) best20 = avg;
          }
          sum -= watts[start] || 0;
          start++;
        }
      }
      if (best20 > 0) usedMethod = "stream_20min";
    }

    // Estrategia 2 (fallback): si la actividad dura ≥ 20 min y tiene average_watts
    if (!best20 && activity.moving_time >= 20 * 60 && activity.average_watts > 0) {
      best20 = activity.average_watts;
      usedMethod = "activity_20min_avg";
    }

    // Estrategia 3 (último recurso): media de la actividad
    if (!best20 && activity.average_watts > 0) {
      best20 = activity.average_watts;
      usedMethod = "activity_avg_x0.95";
    }

    if (!best20) {
      throw new Error("La actividad no tiene datos de potencia. Sube un test con potenciómetro o introduce el FTP manualmente.");
    }

    const ftp = Math.round(best20 * 0.95);

    await supabase.from("profiles").update({
      ftp,
      ftp_test_completed_at: new Date().toISOString(),
    }).eq("id", userId);

    return {
      ftp,
      avg_watts_20min: Math.round(best20),
      method: usedMethod,
      activity_name: activity.name,
      activity_date: activity.start_date,
    };
  });

/**
 * Marca el test FTP como realizado sin importar de Strava (útil cuando el usuario
 * introduce la potencia media manualmente en la app).
 */
export const markFtpTestCompleted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await supabase.from("profiles").update({
      ftp_test_completed_at: new Date().toISOString(),
    }).eq("id", userId);
    return { ok: true };
  });

