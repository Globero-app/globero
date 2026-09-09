import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Estado meteorológico actual del usuario: localidad detectada y avisos vigentes. */
export const getWeatherStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select(
        "id, country, location_city, location_lat, location_lon, location_resolved, weather_auto_indoor, weather_wind_threshold_kmh, notify_weather_alerts",
      )
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.location_city) {
      return { located: null as string | null, alert: null as any, weather: null as any };
    }
    const { resolveUserLocation, buildDailyWeatherAlert } = await import("./weather-alerts.server");
    const loc = await resolveUserLocation(supabase, profile);
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Madrid",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const alert = loc ? await buildDailyWeatherAlert(supabase, profile, today) : null;
    return {
      located: loc?.label ?? null,
      weather: alert?.weather ?? null,
      alert: alert ? { title: alert.title, body: alert.body, indoor: alert.indoor } : null,
    };
  });
