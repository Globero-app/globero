import { cleanLabel, elevationProfile, nearestTrackPointAtKm, type TrackPoint } from "./gpx";

export interface TcxCoursePointInput {
  km: number;
  /** Minutos transcurridos desde la salida para esta toma. */
  minute?: number | null;
  label?: string | null;
  note?: string | null;
  carbs_g?: number | null;
}

/** Minutos desde la salida → "H:MM" legible en el ciclocomputador. */
export function formatRideClock(minutes: number): string {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function escapeXml(value: unknown): string {
  return String(value ?? "").replace(/[<>&"']/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === '"' ? "&quot;" : "&apos;"
  );
}

function decodeXml(value: string): string {
  return value.replace(/&(?:lt|gt|amp|quot|apos|#38|#60|#62);/g, (entity) => ({
    "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": '"', "&apos;": "'",
    "&#38;": "&", "&#60;": "<", "&#62;": ">",
  })[entity] || entity);
}

function attribute(source: string, name: string): number | undefined {
  const match = source.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']+)["']`, "i"));
  const value = match ? Number(match[1]) : NaN;
  return Number.isFinite(value) ? value : undefined;
}

function child(source: string, name: string): string | undefined {
  const match = source.match(new RegExp(`<(?:[\\w.-]+:)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${name}>`, "i"));
  return match ? decodeXml(match[1].trim()) : undefined;
}

/** Lee todos los puntos del GPX original sin reducir el recorrido. */
export function parseGpxTrackForTcx(xml: string): TrackPoint[] {
  const points: TrackPoint[] = [];
  const pattern = /<(?:[\w.-]+:)?trkpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w.-]+:)?trkpt>)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml))) {
    const lat = attribute(match[1], "lat");
    const lon = attribute(match[1], "lon");
    if (lat == null || lon == null) continue;
    const body = match[2] || "";
    const eleText = child(body, "ele");
    const ele = eleText == null ? NaN : Number(eleText);
    points.push({
      lat,
      lon,
      ele: Number.isFinite(ele) ? ele : undefined,
      time: child(body, "time"),
    });
  }
  return points;
}

/** Genera un TCX con el track completo y una parada Food por cada toma de CHO. */
export function buildTcxWithCoursePoints(
  originalGpx: string,
  fallbackPoints: TrackPoint[],
  coursePoints: TcxCoursePointInput[],
  routeName = "Ruta con nutrición",
): string {
  const originalPoints = parseGpxTrackForTcx(originalGpx);
  const points = originalPoints.length >= 2 ? originalPoints : fallbackPoints;
  if (points.length < 2) throw new Error("TCX incompleto: el track no tiene suficientes puntos");
  if (points.some((p) => !Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180)) {
    throw new Error("TCX incompleto: coordenadas del track inválidas");
  }

  const profile = elevationProfile(points);
  const distances = profile.map((p) => p.km * 1000);
  const originalStart = Date.parse(points[0].time || "");
  const start = Number.isFinite(originalStart) ? originalStart : Date.now();
  let previousTime = start - 1000;
  // TCX exige Time en TODOS los Trackpoint, incluso en GPX sin tiempos.
  const times = points.map((p, index) => {
    const originalTime = Date.parse(p.time || "");
    const estimatedTime = start + Math.round(distances[index] / (20_000 / 3600)) * 1000;
    const time = Math.max(previousTime + 1000, Number.isFinite(originalTime) ? originalTime : estimatedTime);
    previousTime = time;
    return new Date(time).toISOString();
  });
  const totalDistance = distances[distances.length - 1];
  const totalSeconds = (previousTime - start) / 1000;
  const trackXml = points.map((p, index) => `        <Trackpoint>
          <Time>${times[index]}</Time>
          <Position>
            <LatitudeDegrees>${p.lat}</LatitudeDegrees>
            <LongitudeDegrees>${p.lon}</LongitudeDegrees>
          </Position>
${p.ele != null && Number.isFinite(p.ele) ? `          <AltitudeMeters>${p.ele}</AltitudeMeters>\n` : ""}          <DistanceMeters>${distances[index].toFixed(3)}</DistanceMeters>
        </Trackpoint>`).join("\n");

  const coursePointsXml = coursePoints.map((waypoint) => {
    const point = nearestTrackPointAtKm(points, Number(waypoint.km) || 0);
    if (!point) return "";
    const label = cleanLabel(waypoint.label || waypoint.note || (waypoint.carbs_g ? `CHO ${waypoint.carbs_g}g` : "Avituallamiento"));
    const amount = waypoint.carbs_g || Number(label.match(/(\d+)\s*g/i)?.[1]);
    const minute = Number(waypoint.minute);
    const clock = Number.isFinite(minute) && waypoint.minute != null ? formatRideClock(minute) : "";
    // Garmin limita CoursePoint/Name a 10 caracteres; las notas conservan todo.
    const name = `${amount ? (clock ? `${amount}g` : `CHO ${amount}g`) : label}${clock ? ` ${clock}` : ""}`.slice(0, 10) || "Food";
    const time = clock ? new Date(start + Math.max(0, minute) * 60_000).toISOString() : times[points.indexOf(point)];
    const notes = [
      `KM ${Number(waypoint.km) || 0}`,
      clock ? `t+${clock}` : "",
      amount ? `${amount} g CHO` : "",
      label,
    ].filter(Boolean).join(" - ");
    return `      <CoursePoint>
        <Name>${escapeXml(name)}</Name>
        <Time>${time}</Time>
        <Position>
          <LatitudeDegrees>${point.lat}</LatitudeDegrees>
          <LongitudeDegrees>${point.lon}</LongitudeDegrees>
        </Position>
${point.ele != null && Number.isFinite(point.ele) ? `        <AltitudeMeters>${point.ele}</AltitudeMeters>\n` : ""}        <PointType>Food</PointType>
        <Notes>${escapeXml(notes)}</Notes>
      </CoursePoint>`;
  }).filter(Boolean).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd">
  <Courses>
    <Course>
      <Name>${escapeXml(cleanLabel(routeName).slice(0, 15))}</Name>
      <Lap>
        <TotalTimeSeconds>${totalSeconds}</TotalTimeSeconds>
        <DistanceMeters>${totalDistance.toFixed(3)}</DistanceMeters>
        <BeginPosition>
          <LatitudeDegrees>${points[0].lat}</LatitudeDegrees>
          <LongitudeDegrees>${points[0].lon}</LongitudeDegrees>
        </BeginPosition>
        <EndPosition>
          <LatitudeDegrees>${points[points.length - 1].lat}</LatitudeDegrees>
          <LongitudeDegrees>${points[points.length - 1].lon}</LongitudeDegrees>
        </EndPosition>
        <Intensity>Active</Intensity>
      </Lap>
      <Track>
${trackXml}
      </Track>
      <Notes>${escapeXml(routeName)}</Notes>
${coursePointsXml}
    </Course>
  </Courses>
</TrainingCenterDatabase>`;
}
