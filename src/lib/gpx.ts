// Parser y generador GPX (sin dependencias)

export interface TrackPoint { lat: number; lon: number; ele?: number; time?: string; }

export function parseGpx(xml: string): { points: TrackPoint[]; name?: string } {
  if (typeof DOMParser === "undefined") return { points: [] };
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");
  const trkpts = Array.from(doc.getElementsByTagName("trkpt"));
  const points: TrackPoint[] = trkpts.map((pt) => {
    const lat = parseFloat(pt.getAttribute("lat") || "0");
    const lon = parseFloat(pt.getAttribute("lon") || "0");
    const eleEl = pt.getElementsByTagName("ele")[0];
    const timeEl = pt.getElementsByTagName("time")[0];
    return {
      lat, lon,
      ele: eleEl ? parseFloat(eleEl.textContent || "0") : undefined,
      time: timeEl?.textContent || undefined,
    };
  });
  const nameEl = doc.getElementsByTagName("name")[0];
  return { points, name: nameEl?.textContent || undefined };
}

/** Distancia haversine en km. */
function haversine(a: TrackPoint, b: TrackPoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function trackStats(points: TrackPoint[]) {
  let dist = 0;
  let elev = 0;
  for (let i = 1; i < points.length; i++) {
    dist += haversine(points[i - 1], points[i]);
    const dEle = (points[i].ele ?? 0) - (points[i - 1].ele ?? 0);
    if (dEle > 0) elev += dEle;
  }
  return { distance_km: Math.round(dist * 10) / 10, elevation_m: Math.round(elev) };
}

/** Devuelve el punto del track a una distancia km dada (interpolando). */
export function pointAtKm(points: TrackPoint[], targetKm: number): TrackPoint | null {
  if (points.length === 0) return null;
  let accumulated = 0;
  for (let i = 1; i < points.length; i++) {
    const seg = haversine(points[i - 1], points[i]);
    if (accumulated + seg >= targetKm) {
      const ratio = (targetKm - accumulated) / seg;
      return {
        lat: points[i - 1].lat + (points[i].lat - points[i - 1].lat) * ratio,
        lon: points[i - 1].lon + (points[i].lon - points[i - 1].lon) * ratio,
        ele: points[i - 1].ele,
      };
    }
    accumulated += seg;
  }
  return points[points.length - 1];
}

export interface GpxWaypointInput { km: number; label: string; }

/** Genera un nuevo GPX con los waypoints de nutrición insertados. */
export function buildGpxWithWaypoints(
  originalXml: string,
  points: TrackPoint[],
  waypoints: GpxWaypointInput[],
  routeName = "Ruta con nutrición"
): string {
  const wptsXml = waypoints.map((w) => {
    const p = pointAtKm(points, w.km);
    if (!p) return "";
    return `  <wpt lat="${p.lat}" lon="${p.lon}">
    <name>${escapeXml(w.label)}</name>
    <desc>KM ${w.km} — ${escapeXml(w.label)}</desc>
    <sym>Restaurant</sym>
  </wpt>`;
  }).filter(Boolean).join("\n");

  // Inserta los <wpt> después del <gpx ...> de apertura
  const hasGpx = /<gpx[^>]*>/.test(originalXml);
  if (hasGpx) {
    return originalXml.replace(/<gpx([^>]*)>/, (m) => `${m}\n${wptsXml}`);
  }
  // GPX nuevo si el original no se puede parsear
  const trkpts = points.map((p) =>
    `      <trkpt lat="${p.lat}" lon="${p.lon}">${p.ele != null ? `<ele>${p.ele}</ele>` : ""}</trkpt>`
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Globero" xmlns="http://www.topografix.com/GPX/1/1">
${wptsXml}
  <trk><name>${escapeXml(routeName)}</name><trkseg>
${trkpts}
  </trkseg></trk>
</gpx>`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === '"' ? "&quot;" : "&apos;"
  );
}

/** Reduce los puntos del track para almacenamiento (cada N puntos). */
export function simplifyTrack(points: TrackPoint[], maxPoints = 1000): TrackPoint[] {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  return points.filter((_, i) => i % step === 0);
}
