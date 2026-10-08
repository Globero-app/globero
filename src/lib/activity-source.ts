/** Nombre legible del origen de una actividad a partir de su id (`<origen>_<id>`). Sin prefijo = Intervals.icu. */
const NAMES: Record<string, string> = {
  strava: "Strava", wahoo: "Wahoo", garmin: "Garmin", hammerhead: "Hammerhead",
  igpsport: "iGPSport", intervals: "Intervals.icu", coros: "COROS", polar: "Polar", suunto: "Suunto", zwift: "Zwift",
};

export function activitySource(id: string | number | null | undefined, raw?: any): string {
  const s = String(raw?.source ?? String(id ?? "").match(/^([a-z][a-z0-9-]*)_/i)?.[1] ?? "intervals").toLowerCase();
  return NAMES[s] ?? s.charAt(0).toUpperCase() + s.slice(1);
}
