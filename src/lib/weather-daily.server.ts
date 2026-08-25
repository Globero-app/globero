/* Helper de servidor para obtener previsión meteorológica diaria por ciudad.
   Usa Open-Meteo (sin API key). Solo servidor. */

import { describeWeather, type WeatherDay } from "./weather";

interface GeoResult {
  results?: Array<{ latitude: number; longitude: number; name: string; country: string }>;
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

export async function geocodeCity(city: string): Promise<{ lat: number; lon: number; name: string } | null> {
  if (!city?.trim()) return null;
  const params = new URLSearchParams({
    name: city.trim(),
    count: "1",
    language: "es",
    format: "json",
  });
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`);
  if (!res.ok) return null;
  const json = (await res.json()) as GeoResult;
  const r = json.results?.[0];
  if (!r) return null;
  return { lat: r.latitude, lon: r.longitude, name: `${r.name}, ${r.country}` };
}

export async function fetchDailyWeather(
  city: string,
  dates: string[],
): Promise<Map<string, WeatherDay> | null> {
  if (!city?.trim() || !dates.length) return null;
  const geo = await geocodeCity(city);
  if (!geo) return null;

  const sorted = [...dates].sort();
  const start = sorted[0];
  const end = sorted[sorted.length - 1];

  const params = new URLSearchParams({
    latitude: geo.lat.toFixed(4),
    longitude: geo.lon.toFixed(4),
    daily: "weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,relative_humidity_2m_mean,precipitation_sum,wind_speed_10m_max",
    timezone: "auto",
    start_date: start,
    end_date: end,
  });

  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  if (!res.ok) return null;
  const json = (await res.json()) as { daily?: OMDaily };
  const d = json.daily;
  if (!d?.time?.length) return null;

  const map = new Map<string, WeatherDay>();
  for (let i = 0; i < d.time.length; i++) {
    const w: WeatherDay = {
      date: d.time[i],
      temp_max_c: d.temperature_2m_max[i],
      temp_min_c: d.temperature_2m_min[i],
      apparent_max_c: d.apparent_temperature_max[i],
      humidity_pct: d.relative_humidity_2m_mean?.[i] ?? 60,
      wind_kmh: d.wind_speed_10m_max[i],
      precip_mm: d.precipitation_sum[i],
      weather_code: d.weather_code[i],
      summary: "",
    };
    w.summary = describeWeather(w);
    map.set(w.date, w);
  }
  return map;
}

export interface WeatherAdvice {
  indoor: boolean;
  reason: string;
  note: string;
  alternative_start?: string;
}

export function adviseForWorkout(
  w: WeatherDay,
  windThreshold: number,
  autoIndoor: boolean,
): WeatherAdvice {
  const parts: string[] = [];
  let indoor = false;

  if (w.precip_mm >= 5) {
    parts.push(`lluvia intensa prevista (${w.precip_mm} mm)`);
    indoor = autoIndoor;
  } else if (w.precip_mm >= 1) {
    parts.push(`lluvia ligera (${w.precip_mm} mm)`);
  }

  if (w.apparent_max_c >= 35) {
    parts.push(`calor extremo (${w.apparent_max_c} °C)`);
    indoor = autoIndoor;
  } else if (w.apparent_max_c <= 2) {
    parts.push(`frío extremo (${w.apparent_max_c} °C)`);
    indoor = autoIndoor;
  }

  if (w.wind_kmh >= windThreshold + 10) {
    parts.push(`viento muy fuerte (${w.wind_kmh} km/h)`);
    indoor = autoIndoor;
  } else if (w.wind_kmh >= windThreshold) {
    parts.push(`viento fuerte (${w.wind_kmh} km/h)`);
  }

  const code = w.weather_code;
  if ([95, 96, 99].includes(code)) {
    parts.push("tormenta");
    indoor = autoIndoor;
  }

  if (!parts.length) {
    return { indoor: false, reason: "clima favorable", note: w.summary };
  }

  const reason = parts.join(" · ");
  const note = indoor
    ? `Se sugiere rodillo por ${reason}.`
    : `Condiciones adversas: ${reason}. Considera rodillo o cambiar horario.`;

  return { indoor, reason, note };
}
