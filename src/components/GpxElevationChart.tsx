import { useEffect, useId, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Mountain } from "lucide-react";
import { elevationProfile, parseGpx, type TrackPoint } from "@/lib/gpx";
import { activeLang } from "@/lib/i18n";

const labels = {
  es: { title: "Altimetría", altitude: "Elevación", distance: "Distancia", missing: "El GPX no contiene datos de elevación.", descent: "Bajada" },
  ca: { title: "Altimetria", altitude: "Elevació", distance: "Distància", missing: "El GPX no conté dades d'elevació.", descent: "Baixada" },
  fr: { title: "Profil altimétrique", altitude: "Altitude", distance: "Distance", missing: "Le GPX ne contient pas de données d'altitude.", descent: "Descente" },
  en: { title: "Elevation profile", altitude: "Elevation", distance: "Distance", missing: "The GPX contains no elevation data.", descent: "Descent" },
  de: { title: "Höhenprofil", altitude: "Höhe", distance: "Distanz", missing: "Die GPX-Datei enthält keine Höhendaten.", descent: "Abfahrt" },
};

const SLOPE_COLORS: { min: number; color: string; label: string }[] = [
  { min: -Infinity, color: "#38bdf8", label: "" },
  { min: -2, color: "#22c55e", label: "<2%" },
  { min: 2, color: "#eab308", label: "2–5%" },
  { min: 5, color: "#f97316", label: "5–8%" },
  { min: 8, color: "#ef4444", label: ">8%" },
];

function slopeColor(slope: number): string {
  let c = SLOPE_COLORS[0].color;
  for (const band of SLOPE_COLORS) if (slope >= band.min) c = band.color;
  return c;
}

export function GpxElevationChart({ points, xml, onHover }: { points: TrackPoint[]; xml?: string | null; onHover?: (p: { lat: number; lon: number } | null) => void }) {
  const [originalPoints, setOriginalPoints] = useState<TrackPoint[] | null>(null);
  useEffect(() => {
    setOriginalPoints(xml ? parseGpx(xml).points : null);
  }, [xml]);
  const data = useMemo(() => elevationProfile(originalPoints?.length ? originalPoints : points), [originalPoints, points]);
  const text = labels[activeLang()];
  const hasElevation = data.some((point) => point.elevation !== null);
  const gradientId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const gradientStops = useMemo(() => {
    const maxKm = data[data.length - 1]?.km ?? 0;
    if (!hasElevation || maxKm <= 0) return null;
    const slopeAt = (i: number) => {
      let a = i, b = i;
      while (a > 0 && data[i].km - data[a].km < 0.125) a--;
      while (b < data.length - 1 && data[b].km - data[i].km < 0.125) b++;
      const dKm = data[b].km - data[a].km;
      return dKm > 0 ? (((data[b].elevation ?? 0) - (data[a].elevation ?? 0)) / (dKm * 1000)) * 100 : 0;
    };
    const stops: { offset: number; color: string }[] = [{ offset: 0, color: slopeColor(slopeAt(0)) }];
    let prev = slopeColor(slopeAt(0));
    for (let i = 1; i < data.length; i++) {
      const c = slopeColor(slopeAt(i));
      if (c !== prev) {
        const off = Math.min(1, data[i].km / maxKm);
        stops.push({ offset: off, color: prev }, { offset: off, color: c });
        prev = c;
      }
    }
    stops.push({ offset: 1, color: prev });
    return stops;
  }, [data, hasElevation]);
  if (data.length < 2) return null;

  return (
    <section className="min-w-0 space-y-3" aria-label={text.title}>
      <h3 className="flex items-center gap-2 text-sm font-semibold"><Mountain className="size-4 text-primary" />{text.title}</h3>
      {hasElevation ? (<>
        <div className="h-56 w-full min-w-0 text-muted-foreground">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 12, left: 0 }} accessibilityLayer onMouseMove={(st: any) => { const p = data[st?.activeTooltipIndex as number]; onHover?.(p ? { lat: p.lat, lon: p.lon } : null); }} onMouseLeave={() => onHover?.(null)}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="km" type="number" domain={[0, "dataMax"]} tickFormatter={(value: number) => `${Number(value.toFixed(1))}`} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} stroke="var(--border)" label={{ value: "km", position: "insideBottomRight", offset: -8, fill: "var(--muted-foreground)", fontSize: 11 }} />
              <YAxis domain={["dataMin - 10", "dataMax + 10"]} tickFormatter={(value: number) => `${Math.round(value)} m`} width={62} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} stroke="var(--border)" />
              <Tooltip content={({ active, payload }) => {
                const point = payload?.[0]?.payload as { km: number; elevation: number | null } | undefined;
                if (!active || !point || point.elevation === null) return null;
                return <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-sm"><p>{text.distance}: {point.km.toFixed(2)} km</p><p className="font-semibold">{text.altitude}: {Math.round(point.elevation)} m</p></div>;
              }} />
              {gradientStops && (
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
                    {gradientStops.map((s, i) => <stop key={i} offset={s.offset} stopColor={s.color} />)}
                  </linearGradient>
                </defs>
              )}
              <Area type="linear" dataKey="elevation" name={text.altitude} stroke={gradientStops ? `url(#${gradientId})` : "var(--primary)"} fill={gradientStops ? `url(#${gradientId})` : "var(--primary)"} fillOpacity={0.18} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {SLOPE_COLORS.map((band) => (
            <span key={band.color} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ background: band.color }} />
              {band.label || text.descent}
            </span>
          ))}
        </div></>) : <p className="text-sm text-muted-foreground">{text.missing}</p>}
    </section>
  );
}