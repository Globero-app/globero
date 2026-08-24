import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ConnectInput = z.object({
  athlete_id: z.string().trim().min(1).max(40),
  api_key: z.string().trim().min(8).max(200),
});

export const connectIntervals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ConnectInput.parse(d))
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
