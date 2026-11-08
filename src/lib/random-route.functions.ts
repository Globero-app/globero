import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { RANDOM_ROUTE_POINTS, simplifyRandomRouteCoordinates } from "./random-route";

const PROFILES = { carretera: "cycling-road", mtb: "cycling-mountain", gravel: "cycling-regular" } as const;

export const generateRandomRoute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      name: z.string().min(1).max(120),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      type: z.enum(["carretera", "gravel", "mtb"]),
      distance_km: z.number().min(5).max(300),
      elevation_m: z.number().min(0).max(8000),
      duration_hours: z.number().min(0).max(24).nullable(),
      intensity: z.string().max(30),
      start: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }).nullable().optional(),
      start_label: z.string().max(200).nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const key = process.env["ORS_API_KEY"];
    if (!key) throw new Error("Falta la clave de OpenRouteService");
    const { supabase, userId } = context;
    let geo: { lat: number; lon: number } | null = data.start ?? null;
    if (!geo) {
      const { data: prof } = await supabase.from("profiles").select("location_city, location_lat, location_lon").eq("id", userId).maybeSingle();
      const city = prof?.location_city;
      if (!city) throw new Error("Indica la población de salida o configura la 'Ciudad base para previsión' en Ajustes");
      if (prof?.location_lat != null && prof?.location_lon != null) geo = { lat: Number(prof.location_lat), lon: Number(prof.location_lon) };
      else {
        const { geocodeCity } = await import("./weather-daily.server");
        geo = await geocodeCity(city);
      }
    }
    if (!geo) throw new Error("No se pudo localizar la población de salida");

    // Una única ronda paralela: cuatro candidatas como máximo, sin rondas correctivas.
    const target = data.elevation_m;
    const targetKm = data.distance_km;
    const mPerKm = target / targetKm;
    const steep = mPerKm < 8 ? 0 : mPerKm < 15 ? 1 : mPerKm < 22 ? 2 : 3;
    const fetchOne = async (points: number, seed: number, weighted: boolean) => {
      const body: any = {
        coordinates: [[geo.lon, geo.lat]],
        elevation: true,
        options: { round_trip: { length: Math.round(targetKm * 800), points, seed } },
      };
      if (weighted) body.options.profile_params = { weightings: { steepness_difficulty: steep } };
      const res = await fetch(`https://api.heigit.org/openrouteservice/v2/directions/${PROFILES[data.type]}/geojson`, {
        method: "POST",
        headers: { Authorization: key, "Content-Type": "application/json", Accept: "application/geo+json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        const t = await res.text();
        console.error(`ORS failed [${res.status}]: ${t}`);
        throw new Error(`OpenRouteService [${res.status}]: ${t.slice(0, 200)}`);
      }
      const json: any = await res.json();
      return json.features?.[0];
    };
    const distOf = (f: any) => (f.properties?.summary?.distance ?? 0) / 1000;
    const ascOf = (f: any) => f.properties?.ascent ?? 0;
    const score = (f: any) =>
      2 * (Math.abs(ascOf(f) - target) / Math.max(target, 150)) + Math.abs(distOf(f) - targetKm) / targetKm;
    const results = await Promise.allSettled(
      RANDOM_ROUTE_POINTS.map((points, index) => fetchOne(points, Math.floor(Math.random() * 100000), index < 2)),
    );
    const all = results.filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled" && r.value).map(r => r.value);
    if (!all.length) {
      const lastErr = (results.find(r => r.status === "rejected") as PromiseRejectedResult | undefined)?.reason;
      throw lastErr ?? new Error("No se pudo generar la ruta");
    }
    const feat = all.sort((a, b) => score(a) - score(b))[0];
    const rawCoords: number[][] = feat?.geometry?.coordinates ?? [];
    if (rawCoords.length < 2) throw new Error("No se pudo generar la ruta");
    const coords = simplifyRandomRouteCoordinates(rawCoords);
    const summary = feat.properties?.summary ?? {};
    const ascent = Math.round(feat.properties?.ascent ?? 0);
    const distKm = Math.round(((summary.distance ?? data.distance_km * 1000) / 1000) * 10) / 10;

    const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
    const trkpts = coords
      .map(([lon, lat, ele]) => `      <trkpt lat="${lat}" lon="${lon}">${ele != null ? `<ele>${ele}</ele>` : ""}</trkpt>`)
      .join("\n");
    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Globero" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><name>${esc(data.name)}</name><trkseg>
${trkpts}
  </trkseg></trk>
</gpx>`;

    const { data: row, error } = await supabase.from("competitions").insert({
      user_id: userId,
      name: data.name,
      date: data.date,
      type: data.type,
      intensity: data.intensity,
      duration_hours: data.duration_hours,
      distance_km: distKm,
      elevation_m: ascent,
      gpx_data: gpx,
      gpx_filename: `${data.name}.gpx`,
      notes: `Ruta aleatoria desde ${data.start_label || (geo as any).name || "tu ciudad base"}`,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });
