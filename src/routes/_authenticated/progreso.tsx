import { tr, activeLang } from "@/lib/i18n";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getProgress, getThresholdStatus, getPowerCurve } from "@/lib/progress.functions";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Zap, Mountain, Route as RouteIcon } from "lucide-react";
import { format } from "date-fns";
import { es, ca, fr, enGB, de } from "date-fns/locale";
import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceArea, ReferenceLine,
  BarChart, Bar } from
"recharts";
import { ThresholdCard } from "@/components/ThresholdCard";
import { FtpHistoryChart } from "@/components/FtpHistoryChart";

export const Route = createFileRoute("/_authenticated/progreso")({
  component: ProgresoPage,
  head: () => ({
    meta: [
    { title: "Progreso · CTL, TSB y curva de potencia" },
    { name: "description", content: "Evolución de tu forma: fitness (CTL), fatiga (ATL), frescura (TSB), carga semanal y curva mean-max de potencia del último año." },
    { property: "og:title", content: "Progreso del ciclista · CTL, TSB y potencia" },
    { property: "og:description", content: "Sigue la evolución de tu entrenamiento con curvas de carga y tu curva de potencia." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" }]

  })
});

function ProgresoPage() {
  const getProg = useServerFn(getProgress);
  const getTh = useServerFn(getThresholdStatus);
  const getCurve = useServerFn(getPowerCurve);

  const q = useQuery({ queryKey: ["progress"], queryFn: () => getProg({ data: {} } as any), staleTime: 5 * 60_000 });
  const th = useQuery({ queryKey: ["threshold-status"], queryFn: () => getTh({ data: {} } as any), staleTime: 10 * 60_000 });
  const curve = useQuery({ queryKey: ["power-curve"], queryFn: () => getCurve({ data: {} } as any), staleTime: 10 * 60_000 });

  const d: any = q.data;

  const chartData = (d?.series ?? []).map((p: any) => ({
    ...p,
    label: format(new Date(`${p.date}T12:00:00Z`), "d MMM", { locale: ({ es, ca, fr, en: enGB, de } as const)[activeLang()] }),
    ctlReal: p.projected ? null : p.ctl,
    atlReal: p.projected ? null : p.atl,
    tsbReal: p.projected ? null : p.tsb,
    ctlProjected: p.projected || p.date === d?.projection_start ? p.ctl : null,
    atlProjected: p.projected || p.date === d?.projection_start ? p.atl : null,
    tsbProjected: p.projected || p.date === d?.projection_start ? p.tsb : null
  }));
  const projectionStartLabel = d?.projection_start ?
  format(new Date(`${d.projection_start}T12:00:00Z`), "d MMM", { locale: ({ es, ca, fr, en: enGB, de } as const)[activeLang()] }) :
  undefined;
  const projectionEndLabel = d?.projection_end ?
  format(new Date(`${d.projection_end}T12:00:00Z`), "d MMM", { locale: ({ es, ca, fr, en: enGB, de } as const)[activeLang()] }) :
  undefined;

  const weeklyData = (d?.weekly ?? []).map((w: any) => ({
    ...w,
    label: format(new Date(`${w.week_start}T12:00:00Z`), "d MMM", { locale: ({ es, ca, fr, en: enGB, de } as const)[activeLang()] })
  }));

  const adherenceData = (d?.adherence ?? []).map((w: any) => ({
    ...w,
    label: format(new Date(`${w.week_start}T12:00:00Z`), "d MMM", { locale: ({ es, ca, fr, en: enGB, de } as const)[activeLang()] })
  }));

  const readinessData = (d?.readiness_weekly ?? []).map((w: any) => ({
    ...w,
    label: format(new Date(`${w.week_start}T12:00:00Z`), "d MMM", { locale: ({ es, ca, fr, en: enGB, de } as const)[activeLang()] })
  }));


  const ctlDelta = d?.ctl_30d_ago != null ? Math.round((d.current.ctl - d.ctl_30d_ago) * 10) / 10 : null;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">{tr("Evolución")}</p>
        <h1 className="font-display text-3xl font-bold uppercase tracking-tight mt-1">{tr("Progreso")}</h1>
      </div>

      {th.data && <ThresholdCard status={th.data as any} />}

      {q.isLoading ?
      <Skeleton className="h-72 w-full rounded-xl" /> :
      !d ? null :
      <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label={tr("Fitness (CTL)")} value={Math.round(d.current.ctl)} sub={ctlDelta != null ? `${ctlDelta >= 0 ? "+" : ""}${ctlDelta} ${tr("en 30 días")}` : tr("42 días")} />
            <Kpi label={tr("Fatiga (ATL)")} value={Math.round(d.current.atl)} sub={tr("7 días")} />
            <Kpi label={tr("Forma (TSB)")} value={Math.round(d.current.tsb)} sub={tsbLabel(d.current.tsb)} />
            <Kpi label={tr("Actividades")} value={d.records.activities_12m} sub={tr("últimos 12 meses")} />
          </div>

          <section className="bg-surface border rounded-xl p-4 sm:p-5">
            <h2 className="font-display text-lg font-bold uppercase flex items-center gap-2">
              <TrendingUp className="size-4 text-primary" /> {tr("PMC · Gestión del rendimiento")}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {tr("Histórico de 6 meses y proyección de 6 semanas según tus entrenamientos planificados. La zona sombreada es la previsión.")}
            </p>
            <div className="h-80 mt-4 -ml-5 sm:-ml-4">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={Math.max(1, Math.floor(chartData.length / 8))} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  labelFormatter={(_label, payload) => {
                    const point = payload?.[0]?.payload;
                    return point ? `${format(new Date(`${point.date}T12:00:00Z`), "d MMMM", { locale: ({ es, ca, fr, en: enGB, de } as const)[activeLang()] })}${point.projected ? ` · ${tr("Proyección")}` : ""}` : "";
                  }}
                  formatter={(value: any, name: any, item: any) => {
                    const labels: Record<string, string> = { ctlReal: tr("Fitness (CTL)"), atlReal: tr("Fatiga (ATL)"), tsbReal: tr("Forma (TSB)"), ctlProjected: tr("Fitness (CTL)"), atlProjected: tr("Fatiga (ATL)"), tsbProjected: tr("Forma (TSB)") };
                    return [value, labels[item?.dataKey] ?? name];
                  }} />
                
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceArea x1={projectionStartLabel} x2={projectionEndLabel} fill="var(--muted)" fillOpacity={0.45} ifOverflow="extendDomain" />
                  <ReferenceLine x={projectionStartLabel} stroke="var(--foreground)" strokeDasharray="3 3" label={{ value: tr("Hoy"), position: "insideTopRight", fontSize: 10, fill: "var(--muted-foreground)" }} />
                  <ReferenceLine y={0} stroke="var(--border)" />
                  <Line type="monotone" dataKey="ctlReal" name={tr("Fitness (CTL)")} stroke="var(--chart-2)" dot={false} strokeWidth={2.25} connectNulls={false} />
                  <Line type="monotone" dataKey="atlReal" name={tr("Fatiga (ATL)")} stroke="var(--destructive)" dot={false} strokeWidth={1.75} connectNulls={false} />
                  <Line type="monotone" dataKey="tsbReal" name={tr("Forma (TSB)")} stroke="var(--chart-3)" dot={false} strokeWidth={1.75} connectNulls={false} />
                  <Line type="monotone" dataKey="ctlProjected" name={tr("Fitness proyectado")} stroke="var(--chart-2)" strokeDasharray="6 4" dot={false} strokeWidth={2.25} connectNulls={false} legendType="none" />
                  <Line type="monotone" dataKey="atlProjected" name={tr("Fatiga proyectada")} stroke="var(--destructive)" strokeDasharray="6 4" dot={false} strokeWidth={1.75} connectNulls={false} legendType="none" />
                  <Line type="monotone" dataKey="tsbProjected" name={tr("Forma proyectada")} stroke="var(--chart-3)" strokeDasharray="6 4" dot={false} strokeWidth={1.75} connectNulls={false} legendType="none" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              {tr("CTL = fitness acumulado (42 días) · ATL = fatiga reciente (7 días) · TSB = forma (CTL − ATL).")}
            </p>
          </section>

          <FtpHistoryChart history={d.ftp_history ?? []} weightKg={d.weight_kg ?? null} />

          <section className="bg-surface border rounded-xl p-5">
            <h2 className="font-display text-lg font-bold uppercase">{tr("Carga semanal (TSS)")}</h2>
            <div className="h-56 mt-4 -ml-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="tss" name="TSS" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="bg-surface border rounded-xl p-5">
            <h2 className="font-display text-lg font-bold uppercase">{tr("Prescrito vs ejecutado")}</h2>
            <p className="text-xs text-muted-foreground mt-1">
              {tr("TSS planificado frente al realmente ejecutado y % de sesiones completadas por semana.")}
            </p>
            <div className="h-56 mt-4 -ml-4">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={adherenceData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="r" orientation="right" domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="planned_tss" name={tr("TSS previsto")} fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actual_tss" name={tr("TSS ejecutado")} fill="var(--primary)" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="r" type="monotone" dataKey="compliance" name={tr("Cumplimiento %")} stroke="#22c55e" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="bg-surface border rounded-xl p-5">
            <h2 className="font-display text-lg font-bold uppercase">{tr("Tiempo en zonas (8 semanas)")}</h2>
            <div className="h-56 mt-4 -ml-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.zones ?? []}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="zone" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: any, _n, p: any) => [`${v} min (${p?.payload?.pct ?? 0}%)`, tr("Tiempo")]} />
                  <Bar dataKey="minutes" name={tr("Minutos")} fill="var(--primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {readinessData.length > 0 &&
        <section className="bg-surface border rounded-xl p-5">
              <h2 className="font-display text-lg font-bold uppercase">{tr("Readiness medio semanal")}</h2>
              <div className="h-48 mt-4 -ml-4">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={readinessData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis domain={[1, 5]} tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Line type="monotone" dataKey="score" name={tr("Readiness")} stroke="var(--chart-4)" strokeWidth={2} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </section>
        }

          <section className="bg-surface border rounded-xl p-5">
            <h2 className="font-display text-lg font-bold uppercase flex items-center gap-2">
              <Zap className="size-4 text-primary" /> {tr("Curva de potencia (mean-max, 12 meses)")}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {tr("Mejor potencia media sostenida por cada duración. Se calcula a partir de los streams de Intervals.icu tras sincronizar.")}
            </p>
            {curve.isLoading ?
          <Skeleton className="h-56 w-full mt-4" /> :
          (curve.data ?? []).length === 0 ?
          <p className="text-sm text-muted-foreground mt-4">
                {tr("Aún no hay picos de potencia calculados. Sincroniza Intervals.icu y se generarán automáticamente para actividades con potenciómetro.")}
              </p> :

          <div className="h-56 mt-4 -ml-4">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={curve.data as any[]}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} label={{ value: "W", angle: -90, position: "insideLeft", fontSize: 10 }} />
                    <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  formatter={(v: any, _n, p: any) => [`${v} W${p?.payload?.wkg ? ` (${p.payload.wkg} W/kg)` : ""}`, tr("Potencia")]}
                  labelFormatter={(_: any, p: any) => p?.[0]?.payload?.label ?? ""} />
                
                    <Line type="monotone" dataKey="watts" name={tr("Potencia media")} stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
          }
          </section>

          <section className="bg-surface border rounded-xl p-5">
            <h2 className="font-display text-lg font-bold uppercase flex items-center gap-2">
              <Zap className="size-4 text-primary" /> {tr("Récords de potencia (12 meses)")}
            </h2>
            {d.prs.length === 0 ?
          <p className="text-sm text-muted-foreground mt-2">
                {tr("Sin datos de potencia en tus actividades. Sincroniza Intervals.icu con un medidor de potencia para ver tus PRs.")}
              </p> :

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mt-4">
                {d.prs.map((p: any) =>
            <div key={p.key} className="rounded-lg border bg-secondary/30 p-4">
                    <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{p.label}</p>
                    <p className="font-display text-3xl font-bold">{p.watts}<span className="text-base ml-1">{tr("W")}</span></p>
                    {p.wkg && <p className="text-xs text-primary font-mono">{p.wkg} {tr("W/kg")}</p>}
                    <p className="text-[11px] text-muted-foreground mt-1 truncate">{p.activity}</p>
                    <p className="text-[10px] font-mono text-muted-foreground">{p.date}</p>
                  </div>
            )}
              </div>
          }
            <div className="grid gap-3 sm:grid-cols-2 mt-4">
              {d.records.longest_km != null &&
            <div className="flex items-center gap-3 rounded-lg border p-3">
                  <RouteIcon className="size-4 text-primary" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{d.records.longest_km} {tr("km")}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{tr("Salida más larga ·")} {d.records.longest_name}</p>
                  </div>
                </div>
            }
              {d.records.elevation_m != null &&
            <div className="flex items-center gap-3 rounded-lg border p-3">
                  <Mountain className="size-4 text-primary" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{d.records.elevation_m} {tr("m")}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{tr("Más desnivel ·")} {d.records.elevation_name}</p>
                  </div>
                </div>
            }
            </div>
          </section>

          <p className="text-xs text-muted-foreground">
            {tr("¿Quieres ajustar la sesión de hoy? Hazlo desde el")} <Link to="/app" className="text-primary hover:underline">{tr("panel")}</Link>.
          </p>
        </>
      }
    </div>);

}

function tsbLabel(tsb: number) {
  return tsb > 10 ? tr("Fresco") : tsb > -10 ? tr("Equilibrado") : tsb > -25 ? tr("Cargado") : tr("Muy fatigado");
}

function Kpi({ label, value, sub }: {label: string;value: number | string;sub?: string;}) {
  return (
    <div className="bg-surface border rounded-xl p-4">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</p>
      <p className="font-display text-3xl font-bold mt-1">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>);

}
