import { tr, activeLang } from "@/lib/i18n";import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { intervalsActivityDetail } from "@/lib/intervals.functions";
import {
  downsample, meanMaxCurve, powerZoneDistribution, hrZoneDistribution,
  detectIntervals, extractPlannedIntervals, complianceScore, normalizedPower,
  formatDuration, type Streams } from
"@/lib/activity-analysis";
import { useEffect, useMemo, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell } from
"recharts";
import { ArrowLeft, ExternalLink, Activity, Zap, Heart, Gauge, Target, CheckCircle2, XCircle } from "lucide-react";
import { format } from "date-fns";
import { es, ca, fr, enGB, de } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/actividades/$id")({
  component: ActivityDetailPage
});

function ActivityDetailPage() {
  const { id } = Route.useParams();
  const { user } = useAuth();
  const fetchDetail = useServerFn(intervalsActivityDetail);

  const profile = useQuery({
    queryKey: ["profile-metrics", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("ftp,age").eq("id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user
  });

  const detail = useQuery({
    queryKey: ["icu-detail", id],
    queryFn: () => fetchDetail({ data: { id } }),
    staleTime: 30 * 60 * 1000
  });

  const actRow = useQuery({
    queryKey: ["icu-row", id],
    queryFn: async () => {
      const { data } = await supabase.from("intervals_activities").select("*").eq("id", String(id)).maybeSingle();
      return data;
    }
  });

  // Busca workout planificado cercano en fecha (±1 día)
  const startDate = detail.data?.activity?.start_date ?? actRow.data?.start_date;
  const planned = useQuery({
    queryKey: ["planned-nearby", user?.id, startDate],
    queryFn: async () => {
      if (!startDate) return null;
      const day = new Date(startDate);
      const from = new Date(day);from.setDate(from.getDate() - 1);
      const to = new Date(day);to.setDate(to.getDate() + 1);
      const { data } = await supabase.from("workouts").select("*").
      eq("user_id", user!.id).
      gte("created_at", from.toISOString()).
      lte("created_at", to.toISOString()).
      order("created_at", { ascending: false }).
      limit(1);
      return data?.[0] ?? null;
    },
    enabled: !!user && !!startDate
  });

  const activity = detail.data?.activity;
  const streams = (detail.data?.streams ?? {}) as Streams;
  const ftp = profile.data?.ftp ?? 200;
  const hrMax = 220 - (profile.data?.age ?? 35);

  const watts = streams.watts?.data ?? [];
  const hr = streams.heartrate?.data ?? [];
  const cad = streams.cadence?.data ?? [];
  const time = streams.time?.data ?? [];
  const latlng = streams.latlng?.data ?? [];

  const chartData = useMemo(() => {
    const n = Math.min(time.length, 400);
    const idxs = downsample(time.map((_, i) => i), n);
    return idxs.map((i) => ({
      t: Math.round((time[i] ?? 0) / 60),
      watts: watts[i] ?? null,
      hr: hr[i] ?? null,
      cad: cad[i] ?? null
    }));
  }, [time, watts, hr, cad]);

  const mmp = useMemo(() => meanMaxCurve(watts).map((p) => ({
    label: formatDuration(p.seconds), watts: p.watts
  })), [watts]);

  const pZones = useMemo(() => powerZoneDistribution(watts, ftp), [watts, ftp]);
  const hrZones = useMemo(() => hrZoneDistribution(hr, hrMax), [hr, hrMax]);
  const np = useMemo(() => normalizedPower(watts), [watts]);
  const intervals = useMemo(() => detectIntervals(watts, time, ftp), [watts, time, ftp]);

  const plannedIntervals = useMemo(
    () => planned.data?.plan ? extractPlannedIntervals(planned.data.plan) : [],
    [planned.data]
  );
  const compliance = useMemo(
    () => complianceScore(plannedIntervals, intervals),
    [plannedIntervals, intervals]
  );

  if (detail.isLoading) {
    return <div className="text-sm text-muted-foreground">{tr("Cargando análisis…")}</div>;
  }
  if (detail.isError || !activity) {
    return (
      <div className="max-w-xl mx-auto text-center py-20">
        {(detail.error as any)?.message?.includes("NO_SOURCE") ?
        <p className="text-sm text-muted-foreground mb-4">{tr("Conecta Intervals.icu o Strava desde Ajustes para poder ver tus actividades.")} <Link to="/ajustes" className="text-primary underline">{tr("Ir a Ajustes")}</Link></p> :
        <p className="text-sm text-destructive mb-4">{tr("Error:")} {(detail.error as any)?.message ?? "Actividad no disponible"}</p>}
        <Link to="/actividades" className="text-primary text-sm underline">{tr("Volver")}</Link>
      </div>);

  }


  return (
    <div className="space-y-6">
      <div>
        <Link to="/actividades" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2">
          <ArrowLeft className="size-3" /> {tr("Actividades")} 
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">{activity.sport_type ?? activity.type}</p>
            <h1 className="font-display text-3xl md:text-4xl font-bold uppercase tracking-tight truncate">{activity.name}</h1>
            <p className="text-xs text-muted-foreground mt-1">
              {activity.start_date && format(new Date(activity.start_date), "EEEE d MMM yyyy · HH:mm", { locale: ({ es, ca, fr, en: enGB, de } as const)[activeLang()] })}
            </p>
          </div>
          <a href={`https://intervals.icu/activities/${activity.id}`} target="_blank" rel="noopener"
          className="inline-flex items-center gap-1 text-primary text-xs hover:opacity-80 shrink-0">
            Intervals.icu <ExternalLink className="size-3" />
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label={tr("Distancia")} value={`${((activity.distance ?? 0) / 1000).toFixed(1)} km`} />
        <Stat label={tr("Duración")} value={formatDuration(activity.moving_time ?? 0)} />
        <Stat label={tr("Desnivel")} value={`+${Math.round(activity.total_elevation_gain ?? 0)} m`} />
        <Stat label={tr("Potencia media")} value={activity.average_watts ? `${Math.round(activity.average_watts)} W` : "—"} />
        <Stat label={tr("NP")} value={np ? `${np} W` : "—"} />
      </div>

      {latlng.length > 0 && <RouteMap latlng={latlng} />}

      {watts.length > 0 &&
      <ChartCard icon={<Zap className="size-4" />} title={tr("Potencia")}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="t" tick={{ fontSize: 10 }} label={{ value: "min", position: "insideBottom", offset: -4, fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Line type="monotone" dataKey="watts" stroke="var(--primary)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      }

      {hr.length > 0 &&
      <ChartCard icon={<Heart className="size-4" />} title={tr("Frecuencia cardíaca")}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="t" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Line type="monotone" dataKey="hr" stroke="#ef4444" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      }

      {cad.length > 0 &&
      <ChartCard icon={<Gauge className="size-4" />} title={tr("Cadencia")}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="t" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Line type="monotone" dataKey="cad" stroke="#22c55e" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      }

      {mmp.length > 0 &&
      <ChartCard icon={<Activity className="size-4" />} title={tr("Curva de potencia (mean-max)")}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={mmp}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} label={{ value: "W", position: "insideLeft", fontSize: 10 }} />
              <Tooltip />
              <Line type="monotone" dataKey="watts" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      }

      <div className="grid md:grid-cols-2 gap-4">
        {watts.length > 0 &&
        <ZonesCard title={`Zonas de potencia (FTP ${ftp}W)`} zones={pZones} />
        }
        {hr.length > 0 &&
        <ZonesCard title={`Zonas FC (FCmax ${hrMax})`} zones={hrZones} />
        }
      </div>

      <div className="bg-surface border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Target className="size-4 text-primary" />
          <h2 className="font-display text-lg font-bold uppercase">{tr("Intervalos detectados")}</h2>
          <span className="text-xs text-muted-foreground ml-auto">
            {intervals.length} {tr("bloque")}{intervals.length === 1 ? "" : "s"} {tr("≥ 88% FTP · 30s")} 
          </span>
        </div>
        {intervals.length === 0 ?
        <p className="text-sm text-muted-foreground">{tr("No se detectaron intervalos claros por encima del 88% FTP.")}</p> :

        <div className="space-y-1.5">
            {intervals.map((iv, i) =>
          <div key={i} className="flex items-center justify-between text-sm border-b border-border/50 pb-1.5">
                <span className="font-mono text-xs text-muted-foreground">#{i + 1}</span>
                <span>{formatDuration(iv.duration)}</span>
                <span className="font-semibold text-primary">{iv.avgWatts} {tr("W")}</span>
                <span className="text-xs text-muted-foreground">{Math.round(iv.avgWatts / ftp * 100)}{tr("% FTP")}</span>
              </div>
          )}
          </div>
        }
      </div>

      {planned.data &&
      <div className="bg-surface border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="size-4 text-primary" />
            <h2 className="font-display text-lg font-bold uppercase">{tr("Planificado vs Realizado")}</h2>
            <span className="text-xs text-muted-foreground ml-auto">{tr("Plan:")} {(planned.data.plan as any)?.title ?? planned.data.training_type}</span>
          </div>
          {plannedIntervals.length === 0 ?
        <p className="text-sm text-muted-foreground">{tr("El plan encontrado no tiene intervalos de potencia comparables.")}</p> :

        <>
              <div className="flex items-baseline gap-3 mb-4">
                <span className="font-display text-4xl font-bold text-primary">{compliance.percent}%</span>
                <span className="text-sm text-muted-foreground">{tr("cumplimiento (")}{compliance.matched}/{compliance.total} {tr("intervalos)")}</span>
              </div>
              <div className="space-y-2">
                {compliance.details.map((d, i) =>
            <div key={i} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-border/50 pb-2 text-sm">
                    {d.ok ? <CheckCircle2 className="size-4 text-green-500" /> : <XCircle className="size-4 text-destructive" />}
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{d.planned.name}</p>
                      <p className="text-xs text-muted-foreground"> {tr("Objetivo:")} 
                  {formatDuration(d.planned.duration)} · {d.planned.targetLow}-{d.planned.targetHigh}{tr("W")} 
                </p>
                    </div>
                    <div className="text-right text-xs">
                      {d.detected ?
                <>
                          <p><span className="text-muted-foreground">{tr("Realizado:")}</span> {formatDuration(d.detected.duration)} · {d.detected.avgWatts}{tr("W")}</p>
                          <p className="text-muted-foreground">{tr("Dur")} {d.durationPct}{tr("% · W")} {d.wattsPct}%</p>
                        </> :
                <p className="text-muted-foreground">{tr("No detectado")}</p>}
                    </div>
                  </div>
            )}
              </div>
            </>
        }
        </div>
      }
    </div>);

}

function Stat({ label, value }: {label: string;value: string;}) {
  return (
    <div className="bg-surface border rounded-lg p-3">
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="font-display text-lg font-bold">{value}</p>
    </div>);

}

function ChartCard({ icon, title, children }: {icon: React.ReactNode;title: string;children: React.ReactNode;}) {
  return (
    <div className="bg-surface border rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h2 className="font-display text-lg font-bold uppercase">{title}</h2>
      </div>
      <div className="h-56">{children}</div>
    </div>);

}

function ZonesCard({ title, zones }: {title: string;zones: {name: string;color: string;seconds: number;percent: number;}[];}) {
  return (
    <div className="bg-surface border rounded-xl p-5">
      <h2 className="font-display text-sm font-bold uppercase mb-3">{title}</h2>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={zones}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} unit="%" />
            <Tooltip formatter={(v: any, _n, e: any) => [`${v}% (${formatDuration(e.payload.seconds)})`, "Tiempo"]} />
            <Bar dataKey="percent">
              {zones.map((z, i) => <Cell key={i} fill={z.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>);

}

function RouteMap({ latlng }: {latlng: [number, number][];}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  useEffect(() => {
    if (!ref.current || latlng.length === 0) return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !ref.current) return;
      if (!mapRef.current) {
        mapRef.current = L.map(ref.current, { scrollWheelZoom: false });
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(mapRef.current);
      }
      const map = mapRef.current;
      map.eachLayer((l: any) => {if (l instanceof L.Polyline || l instanceof L.Marker) map.removeLayer(l);});
      const pts = latlng.filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
      if (pts.length === 0) return;
      const line = L.polyline(pts, { color: "#e11d48", weight: 4 }).addTo(map);
      map.fitBounds(line.getBounds(), { padding: [20, 20] });
      requestAnimationFrame(() => map.invalidateSize());
      setTimeout(() => {map.invalidateSize();map.fitBounds(line.getBounds(), { padding: [20, 20] });}, 300);
    })();
    return () => {cancelled = true;};
  }, [latlng]);
  useEffect(() => () => {mapRef.current?.remove();mapRef.current = null;}, []);

  return (
    <div className="bg-surface border rounded-xl overflow-hidden">
      <div ref={ref} className="h-72 w-full" />
    </div>);

}
