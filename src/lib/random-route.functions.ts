import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const key = process.env["ORS_API_KEY"];
    if (!key) throw new Error("Falta la clave de OpenRouteService");
    const { supabase, userId } = context;
    const { data: prof } = await supabase.from("profiles").select("location_city").eq("id", userId).maybeSingle();
    const city = prof?.location_city;
    if (!city) throw new Error("Configura la 'Ciudad base para previsión' en Ajustes");
    const { geocodeCity } = await import("./weather-daily.server");
    const geo = await geocodeCity(city);
    if (!geo) throw new Error("No se pudo localizar la ciudad base");

    // Más desnivel deseado → más puntos para buscar variedad; seed aleatoria
    const points = Math.min(10, Math.max(3, Math.round(3 + data.elevation_m / 800)));
    const res = await fetch(`https://api.heigit.org/openrouteservice/v2/directions/${PROFILES[data.type]}/geojson`, {
      method: "POST",
      headers: { Authorization: key, "Content-Type": "application/json", Accept: "application/geo+json" },
      body: JSON.stringify({
        coordinates: [[geo.lon, geo.lat]],
        elevation: true,
        options: { round_trip: { length: Math.round(data.distance_km * 1000), points, seed: Math.floor(Math.random() * 1000) } },
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      console.error(`ORS failed [${res.status}]: ${t}`);
      throw new Error(`OpenRouteService [${res.status}]: ${t.slice(0, 200)}`);
    }
    const json: any = await res.json();
    const feat = json.features?.[0];
    const coords: number[][] = feat?.geometry?.coordinates ?? [];
    if (coords.length < 2) throw new Error("No se pudo generar la ruta");
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
      notes: `Ruta aleatoria desde ${geo.name}`,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });
