import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { planHydration, describeWeather, type WeatherDay } from "./weather";
import { z } from "zod";
import { estimatedRouteHours, forecastAvailability, mapRouteHours, metNoSymbolToWmo, routeDeparture, routeSchedule, routeWeatherSignature, type HourlyForecast, type RouteHour } from "./route-weather";
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

// --- MET Norway (respaldo) ---

async function resolveTimeZone(lat: number, lon: number) {
  try {
    const res = await fetch(`https://timeapi.io/api/timezone/coordinate?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`, { signal: AbortSignal.timeout(5000) });
    const json = (await res.json()) as { timeZone?: string };
    if (res.ok && json?.timeZone) return json.timeZone;
  } catch { /* Zona horaria por defecto abajo. */ }
  return "Europe/Madrid";
}

interface MetNoPoint { temp: number; humidity: number; windKmh: number; precip: number; prob: number; code: number }

async function fetchMetNoSeries(lat: number, lon: number) {
  const res = await fetch(`https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`, {
    headers: { "User-Agent": "Globero/1.0 (https://coach.globero.app)" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`MET Norway ${res.status}`);
  const json = (await res.json()) as any;
  const map = new Map<number, MetNoPoint>();
  for (const entry of json?.properties?.timeseries ?? []) {
    const t = Date.parse(entry.time);
    if (!Number.isFinite(t)) continue;
    const details = entry.data?.instant?.details ?? {};
    const next1 = entry.data?.next_1_hours;
    const next6 = entry.data?.next_6_hours;
    const next = next1 ?? next6;
    const precip = next?.details?.precipitation_amount;
    map.set(Math.floor(t / 3600000) * 3600, {
      temp: details.air_temperature,
      humidity: details.relative_humidity ?? 60,
      windKmh: (details.wind_speed ?? 0) * 3.6,
      precip: precip != null ? (next1 ? precip : precip / 6) : 0,
      prob: next?.details?.probability_of_precipitation ?? (precip > 0 ? 60 : 0),
      code: metNoSymbolToWmo(next?.summary?.symbol_code ?? "cloudy"),
    });
  }
  if (!map.size) throw new Error("Sin datos meteorológicos");
  return map;
}

async function metNoRouteForecast(pts: TrackPoint[], date: string, departureTime: string, durationH: number, signature: string) {
  const mid = pts[Math.floor(pts.length / 2)];
  const timeZone = await resolveTimeZone(mid.lat, mid.lon);
  const schedule = routeSchedule(pts, durationH, routeDeparture(date, departureTime, timeZone));
  const midPick = Math.floor(schedule.length / 2);
  const picks = [...new Set([0, midPick, schedule.length - 1])];
  const series = await Promise.all(picks.map(i => fetchMetNoSeries(schedule[i].lat, schedule[i].lon)));
  const samples: RouteHour[] = [];
  for (let i = 0; i < schedule.length; i++) {
    let best = 0;
    for (let k = 1; k < picks.length; k++) if (Math.abs(picks[k] - i) < Math.abs(picks[best] - i)) best = k;
    const point = series[best].get(Math.floor(schedule[i].timestamp / 3600000) * 3600);
    if (!point || !Number.isFinite(point.temp)) continue;
    samples.push({ ...schedule[i], temperature: point.temp, apparent: point.temp, wind: point.windKmh, rain: point.precip, rainProbability: point.prob });
  }
  const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const dayEntries = [...series[picks.indexOf(midPick) >= 0 ? picks.indexOf(midPick) : 0].entries()]
    .filter(([hour]) => dayFmt.format(new Date(hour * 1000)) === date)
    .map(([, v]) => v);
  const temps = dayEntries.map(e => e.temp).filter(Number.isFinite);
  if (!temps.length) throw new Error("Sin datos meteorológicos");
  const weather: WeatherDay = {
    date,
    temp_max_c: Math.max(...temps),
    temp_min_c: Math.min(...temps),
    apparent_max_c: Math.max(...temps),
    humidity_pct: dayEntries.reduce((a, e) => a + e.humidity, 0) / dayEntries.length,
    wind_kmh: Math.max(...dayEntries.map(e => e.windKmh)),
    precip_mm: dayEntries.reduce((a, e) => a + e.precip, 0),
    weather_code: Math.max(...dayEntries.map(e => e.code)),
    summary: "",
  };
  weather.summary = describeWeather(weather);
  return { weather, routeHourly: { date, departureTime, durationHours: durationH, signature, timeZone, samples, complete: samples.length === schedule.length } };
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

    let weather!: WeatherDay;
    let routeHourly!: { date: string; departureTime: string; durationHours: number; signature: string; timeZone: string; samples: RouteHour[]; complete: boolean };
    try {
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

      weather = {
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

      const timeZone = json.timezone || "Europe/Madrid";
      const schedule = routeSchedule(pts, requestedDuration, routeDeparture(comp.date, requestedDeparture, timeZone));
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
      routeHourly = { date: comp.date, departureTime: requestedDeparture, durationHours: requestedDuration, signature: requestedSignature, timeZone, ...mapped };
    } catch (primaryError) {
      // Respaldo automático: MET Norway (Yr) cuando Open-Meteo falla.
      try {
        const fallback = await metNoRouteForecast(pts, comp.date, requestedDeparture, requestedDuration, requestedSignature);
        weather = fallback.weather;
        routeHourly = fallback.routeHourly;
      } catch {
        throw primaryError instanceof Error ? primaryError : new Error("Servicio meteorológico no disponible");
      }
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("weight_kg")
      .eq("id", userId)
      .maybeSingle();
    const weight = profile?.weight_kg ?? 70;

    const hydration = planHydration(weight, requestedDuration, weather);

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
