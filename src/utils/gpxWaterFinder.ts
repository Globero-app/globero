// Detección de fuentes de agua potable a lo largo de un track GPX (Overpass / OpenStreetMap)

export interface LatLon { lat: number; lon: number }
export interface WaterSource { lat: number; lon: number; name?: string }

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

/** BBox del track con margen de seguridad (grados). */
export function trackBBox(points: LatLon[], buffer = 0.005) {
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  return {
    minLat: Math.min(...lats) - buffer,
    minLon: Math.min(...lons) - buffer,
    maxLat: Math.max(...lats) + buffer,
    maxLon: Math.max(...lons) + buffer,
  };
}

/** Distancia haversine en metros. */
export function haversineMeters(a: LatLon, b: LatLon): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Consulta Overpass buscando fuentes de agua potable dentro del bbox. */
export async function fetchWaterSources(points: LatLon[], signal?: AbortSignal): Promise<WaterSource[]> {
  if (points.length < 2) return [];
  const { minLat, minLon, maxLat, maxLon } = trackBBox(points);
  const bbox = `${minLat},${minLon},${maxLat},${maxLon}`;
  const query = `[out:json][timeout:25];
(
  node["amenity"="drinking_water"](${bbox});
  node["man_made"="water_tap"]["drinking_water"!="no"](${bbox});
  node["natural"="spring"]["drinking_water"="yes"](${bbox});
  node["amenity"="water_point"]["drinking_water"!="no"](${bbox});
);
out body;`;

  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
    signal,
  });
  if (!res.ok) throw new Error("Overpass no disponible");
  const json = await res.json();
  return (json.elements ?? [])
    .filter((el: any) => typeof el.lat === "number" && typeof el.lon === "number")
    .map((el: any) => ({ lat: el.lat, lon: el.lon, name: el.tags?.name as string | undefined }));
}

/** Mantiene solo las fuentes a menos de 200m del track. */
export function filterNearTrack(sources: WaterSource[], track: LatLon[], maxMeters = 200): WaterSource[] {
  return sources.filter((s) => {
    for (const p of track) {
      if (haversineMeters(s, p) <= maxMeters) return true;
    }
    return false;
  });
}

/** Espaciado de fuentes según el tipo de ruta: carretera cada 30km (±5), gravel/MTB cada 15km (±3). Máx. 3 por tramo. */
export function filterByRouteSpacing(sources: WaterSource[], track: LatLon[], bikeType?: string): WaterSource[] {
  if (!sources.length || track.length < 2) return sources;
  const road = bikeType === "carretera";
  const intervalKm = road ? 30 : 15;
  const toleranceKm = road ? 5 : 3;
  const cum: number[] = [0];
  for (let i = 1; i < track.length; i++) cum[i] = cum[i - 1] + haversineMeters(track[i - 1], track[i]) / 1000;
  const totalKm = cum[cum.length - 1];
  const enriched = sources.map((s) => {
    let best = Infinity;
    let km = 0;
    for (let i = 0; i < track.length; i++) {
      const d = haversineMeters(s, track[i]);
      if (d < best) { best = d; km = cum[i]; }
    }
    return { s, km, dist: best };
  });
  const keep: WaterSource[] = [];
  for (let target = intervalKm; target - toleranceKm <= totalKm; target += intervalKm) {
    const bucket = enriched
      .filter((e) => Math.abs(e.km - target) <= toleranceKm)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 3);
    bucket.forEach((e) => { if (!keep.includes(e.s)) keep.push(e.s); });
  }
  return keep;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === '"' ? "&quot;" : "&apos;"
  );
}

/** Inyecta las fuentes como <wpt> en un GPX existente, conservando los waypoints previos. */
export function injectWaterWaypoints(gpxXml: string, sources: WaterSource[]): string {
  if (!sources.length) return gpxXml;
  const wpts = sources
    .map(
      (s) => `  <wpt lat="${s.lat}" lon="${s.lon}">
    <name>🚰 Agua</name>
    <desc>${escapeXml(s.name || "Fuente de agua potable")}</desc>
    <sym>Drinking Water</sym>
  </wpt>`
    )
    .join("\n");
  if (/<gpx[^>]*>/.test(gpxXml)) return gpxXml.replace(/<gpx([^>]*)>/, (m) => `${m}\n${wpts}`);
  return gpxXml;
}

/** Flujo completo: busca, filtra e inyecta las fuentes de agua en el GPX. */
export async function addWaterWaypointsToGpx(gpxXml: string, track: LatLon[], maxMeters = 200) {
  const found = await fetchWaterSources(track);
  const near = filterNearTrack(found, track, maxMeters);
  return { xml: injectWaterWaypoints(gpxXml, near), count: near.length, sources: near };
}
