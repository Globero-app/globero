import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { planHydration, describeWeather, type WeatherDay } from "./weather";
import { z } from "zod";
import { estimatedRouteHours, forecastAvailability, mapRouteHours, routeDeparture, routeSchedule, routeWeatherSignature, type HourlyForecast } from "./route-weather";
import type { TrackPoint } from "./gpx";

function openMeteoUrl(path: string, params: URLSearchParams) {
  const key = process.env.OPEN_METEO_API_KEY;
  if (key) params.set("apikey", key);
  return `https://${key ? "customer-api" : "api"}.open-meteo.com${path}?${params.toString()}`;
}

async function fetchOpenMeteo(path: string, params: URLSearchParams) {
  const url = openMeteoUrl(path, params);
  let res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  for (let i = 0; i < 3 && res.status === 429; i++) {
    const retryAfter = Number(res.headers.get("Retry-After"));
    const wait = (Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) : [4, 10, 25][i]) * 1000 + Math.random() * 1000;
    await new Promise((r) => setTimeout(r, wait));
    res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  }
  return res;
}

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
  .inputValidator((d: { competitionId: string; departureTime?: string; durationHours?: number }) => z.object({
    competitionId: z.string().uuid(),
    departureTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    durationHours: z.number().min(0.1).max(24).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: comp, error } = await supabase
      .from("competitions")
      .select("id,user_id,date,track_points,distance_km,elevation_m,intensity,duration_hours,weather_forecast,hydration_plan")
      .eq("id", data.competitionId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!comp || comp.user_id !== userId) throw new Error("Competición no encontrada");

    const pts = ((comp.track_points as unknown as TrackPoint[] | null) ?? []).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180);
    if (pts.length < 2) throw new Error("Sube primero el archivo GPX de la competición");
    const mid = pts[Math.floor(pts.length / 2)];
    const lat: number = mid.lat;
    const lon: number = mid.lon;

    const availability = forecastAvailability(comp.date);
    if (availability === "past") throw new Error("La ruta ya ha pasado");
    if (availability !== "available") throw new Error("La previsión solo está disponible desde 3 días antes de la ruta");

    // Caché de 30 min: si ya hay previsión con los mismos parámetros, se reutiliza sin llamar a Open-Meteo.
    const requestedDuration = data.durationHours ?? estimatedRouteHours(comp);
    const requestedDeparture = data.departureTime ?? "08:00";
    const requestedSignature = routeWeatherSignature(pts, comp.date, requestedDuration);
    const cached = comp.weather_forecast as any;
    const cachedHourly = cached?.route_hourly as any;
    const cachedAge = cached?.fetched_at ? Date.now() - Date.parse(cached.fetched_at) : Infinity;
    if (
      cached?.date === comp.date && cachedAge < 30 * 60 * 1000 &&
      cachedHourly?.signature === requestedSignature &&
      cachedHourly?.departureTime === requestedDeparture &&
      cachedHourly?.durationHours === requestedDuration
    ) {
      return { weather: { ...cached, route_hourly: undefined }, hydration: comp.hydration_plan, routeHourly: cachedHourly, cached: true };
    }

    const params = new URLSearchParams({
      latitude: lat.toFixed(4),
      longitude: lon.toFixed(4),
      daily: "weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,relative_humidity_2m_mean,precipitation_sum,wind_speed_10m_max",
      timezone: "auto",
      start_date: comp.date,
      end_date: comp.date,
    });
    const res = await fetchOpenMeteo("/v1/forecast", params);
    if (res.status === 429) throw new Error("El servicio meteorológico está saturado. Inténtalo de nuevo en un minuto.");
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    const json = (await res.json()) as { daily: OMDaily; timezone: string };
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
    const durationH = data.durationHours ?? estimatedRouteHours(comp);
    const departureTime = data.departureTime ?? "08:00";
    const timeZone = json.timezone || "Europe/Madrid";
    const schedule = routeSchedule(pts, durationH, routeDeparture(comp.date, departureTime, timeZone));
    const endDate = new Date(Date.parse(`${comp.date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    const hourlyParams = new URLSearchParams({
      latitude: schedule.map(p => p.lat.toFixed(4)).join(","),
      longitude: schedule.map(p => p.lon.toFixed(4)).join(","),
      hourly: "temperature_2m,apparent_temperature,wind_speed_10m,precipitation,precipitation_probability",
      timezone: timeZone,
      timeformat: "unixtime",
      start_date: comp.date,
      end_date: endDate,
    });
    const hourlyRes = await fetchOpenMeteo("/v1/forecast", hourlyParams);
    if (hourlyRes.status === 429) throw new Error("El servicio meteorológico está saturado. Inténtalo de nuevo en un minuto.");
    if (!hourlyRes.ok) throw new Error(`Open-Meteo ${hourlyRes.status}`);
    const hourlyJson = await hourlyRes.json() as { hourly: HourlyForecast }[] | { hourly: HourlyForecast };
    const mapped = mapRouteHours(schedule, Array.isArray(hourlyJson) ? hourlyJson : [hourlyJson]);
    const routeHourly = { date: comp.date, departureTime, durationHours: durationH, signature: routeWeatherSignature(pts, comp.date, durationH), timeZone, ...mapped };

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
        weather_forecast: { ...weather, lat, lon, fetched_at: new Date().toISOString(), route_hourly: routeHourly } as any,
        hydration_plan: hydration as any,
      })
      .eq("id", comp.id);
    if (uErr) throw new Error(uErr.message);

    return { weather, hydration, routeHourly };
  });
