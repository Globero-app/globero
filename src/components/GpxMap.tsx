import { useEffect, useRef } from "react";
import type { TrackPoint } from "@/lib/gpx";
import type { WaterSource } from "@/utils/gpxWaterFinder";

export function GpxMap({ points, waypoints, waterSources }: { points: TrackPoint[]; waypoints?: { lat: number; lon: number; label: string }[]; waterSources?: WaterSource[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (!ref.current || points.length === 0) return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current) return;
      if (!mapRef.current) {
        mapRef.current = L.map(ref.current, { scrollWheelZoom: false });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap",
        }).addTo(mapRef.current);
      }
      const map = mapRef.current;
      map.eachLayer((l: any) => { if (l.options && l.options.attribution === undefined) map.removeLayer(l); });
      const latlngs = points.map((p) => [p.lat, p.lon]) as [number, number][];
      const line = L.polyline(latlngs, { color: "#e11d48", weight: 4 }).addTo(map);
      map.fitBounds(line.getBounds(), { padding: [20, 20] });
      waypoints?.forEach((w) => {
        L.circleMarker([w.lat, w.lon], { radius: 7, color: "#ffffff", weight: 2, fillColor: "#e11d48", fillOpacity: 1 })
          .bindTooltip(w.label, { permanent: false, direction: "top" })
          .addTo(map);
      });
      waterSources?.forEach((source) => {
        L.circleMarker([source.lat, source.lon], { radius: 8, color: "#ffffff", weight: 2, fillColor: "#0284c7", fillOpacity: 1 })
          .bindTooltip(`🚰 ${source.name || "Agua potable"}`, { permanent: false, direction: "top" })
          .addTo(map);
      });
    })();
    return () => { cancelled = true; };
  }, [points, waypoints, waterSources]);

  useEffect(() => () => { mapRef.current?.remove(); mapRef.current = null; }, []);

  return <div ref={ref} className="w-full h-[400px] rounded-xl border overflow-hidden" />;
}
