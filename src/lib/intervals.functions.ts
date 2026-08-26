import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const connectIntervals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ athlete_id: z.string().trim().min(1).max(40), api_key: z.string().trim().min(8).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { intervalsTestConnection } = await import("./intervals.server");
    const creds = { athleteId: data.athlete_id, apiKey: data.api_key };
    const test = await intervalsTestConnection(creds);
    const { error } = await supabase
      .from("profiles")
      .update({ intervals_athlete_id: data.athlete_id, intervals_api_key: data.api_key })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true, name: test.name };
  });

export const disconnectIntervals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("profiles")
      .update({ intervals_athlete_id: null, intervals_api_key: null })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Sube (o actualiza) los entrenamientos indicados al calendario de Intervals.icu */
export const uploadWorkoutsToIntervals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ workout_ids: z.array(z.string().uuid()).min(1).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { syncWorkoutEvent } = await import("./intervals.server");
    const { data: workouts } = await supabase
      .from("workouts")
      .select("*")
      .eq("user_id", userId)
      .in("id", data.workout_ids);
    let uploaded = 0;
    for (const w of workouts ?? []) {
      const id = await syncWorkoutEvent(supabase, userId, w);
      if (id) uploaded++;
    }
    return { ok: true, uploaded, total: (workouts ?? []).length };
  });

/** Envía FTP, LTHR, FC máx y zonas al perfil de Intervals.icu */
export const syncIntervalsZones = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { intervalsPushZones } = await import("./intervals.server");
    const ok = await intervalsPushZones(supabase, userId);
    return { ok };
  });

/** Sincroniza las actividades desde Intervals.icu (fuente única de datos). */
export const intervalsSyncActivities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { syncIntervalsActivities } = await import("./intervals-activities.server");
    const count = await syncIntervalsActivities(supabase, userId, { days: 30 });
    try {
      const { data: prof } = await supabase.from("profiles").select("ftp,max_hr,lthr").eq("id", userId).maybeSingle();
      const { estimateFtpFromIntervals, estimateHrFromIntervals } = await import("./intervals-activities.server");
      const update: Record<string, number> = {};
      if (!prof?.ftp) {
        const ftp = await estimateFtpFromIntervals(supabase, userId);
        if (ftp) update.ftp = ftp;
      }
      if (!prof?.max_hr || !prof?.lthr) {
        const { max_hr, lthr } = await estimateHrFromIntervals(supabase, userId);
        if (!prof?.max_hr && max_hr) update.max_hr = max_hr;
        if (!prof?.lthr && lthr) update.lthr = lthr;
      }
      if (Object.keys(update).length) await supabase.from("profiles").update(update as any).eq("id", userId);
    } catch (e) {
      console.error("auto metrics", e);
    }
    try {
      const { syncMissingPowerPeaks } = await import("./power-peaks.server");
      await syncMissingPowerPeaks(supabase, userId, { limit: 15, sinceDays: 90 });
    } catch (e) {
      console.error("power-peaks-sync", e);
    }
    return { count };
  });

/** Estima el FTP con los datos de Intervals.icu y lo guarda en el perfil. */
export const intervalsEstimateFtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { estimateFtpFromIntervals } = await import("./intervals-activities.server");
    const ftp = await estimateFtpFromIntervals(supabase, userId);
    if (!ftp) throw new Error("No hay datos de potencia suficientes en Intervals.icu para estimar el FTP.");
    await supabase.from("profiles").update({ ftp }).eq("id", userId);
    return { ftp };
  });

/** Estima FC máx y LTHR con los datos de Intervals.icu. */
export const intervalsEstimateHr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { estimateHrFromIntervals } = await import("./intervals-activities.server");
    const { max_hr, lthr } = await estimateHrFromIntervals(supabase, userId);
    if (!max_hr && !lthr) throw new Error("No hay actividades con frecuencia cardíaca en Intervals.icu.");
    const update: { max_hr?: number; lthr?: number } = {};
    if (max_hr) update.max_hr = max_hr;
    if (lthr) update.lthr = lthr;
    await supabase.from("profiles").update(update).eq("id", userId);
    return { max_hr, lthr };
  });

/** Detalle + streams de una actividad de Intervals.icu. */
export const intervalsActivityDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.union([z.string(), z.number()]).transform((v) => String(v)) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("intervals_athlete_id,intervals_api_key")
      .eq("id", userId)
      .maybeSingle();
    const { credsFromProfile } = await import("./intervals.server");
    const creds = credsFromProfile(profile);
    if (!creds) throw new Error("Intervals.icu no está conectado.");
    const { intervalsActivityStreams } = await import("./intervals-activities.server");
    const raw = await intervalsActivityStreams(
      creds,
      data.id,
      "time,latlng,altitude,distance,velocity_smooth,heartrate,cadence,watts,temp,moving",
    );
    const streams: Record<string, { data: number[] }> = {};
    for (const [k, v] of Object.entries(raw)) streams[k] = { data: v };
    const { data: row } = await supabase
      .from("intervals_activities")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    return { activity: (row?.raw as any) ?? row ?? {}, streams };
  });

/** Importa una actividad de Intervals.icu como test FTP (mejor 20 min × 0,95). */
export const intervalsImportFtpTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ activity_id: z.union([z.string(), z.number()]).transform((v) => String(v)) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("intervals_athlete_id,intervals_api_key")
      .eq("id", userId)
      .maybeSingle();
    const { credsFromProfile } = await import("./intervals.server");
    const creds = credsFromProfile(profile);
    if (!creds) throw new Error("Intervals.icu no está conectado.");

    const { intervalsActivityStreams } = await import("./intervals-activities.server");
    const streams = await intervalsActivityStreams(creds, data.activity_id, "watts,time");
    const watts = streams["watts"] ?? [];
    const time = streams["time"] ?? watts.map((_, i) => i);

    let best20 = 0;
    let usedMethod: "stream_20min" | "activity_avg" = "activity_avg";
    if (watts.length && time.length === watts.length) {
      const target = 20 * 60;
      let start = 0;
      let sum = 0;
      for (let end = 0; end < watts.length; end++) {
        sum += watts[end] || 0;
        while (time[end] - time[start] >= target) {
          const avg = sum / (end - start + 1);
          if (avg > best20) best20 = avg;
          sum -= watts[start] || 0;
          start++;
        }
      }
      if (best20 > 0) usedMethod = "stream_20min";
    }

    const { data: row } = await supabase
      .from("intervals_activities")
      .select("name,start_date,average_watts,moving_time")
      .eq("id", data.activity_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!best20 && Number(row?.average_watts) > 0) best20 = Number(row?.average_watts);
    if (!best20) {
      throw new Error("La actividad no tiene datos de potencia. Introduce el FTP manualmente.");
    }

    const ftp = Math.round(best20 * 0.95);
    await supabase
      .from("profiles")
      .update({ ftp, ftp_test_completed_at: new Date().toISOString() })
      .eq("id", userId);

    return {
      ftp,
      avg_watts_20min: Math.round(best20),
      method: usedMethod,
      activity_name: row?.name ?? "Actividad",
      activity_date: row?.start_date ?? null,
    };
  });

/** Marca el test FTP como realizado sin importar la actividad. */
export const markFtpTestCompleted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await supabase.from("profiles").update({ ftp_test_completed_at: new Date().toISOString() }).eq("id", userId);
    return { ok: true };
  });

