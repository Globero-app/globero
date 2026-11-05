import { pointAtKm, trackStats, type TrackPoint } from "./gpx";

export interface RouteHour {
  timestamp: number;
  km: number;
  lat: number;
  lon: number;
  temperature: number;
  apparent: number;
  wind: number;
  rain: number;
  rainProbability: number;
}
export interface RouteForecast {
  date: string;
  departureTime: string;
  durationHours: number;
  signature: string;
  timeZone: string;
  complete: boolean;
  samples: RouteHour[];
}
export interface HourlyForecast {
  time: number[];
  temperature_2m: (number | null)[];
  apparent_temperature: (number | null)[];
  wind_speed_10m: (number | null)[];
  precipitation: (number | null)[];
  precipitation_probability: (number | null)[];
}

export function forecastAvailability(date: string, now = new Date(), zone = "Europe/Madrid") {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = (key: string) => parts.find(p => p.type === key)?.value;
  const today = `${value("year")}-${value("month")}-${value("day")}`;
  const days = (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000;
  return days < 0 ? "past" : days <= 3 ? "available" : "too_far";
}

export function estimatedRouteHours(route: { duration_hours?: number | null; distance_km?: number | null; elevation_m?: number | null; intensity?: string | null }) {
  if (route.duration_hours && route.duration_hours > 0) return route.duration_hours;
  return Math.max(0.1, (route.distance_km ?? 0) / (["alta", "competicion"].includes(route.intensity ?? "") ? 28 : 24) + (route.elevation_m ?? 0) / 1000 * 0.6);
}

export function routeWeatherSignature(points: TrackPoint[], date: string, duration: number) {
  // Includes the entire geometry, so editing/replacing a GPX cannot reuse old weather.
  let hash = 2166136261;
  for (const char of JSON.stringify([date, duration, points])) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16);
}

/** Resolve a local departure in the forecast's IANA zone, including midnight and DST. */
export function routeDeparture(date: string, time: string, timeZone: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("Hora de salida inválida");
  const target = Date.parse(`${date}T${time}:00Z`);
  const fmt = new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  let result = target;
  for (let i = 0; i < 4; i++) {
    const local = Date.parse(`${fmt.format(new Date(result)).replace(" ", "T")}Z`);
    const delta = target - local;
    if (delta === 0) return result;
    result += delta;
  }
  throw new Error("Hora de salida inválida");
}

export function routeSchedule(points: TrackPoint[], durationHours: number, departure: number) {
  if (points.length < 2 || !Number.isFinite(durationHours) || durationHours < 0.1 || durationHours > 24) throw new Error("Duración inválida (0,1–24 h)");
  const distance = trackStats(points).distance_km;
  const minutes = Math.round(durationHours * 60);
  const offsets = Array.from({ length: Math.ceil(minutes / 60) }, (_, i) => i * 60);
  offsets.push(minutes);
  return offsets.map(minute => {
    const km = distance * minute / minutes;
    const point = minute === 0 ? points[0] : pointAtKm(points, km);
    if (!point) throw new Error("GPX inválido");
    return { timestamp: departure + minute * 60000, km, lat: point.lat, lon: point.lon };
  });
}

export function mapRouteHours(schedule: ReturnType<typeof routeSchedule>, forecasts: { hourly: HourlyForecast }[]) {
  const samples: RouteHour[] = [];
  schedule.forEach((sample, index) => {
    const hourly = forecasts[index]?.hourly;
    if (!hourly) return;
    const hour = hourly.time.findIndex(t => t * 1000 <= sample.timestamp && sample.timestamp < (t + 3600) * 1000);
    if (hour < 0) return;
    const values = [hourly.temperature_2m[hour], hourly.apparent_temperature[hour], hourly.wind_speed_10m[hour], hourly.precipitation[hour], hourly.precipitation_probability[hour]];
    if (values.some(v => v == null || !Number.isFinite(v))) return;
    samples.push({ ...sample, temperature: values[0] as number, apparent: values[1] as number, wind: values[2] as number, rain: values[3] as number, rainProbability: values[4] as number });
  });
  return { samples, complete: samples.length === schedule.length };
}

/** Mapeo de símbolos MET Norway (locationforecast) a códigos WMO usados por describeWeather. */
export function metNoSymbolToWmo(symbol: string): number {
  const base = symbol.split("_")[0];
  if (base.includes("thunder")) return 95;
  switch (base) {
    case "clearsky": return 0;
    case "fair": return 1;
    case "partlycloudy": return 2;
    case "fog": return 45;
    case "lightdrizzle": case "drizzle": return 51;
    case "lightrain": return 61;
    case "rain": return 63;
    case "heavyrain": return 65;
    case "lightsleet": case "sleet": case "heavysleet": return 68;
    case "lightsnow": return 71;
    case "snow": return 73;
    case "heavysnow": return 75;
    case "lightrainshowers": return 80;
    case "rainshowers": return 81;
    case "heavyrainshowers": return 82;
    case "lightsleetshowers": case "sleetshowers": case "heavysleetshowers": return 83;
    case "lightsnowshowers": return 85;
    case "snowshowers": case "heavysnowshowers": return 86;
    case "cloudy": default: return 3;
  }
}

export type ClothingItem = "thermal_top" | "long_top" | "short_top" | "light_top" | "base_layer" | "thermal_tights" | "tights" | "shorts" | "leg_warmers" | "arm_warmers" | "vest" | "windbreaker" | "rain_jacket" | "full_gloves" | "light_gloves" | "overshoes" | "cap" | "sunscreen";
export function clothingFromForecast(forecast?: RouteForecast | null) {
  if (!forecast?.complete || !Array.isArray(forecast.samples) || forecast.samples.length < 2) return null;
  const expected = Math.ceil(Math.round(forecast.durationHours * 60) / 60) + 1;
  if (forecast.samples.length !== expected || forecast.samples.some(s =>
    ![s.timestamp, s.km, s.temperature, s.apparent, s.wind, s.rain, s.rainProbability].every(Number.isFinite)
  )) return null;
  return recommendClothing(forecast.samples);
}

export function recommendClothing(samples: RouteHour[]) {
  if (!samples.length) return null;
  const min = Math.min(...samples.map(s => Math.min(s.temperature, s.apparent)));
  const max = Math.max(...samples.map(s => s.temperature));
  const wind = Math.max(...samples.map(s => s.wind));
  const rain = Math.max(...samples.map(s => s.rain));
  const probability = Math.max(...samples.map(s => s.rainProbability));
  const upper: ClothingItem[] = [min < 8 ? "thermal_top" : min < 18 ? "long_top" : min < 25 ? "short_top" : "light_top"];
  const legs: ClothingItem[] = [min < 8 ? "thermal_tights" : min < 15 ? "tights" : "shorts"];
  const accessories: ClothingItem[] = [];
  if (min < 12) upper.push("base_layer");
  if (min < 15) accessories.push("full_gloves"); else accessories.push("light_gloves");
  if (min < 8) accessories.push("overshoes", "cap");
  if (min < 18 || max - min >= 6) accessories.push("vest", "arm_warmers");
  if (min >= 15 && min < 18) accessories.push("leg_warmers");
  if (wind >= 20) accessories.push("windbreaker");
  if (rain >= 0.1 || probability >= 40) accessories.push("rain_jacket");
  if (max >= 20) accessories.push("sunscreen");
  return { upper, legs, accessories, min, max, wind, rain, probability, cold: min < 5, strongWind: wind >= 40, heavyRain: rain >= 5 };
}