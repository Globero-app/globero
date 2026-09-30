import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Sincroniza actividades desde Strava y ciclocomputadores cuando no hay Intervals.icu. */
export const syncActivitiesFromSources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    let count = 0;
    const run = async (fn: () => Promise<number>) => { try { count += await fn(); } catch (e) { console.error("[activities-sync]", e); } };
    const { pullStravaActivities } = await import("./strava.server");
    const { pullDeviceActivities, pullHammerheadActivities } = await import("./devices.server");
    await run(() => pullStravaActivities(supabase, userId));
    await run(() => pullDeviceActivities(supabase, userId));
    await run(() => pullHammerheadActivities(supabase, userId));
    await supabase.from("sync_log").insert({ user_id: userId, kind: "activities", ok: true, items: count });
    return { count };
  });
