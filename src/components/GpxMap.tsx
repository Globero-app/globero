import { useEffect, useRef } from "react";
import type { TrackPoint } from "@/lib/gpx";
import type { WaterSource } from "@/utils/gpxWaterFinder";

export function GpxMap({ points, waypoints, waterSources, highlight, onHover }: { onHover?: (p: { lat: number; lon: number } | null) => void; highlight?: { lat: number; lon: number } | null; points: TrackPoint[]; waypoints?: { lat: number; lon: number; label: string }[]; waterSources?: WaterSource[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const hoverRef = useRef(onHover);
  hoverRef.current = onHover;
  const ptsRef = useRef(points);
  ptsRef.current = points;

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
        const m = mapRef.current;
        const pick = (e: any) => {
          const pts = ptsRef.current;
          const cp = e.containerPoint;
          let best: any = null, bd = Infinity;
          for (const p of pts) { const q = m.latLngToContainerPoint([p.lat, p.lon]); const d = (q.x - cp.x) ** 2 + (q.y - cp.y) ** 2; if (d < bd) { bd = d; best = p; } }
          hoverRef.current?.(best && bd < 900 ? { lat: best.lat, lon: best.lon } : null);
        };
        m.on("mousemove click", pick);
        m.on("mouseout", () => hoverRef.current?.(null));
      }
      const map = mapRef.current;
      hlRef.current = null;
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

  const hlRef = useRef<any>(null);
  useEffect(() => {
    (async () => {
      const map = mapRef.current;
      if (!map) return;
      const L = (await import("leaflet")).default;
      if (!highlight) { hlRef.current?.remove(); hlRef.current = null; return; }
      if (!hlRef.current) hlRef.current = L.circleMarker([highlight.lat, highlight.lon], { radius: 8, color: "#ffffff", weight: 3, fillColor: "#facc15", fillOpacity: 1 }).addTo(map);
      else hlRef.current.setLatLng([highlight.lat, highlight.lon]);
    })();
  }, [highlight]);

  useEffect(() => () => { mapRef.current?.remove(); mapRef.current = null; }, []);

  return <div ref={ref} className="w-full h-[400px] rounded-xl border overflow-hidden" />;
}
