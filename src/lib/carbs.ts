// Cálculo de necesidades de carbohidratos para ciclismo
// Basado en ISSN, ACSM y literatura deportiva (Burke, Jeukendrup).

export type Intensity = "baja" | "media" | "alta" | "competicion";

export interface RiderProfile {
  weight_kg: number;
  age?: number;
  ftp?: number;
}

export interface RaceInfo {
  distance_km: number;
  elevation_m: number;
  duration_hours?: number;
  intensity?: Intensity;
}

/** Estima duración (h) si no se aporta: velocidad media según intensidad y desnivel. */
export function estimateDuration(race: RaceInfo): number {
  if (race.duration_hours && race.duration_hours > 0) return race.duration_hours;
  const baseSpeed = race.intensity === "alta" || race.intensity === "competicion" ? 28 : 24;
  // Penaliza por desnivel: cada 1000m ≈ 1h extra aprox
  return race.distance_km / baseSpeed + (race.elevation_m / 1000) * 0.6;
}

/** g de CHO por kg / día en fase de carga pre-carrera (días previos). */
export function preRaceCarbsPerKg(daysBefore: number): number {
  // Día -1 y -2: 8-10 g/kg (carga). -3 a -5: 6-7 g/kg (mantenimiento alto).
  if (daysBefore <= 2) return 9;
  if (daysBefore <= 3) return 7;
  return 6;
}

/** g de CHO / hora durante la actividad según duración. Jeukendrup 2014. */
export function inRideCarbsPerHour(durationH: number, intensity: Intensity = "media"): number {
  if (durationH < 1) return 0;
  if (durationH < 2) return 30;
  if (durationH < 2.5) return 60;
  if (intensity === "alta" || intensity === "competicion") return 90;
  return 75;
}

/** Reparte la cantidad/h en waypoints cada X km y cada Y minutos (lo que ocurra primero). */
export interface NutritionWaypoint {
  km: number;
  minute: number;
  carbs_g: number;
  label: string;
}

export function planRaceNutrition(
  rider: RiderProfile,
  race: RaceInfo,
  opts: { km_interval?: number; minute_interval?: number } = {}
): { totalCarbs: number; perHour: number; waypoints: NutritionWaypoint[]; durationH: number } {
  const durationH = estimateDuration(race);
  const intensity = race.intensity ?? "media";
  const perHour = inRideCarbsPerHour(durationH, intensity);
  const totalMinutes = durationH * 60;
  const kmInt = opts.km_interval ?? 15;
  const minInt = opts.minute_interval ?? 30;
  const avgSpeedKmh = race.distance_km / durationH;
  const dosePerWaypoint = (perHour * (minInt / 60));

  const waypoints: NutritionWaypoint[] = [];
  let nextKm = kmInt;
  let nextMin = minInt;
  let km = 0;
  let min = 0;
  while (km < race.distance_km && min < totalMinutes) {
    // siguiente disparo: el que ocurra antes
    const minIfKm = (nextKm / avgSpeedKmh) * 60;
    if (minIfKm <= nextMin) {
      km = nextKm;
      min = minIfKm;
      nextKm += kmInt;
    } else {
      min = nextMin;
      km = (min / 60) * avgSpeedKmh;
      nextMin += minInt;
    }
    if (km >= race.distance_km) break;
    waypoints.push({
      km: Math.round(km * 10) / 10,
      minute: Math.round(min),
      carbs_g: Math.round(dosePerWaypoint / 5) * 5 || 30,
      label: `Carbo ${Math.round(dosePerWaypoint / 5) * 5 || 30}gr`,
    });
  }
  return {
    totalCarbs: Math.round(perHour * durationH),
    perHour,
    waypoints,
    durationH: Math.round(durationH * 10) / 10,
  };
}

export function dailyMacros(weight_kg: number, daysBefore: number) {
  const cho = Math.round(preRaceCarbsPerKg(daysBefore) * weight_kg);
  const protein = Math.round(1.6 * weight_kg);
  const fat = Math.round(1 * weight_kg);
  const kcal = cho * 4 + protein * 4 + fat * 9;
  return { cho, protein, fat, kcal };
}
