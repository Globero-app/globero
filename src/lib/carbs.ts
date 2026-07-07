// Cálculo de necesidades de carbohidratos para ciclismo
// Basado en ISSN, ACSM y literatura deportiva (Burke, Jeukendrup).

import type { TrackPoint } from "./gpx";

export type Intensity = "baja" | "media" | "alta" | "competicion";

export interface RiderProfile {
  weight_kg: number;
  age?: number;
  ftp?: number;
  /** 0-100. Proxy de forma actual (basado en horas Strava últimas 4 semanas). */
  fitness_score?: number;
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
  // Rutas cortas (1-2 h): 30-40 g/h (más alto si es alta intensidad).
  if (durationH < 2) return intensity === "alta" || intensity === "competicion" ? 40 : 35;
  // Salidas estándar (2-3 h): 60 g/h.
  if (durationH < 3) return intensity === "alta" || intensity === "competicion" ? 70 : 60;
  // >3 h o alta intensidad: 80-90 g/h.
  return intensity === "alta" || intensity === "competicion" ? 90 : 80;
}

export interface NutritionWaypoint {
  km: number;
  minute: number;
  carbs_g: number;
  label: string;
  grade_pct?: number;
  phase?: "inicio" | "medio" | "final";
  note?: string;
}

/** Grado medio (%) de los próximos `windowKm` km desde `startKm`. */
function upcomingGrade(points: TrackPoint[], startKm: number, windowKm: number): number {
  if (!points || points.length < 2) return 0;
  let acc = 0;
  let startEle: number | null = null;
  let endEle: number | null = null;
  const R = 6371;
  const hav = (a: TrackPoint, b: TrackPoint) => {
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLon = ((b.lon - a.lon) * Math.PI) / 180;
    const l1 = (a.lat * Math.PI) / 180;
    const l2 = (b.lat * Math.PI) / 180;
    const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(l1) * Math.cos(l2);
    return 2 * R * Math.asin(Math.sqrt(x));
  };
  for (let i = 1; i < points.length; i++) {
    const seg = hav(points[i - 1], points[i]);
    const prev = acc;
    acc += seg;
    if (startEle === null && acc >= startKm) startEle = points[i].ele ?? 0;
    if (startEle !== null && acc >= startKm + windowKm) { endEle = points[i].ele ?? 0; break; }
    if (prev > startKm + windowKm) break;
  }
  if (startEle === null) return 0;
  if (endEle === null) endEle = points[points.length - 1].ele ?? startEle;
  const dElev = endEle - startEle;
  const dDist = Math.min(windowKm, Math.max(0.1, acc - startKm));
  return (dElev / (dDist * 1000)) * 100;
}

/** Calcula la fase de la carrera según el % de tiempo transcurrido. */
function racePhase(progress: number): "inicio" | "medio" | "final" {
  if (progress < 0.2) return "inicio";
  if (progress > 0.8) return "final";
  return "medio";
}

/** Reparte carbs en waypoints ajustando por pendiente próxima, fase, peso, FTP y forma. */
export function planRaceNutrition(
  rider: RiderProfile,
  race: RaceInfo,
  opts: { km_interval?: number; minute_interval?: number; track?: TrackPoint[] } = {}
): { totalCarbs: number; perHour: number; waypoints: NutritionWaypoint[]; durationH: number } {
  const durationH = estimateDuration(race);
  const intensity = race.intensity ?? "media";
  const basePerHour = inRideCarbsPerHour(durationH, intensity);

  // Ajustes por perfil del ciclista
  const weightFactor = Math.min(1.15, Math.max(0.85, 0.9 + 0.3 * (rider.weight_kg / 70 - 1)));
  const fitness = rider.fitness_score ?? 55;
  // Menos forma → menos tolerancia gástrica; más forma → puede asimilar más.
  const fitnessFactor = fitness < 35 ? 0.85 : fitness < 55 ? 0.95 : fitness < 75 ? 1.0 : 1.08;
  const ftpFactor = rider.ftp && rider.ftp >= 280 ? 1.05 : rider.ftp && rider.ftp < 200 ? 0.95 : 1.0;
  const perHour = Math.round(basePerHour * weightFactor * fitnessFactor * ftpFactor);

  const totalMinutes = durationH * 60;
  const kmInt = opts.km_interval ?? 15;
  const minInt = opts.minute_interval ?? 30;
  const avgSpeedKmh = race.distance_km / durationH;
  const track = opts.track;

  const waypoints: NutritionWaypoint[] = [];
  let nextKm = kmInt;
  let nextMin = minInt;
  let km = 0;
  let min = 0;
  while (km < race.distance_km && min < totalMinutes) {
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
    const progress = min / totalMinutes;
    const phase = racePhase(progress);
    // Curva de ingesta: ramp-up al inicio, pico en medio, ligera bajada al final.
    // Excepto en competición → mantiene alto hasta el final.
    const phaseFactor =
      phase === "inicio" ? 0.72
        : phase === "final" ? (intensity === "competicion" ? 0.95 : 0.85)
          : 1.10;
    // Pendiente próxima (~2 km por delante). Subir exige más CHO, bajar menos.
    const grade = track ? upcomingGrade(track, km, 2) : 0;
    const gradeFactor =
      grade >= 6 ? 1.30
        : grade >= 3 ? 1.18
          : grade >= 1 ? 1.05
            : grade <= -3 ? 0.75
              : grade <= -1 ? 0.88
                : 1.0;
    const baseDose = perHour * (minInt / 60);
    const raw = baseDose * phaseFactor * gradeFactor;
    const dose = Math.max(15, Math.min(45, Math.round(raw / 5) * 5));
    const note =
      grade >= 3 ? "antes de subida"
        : grade <= -3 ? "en bajada, ingesta ligera"
          : phase === "inicio" ? "ramp-up gástrico"
            : phase === "final" ? "sostener glucemia"
              : "tramo llano";
    waypoints.push({
      km: Math.round(km * 10) / 10,
      minute: Math.round(min),
      carbs_g: dose,
      grade_pct: Math.round(grade * 10) / 10,
      phase,
      note,
      label: `CHO ${dose}g · ${note}`,
    });
  }

  // Normaliza para que el total se acerque a perHour * durationH sin salirse del rango 15-45.
  const target = perHour * durationH;
  const sum = waypoints.reduce((s, w) => s + w.carbs_g, 0);
  if (sum > 0 && Math.abs(sum - target) / target > 0.08) {
    const k = target / sum;
    for (const w of waypoints) {
      w.carbs_g = Math.max(15, Math.min(45, Math.round((w.carbs_g * k) / 5) * 5));
      w.label = `CHO ${w.carbs_g}g · ${w.note}`;
    }
  }

  return {
    totalCarbs: waypoints.reduce((s, w) => s + w.carbs_g, 0),
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
