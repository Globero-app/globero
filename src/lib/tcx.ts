import { cleanLabel, nearestTrackPointAtKm, type TrackPoint } from "./gpx";

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
  const match = source.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
  return match ? decodeXml(match[1].trim()) : undefined;
}

/** Lee todos los puntos del GPX original sin reducir el recorrido. */
export function parseGpxTrackForTcx(xml: string): TrackPoint[] {
  const points: TrackPoint[] = [];
  const pattern = /<trkpt\b([^>]*?)(?:\/>|>([\s\S]*?)<\/trkpt>)/gi;
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

  const generatedAt = new Date().toISOString();
  const trackXml = points.map((p) => `        <Trackpoint>
${p.time ? `          <Time>${escapeXml(p.time)}</Time>\n` : ""}          <Position>
            <LatitudeDegrees>${p.lat}</LatitudeDegrees>
            <LongitudeDegrees>${p.lon}</LongitudeDegrees>
          </Position>
${p.ele != null ? `          <AltitudeMeters>${p.ele}</AltitudeMeters>\n` : ""}        </Trackpoint>`).join("\n");

  const coursePointsXml = coursePoints.map((waypoint) => {
    const point = nearestTrackPointAtKm(points, Number(waypoint.km) || 0);
    if (!point) return "";
    const label = cleanLabel(waypoint.label || waypoint.note || (waypoint.carbs_g ? `CHO ${waypoint.carbs_g}g` : "Avituallamiento"));
    const amount = waypoint.carbs_g || Number(label.match(/(\d+)\s*g/i)?.[1]);
    const minute = Number(waypoint.minute);
    const clock = Number.isFinite(minute) && waypoint.minute != null ? formatRideClock(minute) : "";
    const name = `${amount ? `CHO ${amount}g` : label.slice(0, 12)}${clock ? ` ${clock}` : ""}`.slice(0, 24) || "Food";
    const notes = [
      `KM ${Number(waypoint.km) || 0}`,
      clock ? `t+${clock}` : "",
      amount ? `${amount} g CHO` : "",
      label,
    ].filter(Boolean).join(" - ");
    return `      <CoursePoint>
        <Name>${escapeXml(name)}</Name>
        <Time>${escapeXml(point.time || points[0].time || generatedAt)}</Time>
        <Position>
          <LatitudeDegrees>${point.lat}</LatitudeDegrees>
          <LongitudeDegrees>${point.lon}</LongitudeDegrees>
        </Position>
${point.ele != null ? `        <AltitudeMeters>${point.ele}</AltitudeMeters>\n` : ""}        <PointType>Food</PointType>
        <Notes>${escapeXml(notes)}</Notes>
      </CoursePoint>`;
  }).filter(Boolean).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd">
  <Courses>
    <Course>
      <Name>${escapeXml(routeName)}</Name>
      <Track>
${trackXml}
      </Track>
${coursePointsXml}
    </Course>
  </Courses>
</TrainingCenterDatabase>`;
}
