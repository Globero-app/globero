/* Aviso meteorológico diario: previsión del día + avisos oficiales (MeteoAlarm).
   Solo servidor. */

import { describeWeather, type WeatherDay } from "./weather";
import { adviseForWorkout } from "./weather-daily.server";

export interface ResolvedLocation {
  lat: number;
  lon: number;
  label: string;
  tokens: string[];
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Resuelve ciudad + país a coordenadas, cacheando el resultado en profiles. */
export async function resolveUserLocation(
  supabase: any,
  profile: any,
): Promise<ResolvedLocation | null> {
  const city = String(profile?.location_city ?? "").trim();
  if (!city) return null;

  const cached = profile?.location_lat != null && profile?.location_lon != null && profile?.location_resolved;
  if (cached && String(profile.location_resolved).startsWith(`${city}|`)) {
    const label = String(profile.location_resolved).split("|").slice(1).join("|");
    return {
      lat: Number(profile.location_lat),
      lon: Number(profile.location_lon),
      label,
      tokens: label.split(",").map((p) => norm(p)).filter(Boolean),
    };
  }

  const country = String(profile?.country ?? "").trim().toUpperCase();
  const params = new URLSearchParams({ name: city, count: "10", language: "es", format: "json" });
  if (country) params.set("countryCode", country);
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`);
  if (!res.ok) return null;
  const json = (await res.json()) as { results?: any[] };
  let list = json.results ?? [];
  if (country) list = list.filter((r) => String(r.country_code ?? "").toUpperCase() === country);
  const r = list[0];
  if (!r) return null;

  const label = [r.name, r.admin2, r.admin1, r.country].filter(Boolean).join(", ");
  try {
    await supabase
      .from("profiles")
      .update({ location_lat: r.latitude, location_lon: r.longitude, location_resolved: `${city}|${label}` })
      .eq("id", profile.id);
  } catch {
    /* cache best-effort */
  }

  return {
    lat: r.latitude,
    lon: r.longitude,
    label,
    tokens: [r.name, r.admin3, r.admin2, r.admin1].filter(Boolean).map((t: string) => norm(t)),
  };
}

interface OMDaily {
  time: string[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  apparent_temperature_max: number[];
  relative_humidity_2m_mean?: number[];
  precipitation_sum: number[];
  wind_speed_10m_max: number[];
  wind_gusts_10m_max?: number[];
  weather_code: number[];
}

export async function fetchTodayWeather(lat: number, lon: number): Promise<WeatherDay | null> {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,relative_humidity_2m_mean,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max",
    timezone: "auto",
    forecast_days: "1",
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  if (!res.ok) return null;
  const json = (await res.json()) as { daily?: OMDaily };
  const d = json.daily;
  if (!d?.time?.length) return null;
  const w: WeatherDay = {
    date: d.time[0],
    temp_max_c: d.temperature_2m_max[0],
    temp_min_c: d.temperature_2m_min[0],
    apparent_max_c: d.apparent_temperature_max[0],
    humidity_pct: d.relative_humidity_2m_mean?.[0] ?? 60,
    wind_kmh: Math.max(d.wind_speed_10m_max[0] ?? 0, (d.wind_gusts_10m_max?.[0] ?? 0) * 0.75),
    precip_mm: d.precipitation_sum[0],
    weather_code: d.weather_code[0],
    summary: "",
  };
  w.summary = describeWeather(w);
  return w;
}

// ── Avisos oficiales (MeteoAlarm) ───────────────────────────────────────────

const FEEDS: Record<string, string> = {
  ES: "spain", FR: "france", PT: "portugal", IT: "italy", DE: "germany", AT: "austria",
  BE: "belgium", NL: "netherlands", CH: "switzerland", IE: "ireland", GB: "united-kingdom",
  PL: "poland", CZ: "czechia", SE: "sweden", NO: "norway", FI: "finland", DK: "denmark",
  GR: "greece", HR: "croatia", HU: "hungary", RO: "romania", SI: "slovenia", SK: "slovakia",
  LU: "luxembourg", MT: "malta", CY: "cyprus", EE: "estonia", LV: "latvia", LT: "lithuania",
  BG: "bulgaria", RS: "serbia", IS: "iceland",
};

export interface OfficialWarning {
  level: number; // 2 amarillo · 3 naranja · 4 rojo
  color: string;
  event: string;
  area: string;
  description: string;
}

const LEVEL_COLOR: Record<number, string> = { 2: "amarillo", 3: "naranja", 4: "rojo" };

export async function fetchOfficialWarnings(
  countryCode: string,
  tokens: string[],
  dateISO: string,
): Promise<OfficialWarning[]> {
  const feed = FEEDS[String(countryCode ?? "").toUpperCase()];
  if (!feed || !tokens.length) return [];
  let json: any;
  try {
    const res = await fetch(`https://feeds.meteoalarm.org/api/v1/warnings/feeds-${feed}`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return [];
    json = await res.json();
  } catch {
    return [];
  }
  const out: OfficialWarning[] = [];
  const seen = new Set<string>();
  const tokenSet = tokens.filter((t) => t.length >= 4);

