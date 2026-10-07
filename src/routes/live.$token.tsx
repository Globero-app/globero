import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/live/$token")({
  head: () => ({
    meta: [
      { title: "Seguimiento en directo — Globero" },
      { name: "description", content: "Sigue en directo la posición de un ciclista con baliza Globero." },
      { property: "og:title", content: "Seguimiento en directo — Globero" },
      { property: "og:description", content: "Sigue en directo la posición de un ciclista con baliza Globero." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LivePage,
});

type Live = {
  name: string | null; status: string; expires_at: string; last_seen_at: string | null;
  last_lat: number | null; last_lon: number | null; battery_pct: number | null; points: [number, number][];
};

function LivePage() {
  const { token } = Route.useParams();
  const [data, setData] = useState<Live | null>(null);
  const [missing, setMissing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const layers = useRef<any[]>([]);
  const fitted = useRef(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data: d } = await supabase.rpc("get_live_beacon" as any, { _token: token });
      if (!alive) return;
      if (!d) setMissing(true); else { setMissing(false); setData(d as Live); }
    };
    load();
    const t = setInterval(load, 15000);
    return () => { alive = false; clearInterval(t); };
  }, [token]);

  useEffect(() => {
    if (!data || !ref.current) return;
    (async () => {
      const L = (await import("leaflet")).default;
      if (!map.current) {
        map.current = L.map(ref.current!);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(map.current);
      }
      layers.current.forEach((l) => map.current.removeLayer(l));
      layers.current = [];
      const sos = data.status === "sos";
      if (data.points.length > 1) layers.current.push(L.polyline(data.points, { color: "#e11d48", weight: 4 }).addTo(map.current));
      const last: [number, number] | null = data.last_lat != null && data.last_lon != null ? [data.last_lat, data.last_lon] : data.points.at(-1) ?? null;
      if (last) {
        layers.current.push(L.circleMarker(last, { radius: 10, color: "#ffffff", weight: 3, fillColor: sos ? "#dc2626" : "#2563eb", fillOpacity: 1 }).addTo(map.current));
        if (!fitted.current) { map.current.setView(last, 14); fitted.current = true; }
      } else if (!fitted.current) map.current.setView([40.4, -3.7], 5);
    })();
  }, [data]);

  useEffect(() => () => { map.current?.remove(); map.current = null; }, []);

  const noSignal = !!data && (data.status === "active" || data.status === "sos") && Date.now() - new Date(data.last_seen_at ?? 0).getTime() > 10 * 60 * 1000;
  const label = noSignal && data?.status !== "sos" ? "Sin cobertura" : data?.status === "sos" ? "SOS" : data?.status === "paused" ? "Pausada" : data?.status === "ended" ? "Finalizada" : "En directo";

  return (
    <div className="min-h-screen bg-background p-4 space-y-3 max-w-3xl mx-auto">
      <h1 className="text-2xl font-display font-bold">Seguimiento en directo</h1>
      {missing ? (
        <p className="text-muted-foreground">Este enlace no existe o ha caducado.</p>
      ) : (
        <>
          {data && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className={`font-semibold px-2 py-1 rounded ${data.status === "sos" ? "bg-destructive text-destructive-foreground" : noSignal ? "bg-muted text-foreground" : "bg-primary text-primary-foreground"}`}>{label}</span>
              {data.name && <span>{data.name}</span>}
              <span className="text-muted-foreground">Última posición: {data.last_seen_at ? new Date(data.last_seen_at).toLocaleString() : "—"}</span>
              {data.battery_pct != null && <span className="text-muted-foreground">Batería: {data.battery_pct}%</span>}
            </div>
          )}
          {noSignal && <p role="status" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">Sin cobertura: la baliza lleva más de 10 minutos sin enviar posición. Se muestra la última conocida.</p>}
          {data?.status === "sos" && <p role="alert" className="rounded-lg border-2 border-destructive bg-destructive/10 p-3 font-semibold">El ciclista ha activado el SOS. Si no contesta, llama al 112 e indica esta posición.</p>}
          <div ref={ref} className="w-full h-[70vh] rounded-xl border overflow-hidden" />
          <p className="text-xs text-muted-foreground">Se actualiza cada 15 segundos.</p>
        </>
      )}
    </div>
  );
}
