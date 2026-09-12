import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { planHydration, describeWeather, type WeatherDay } from "./weather";

interface OMDaily {
  time: string[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  apparent_temperature_max: number[];
  relative_humidity_2m_mean?: number[];
  precipitation_sum: number[];
  wind_speed_10m_max: number[];
  weather_code: number[];
}

export const fetchRaceWeather = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { competitionId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: comp, error } = await supabase
      .from("competitions")
      .select("id,user_id,date,track_points,distance_km,elevation_m,intensity,duration_hours")
      .eq("id", data.competitionId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!comp || comp.user_id !== userId) throw new Error("Competición no encontrada");

    const pts = (comp.track_points as any[] | null) ?? [];
    if (!pts.length) throw new Error("Sube primero el archivo GPX de la competición");
    const mid = pts[Math.floor(pts.length / 2)];
    const lat: number = mid.lat;
    const lon: number = mid.lon;

    // Open-Meteo — hasta 16 días de forecast, no requiere API key
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const race = new Date(comp.date);
    race.setHours(0, 0, 0, 0);
    const diffDays = Math.round((race.getTime() - today.getTime()) / 86400000);
    if (diffDays < 0) throw new Error("La ruta ya ha pasado");
    if (diffDays > 3) throw new Error("La previsión solo está disponible desde 3 días antes de la ruta");

    const params = new URLSearchParams({
      latitude: lat.toFixed(4),
      longitude: lon.toFixed(4),
      daily: "weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,relative_humidity_2m_mean,precipitation_sum,wind_speed_10m_max",
      timezone: "auto",
      start_date: comp.date,
      end_date: comp.date,
    });
    const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
    let res = await fetch(url);
    for (let i = 0; i < 3 && res.status === 429; i++) {
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
      res = await fetch(url);
    }
    if (res.status === 429) throw new Error("El servicio meteorológico está saturado. Inténtalo de nuevo en un minuto.");
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    const json = (await res.json()) as { daily: OMDaily };
    const d = json.daily;
    if (!d?.time?.length) throw new Error("Sin datos meteorológicos");

    const weather: WeatherDay = {
      date: d.time[0],
      temp_max_c: d.temperature_2m_max[0],
      temp_min_c: d.temperature_2m_min[0],
      apparent_max_c: d.apparent_temperature_max[0],
      humidity_pct: d.relative_humidity_2m_mean?.[0] ?? 60,
      wind_kmh: d.wind_speed_10m_max[0],
      precip_mm: d.precipitation_sum[0],
      weather_code: d.weather_code[0],
      summary: "",
    };
    weather.summary = describeWeather(weather);

    // Duración estimada (misma lógica que carbs.ts, simple)
    const durationH =
      comp.duration_hours && comp.duration_hours > 0
        ? comp.duration_hours
        : comp.distance_km /
            ((comp.intensity === "alta" || comp.intensity === "competicion") ? 28 : 24) +
          (comp.elevation_m / 1000) * 0.6;

    const { data: profile } = await supabase
      .from("profiles")
      .select("weight_kg")
      .eq("id", userId)
      .maybeSingle();
    const weight = profile?.weight_kg ?? 70;

    const hydration = planHydration(weight, durationH, weather);

    const { error: uErr } = await supabase
      .from("competitions")
      .update({
        weather_forecast: { ...weather, lat, lon, fetched_at: new Date().toISOString() } as any,
        hydration_plan: hydration as any,
      })
      .eq("id", comp.id);
    if (uErr) throw new Error(uErr.message);

    return { weather, hydration };
  });