  for (const w of (json?.warnings ?? []) as any[]) {
    const infos = (w?.alert?.info ?? []) as any[];
    const info = infos.find((i) => String(i.language ?? "").startsWith("es")) ?? infos[0];
    if (!info) continue;

    // Vigente hoy
    const onset = String(info.onset ?? info.effective ?? "").slice(0, 10);
    const expires = String(info.expires ?? "").slice(0, 10);
    if (expires && expires < dateISO) continue;
    if (onset && onset > dateISO) continue;

    const levelRaw = (info.parameter ?? []).find((p: any) => p.valueName === "awareness_level")?.value ?? "";
    const level = Number(String(levelRaw).split(";")[0]) || 0;
    if (level < 2) continue;

    const areas = (info.area ?? []) as any[];
    const match = areas.find((a) => {
      const desc = norm(String(a.areaDesc ?? ""));
      return tokenSet.some((t) => desc.includes(t));
    });
    if (!match) continue;

    const key = `${info.event}|${match.areaDesc}|${level}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      level,
      color: LEVEL_COLOR[level] ?? "amarillo",
      event: String(info.event ?? "Aviso meteorológico"),
      area: String(match.areaDesc ?? ""),
      description: String(info.description ?? "").slice(0, 200),
    });
  }
  return out.sort((a, b) => b.level - a.level);
}

export interface DailyWeatherAlert {
  indoor: boolean;
  title: string;
  body: string;
  location: string;
  weather: WeatherDay | null;
  warnings: OfficialWarning[];
}

/** Construye el aviso del día; null si no hay nada que avisar. */
export async function buildDailyWeatherAlert(
  supabase: any,
  profile: any,
  dateISO: string,
): Promise<DailyWeatherAlert | null> {
  const loc = await resolveUserLocation(supabase, profile);
  if (!loc) return null;

  const autoIndoor = (profile?.weather_auto_indoor ?? true) as boolean;
  const windThreshold = Number(profile?.weather_wind_threshold_kmh ?? 25);

  const [weather, warnings] = await Promise.all([
    fetchTodayWeather(loc.lat, loc.lon).catch(() => null),
    fetchOfficialWarnings(String(profile?.country ?? ""), loc.tokens, dateISO).catch(() => []),
  ]);

  const advice = weather ? adviseForWorkout(weather, windThreshold, autoIndoor) : null;
  const top = warnings[0] ?? null;

  const hasWarning = !!top;
  const hasAdverse = !!advice && advice.reason !== "clima favorable";
  if (!hasWarning && !hasAdverse) return null;

  const indoor = (top ? top.level >= 3 : false) || (advice?.indoor ?? false);

  const parts: string[] = [];
  if (top) {
    parts.push(`Aviso ${top.color.toUpperCase()} · ${top.event} (${top.area}).`);
    if (top.description) parts.push(top.description);
  }
  if (weather) {
    parts.push(
      `${loc.label}: ${weather.summary} · ${Math.round(weather.temp_max_c)} °C · viento ${Math.round(weather.wind_kmh)} km/h · lluvia ${weather.precip_mm} mm.`,
    );
  }
  if (indoor) parts.push("Recomendación: cambia el entreno de hoy a rodillo o suspende la salida.");
  else if (hasAdverse && advice) parts.push(advice.note);

  const title = top
    ? top.level >= 4
      ? "🔴 Aviso meteorológico ROJO"
      : top.level === 3
        ? "🟠 Aviso meteorológico NARANJA"
        : "🟡 Aviso meteorológico AMARILLO"
    : "🌧️ Meteorología de hoy";

  return { indoor, title, body: parts.join("\n"), location: loc.label, weather, warnings };
}

/** Envía el aviso meteorológico del día (una sola vez por día y usuario). */
export async function sendDailyWeatherAlert(
  supabase: any,
  userId: string,
  dateISO: string,
): Promise<boolean> {
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select(
        "id, country, location_city, location_lat, location_lon, location_resolved, weather_auto_indoor, weather_wind_threshold_kmh, notify_weather_alerts",
      )
      .eq("id", userId)
      .maybeSingle();
    if (!profile || profile.notify_weather_alerts === false || !profile.location_city) return false;

    const alert = await buildDailyWeatherAlert(supabase, profile, dateISO);
    if (!alert) return false;

    // Dedupe diario
    const { data: prev } = await supabase
      .from("notification_log")
      .select("id")
      .eq("user_id", userId)
      .gte("created_at", `${dateISO}T00:00:00Z`)
      .ilike("title", "%Aviso meteorológico%")
      .limit(1);
    const { data: prev2 } = await supabase
      .from("notification_log")
      .select("id")
      .eq("user_id", userId)
      .gte("created_at", `${dateISO}T00:00:00Z`)
      .ilike("title", "%Meteorología de hoy%")
      .limit(1);
    if ((prev?.length ?? 0) > 0 || (prev2?.length ?? 0) > 0) return false;

    const { notifyUser } = await import("./web-push.server");
    await notifyUser(userId, {
      title: alert.title,
      body: alert.body,
      tag: `weather-${dateISO}`,
      url: "/entrenamientos",
    });
    return true;
  } catch (e) {
    console.error("[weather-alert]", e);
    return false;
  }
}
