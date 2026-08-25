import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getProgress, getThresholdStatus } from "@/lib/progress.functions";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, Zap, Mountain, Route as RouteIcon } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  BarChart, Bar,
} from "recharts";
import { ThresholdCard } from "@/components/ThresholdCard";

export const Route = createFileRoute("/_authenticated/progreso")({
  component: ProgresoPage,
  head: () => ({
    meta: [
      { title: "Progreso · CTL, TSB y PRs de potencia" },
      { name: "description", content: "Evolución de tu forma: fitness (CTL), fatiga (ATL), frescura (TSB), carga semanal y récords de potencia del último año." },
      { property: "og:title", content: "Progreso del ciclista · CTL, TSB y PRs" },
      { property: "og:description", content: "Sigue la evolución de tu entrenamiento con curvas de carga y tus mejores potencias." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ProgresoPage() {
  const getProg = useServerFn(getProgress);
  const getTh = useServerFn(getThresholdStatus);

  const q = useQuery({ queryKey: ["progress"], queryFn: () => getProg({ data: {} } as any), staleTime: 5 * 60_000 });
  const th = useQuery({ queryKey: ["threshold-status"], queryFn: () => getTh({ data: {} } as any), staleTime: 10 * 60_000 });

  const d: any = q.data;

  const chartData = (d?.series ?? []).map((p: any) => ({
    ...p,
    label: format(new Date(`${p.date}T12:00:00Z`), "d MMM", { locale: es }),
  }));

  const weeklyData = (d?.weekly ?? []).map((w: any) => ({
    ...w,
    label: format(new Date(`${w.week_start}T12:00:00Z`), "d MMM", { locale: es }),
  }));

  const ctlDelta = d?.ctl_30d_ago != null ? Math.round((d.current.ctl - d.ctl_30d_ago) * 10) / 10 : null;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">Evolución</p>
        <h1 className="font-display text-3xl font-bold uppercase tracking-tight mt-1">Progreso</h1>
      </div>

      {th.data && <ThresholdCard status={th.data as any} />}

      {q.isLoading ? (
        <Skeleton className="h-72 w-full rounded-xl" />
      ) : !d ? null : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label="Fitness (CTL)" value={Math.round(d.current.ctl)} sub={ctlDelta != null ? `${ctlDelta >= 0 ? "+" : ""}${ctlDelta} en 30 días` : "42 días"} />
            <Kpi label="Fatiga (ATL)" value={Math.round(d.current.atl)} sub="7 días" />
            <Kpi label="Forma (TSB)" value={Math.round(d.current.tsb)} sub={tsbLabel(d.current.tsb)} />
            <Kpi label="Actividades" value={d.records.activities_12m} sub="últimos 12 meses" />
          </div>

          <section className="bg-surface border rounded-xl p-5">
            <h2 className="font-display text-lg font-bold uppercase flex items-center gap-2">
              <TrendingUp className="size-4 text-primary" /> Curva de forma (últimos 6 meses)
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              CTL = fitness acumulado · ATL = fatiga reciente · TSB = frescura (CTL − ATL). Por encima de +5 llegas fresco; por debajo de −25 estás muy cargado.
            </p>
            <div className="h-72 mt-4 -ml-4">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={Math.max(1, Math.floor(chartData.length / 8))} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="tsb" name="Forma (TSB)" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.15} />
                  <Line type="monotone" dataKey="ctl" name="Fitness (CTL)" stroke="#22c55e" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="atl" name="Fatiga (ATL)" stroke="#ef4444" dot={false} strokeWidth={1.5} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="bg-surface border rounded-xl p-5">
            <h2 className="font-display text-lg font-bold uppercase">Carga semanal (TSS)</h2>
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
            <h2 className="font-display text-lg font-bold uppercase">Prescrito vs ejecutado</h2>
            <p className="text-xs text-muted-foreground mt-1">
              TSS planificado frente al realmente ejecutado y % de sesiones completadas por semana.
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
                  <Bar dataKey="planned_tss" name="TSS previsto" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actual_tss" name="TSS ejecutado" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="r" type="monotone" dataKey="compliance" name="Cumplimiento %" stroke="#22c55e" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="bg-surface border rounded-xl p-5">
            <h2 className="font-display text-lg font-bold uppercase">Tiempo en zonas (8 semanas)</h2>
            <div className="h-56 mt-4 -ml-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.zones ?? []}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="zone" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: any, _n, p: any) => [`${v} min (${p?.payload?.pct ?? 0}%)`, "Tiempo"]} />
                  <Bar dataKey="minutes" name="Minutos" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          {readinessData.length > 0 && (
            <section className="bg-surface border rounded-xl p-5">
              <h2 className="font-display text-lg font-bold uppercase">Readiness medio semanal</h2>
              <div className="h-48 mt-4 -ml-4">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={readinessData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis domain={[1, 5]} tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Line type="monotone" dataKey="score" name="Readiness" stroke="#0ea5e9" strokeWidth={2} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}


          <section className="bg-surface border rounded-xl p-5">
            <h2 className="font-display text-lg font-bold uppercase flex items-center gap-2">
              <Zap className="size-4 text-primary" /> Récords de potencia (12 meses)
            </h2>
            {d.prs.length === 0 ? (
              <p className="text-sm text-muted-foreground mt-2">
                Sin datos de potencia en tus actividades. Sincroniza Strava con un medidor de potencia para ver tus PRs.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mt-4">
                {d.prs.map((p: any) => (
                  <div key={p.key} className="rounded-lg border bg-secondary/30 p-4">
                    <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{p.label}</p>
                    <p className="font-display text-3xl font-bold">{p.watts}<span className="text-base ml-1">W</span></p>
                    {p.wkg && <p className="text-xs text-primary font-mono">{p.wkg} W/kg</p>}
                    <p className="text-[11px] text-muted-foreground mt-1 truncate">{p.activity}</p>
                    <p className="text-[10px] font-mono text-muted-foreground">{p.date}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2 mt-4">
              {d.records.longest_km != null && (
                <div className="flex items-center gap-3 rounded-lg border p-3">
                  <RouteIcon className="size-4 text-primary" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{d.records.longest_km} km</p>
                    <p className="text-[11px] text-muted-foreground truncate">Salida más larga · {d.records.longest_name}</p>
                  </div>
                </div>
              )}
              {d.records.elevation_m != null && (
                <div className="flex items-center gap-3 rounded-lg border p-3">
                  <Mountain className="size-4 text-primary" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{d.records.elevation_m} m</p>
                    <p className="text-[11px] text-muted-foreground truncate">Más desnivel · {d.records.elevation_name}</p>
                  </div>
                </div>
              )}
            </div>
          </section>

          <p className="text-xs text-muted-foreground">
            ¿Quieres ajustar la sesión de hoy? Hazlo desde el <Link to="/" className="text-primary hover:underline">panel</Link>.
          </p>
        </>
      )}
    </div>
  );
}

function tsbLabel(tsb: number) {
  return tsb > 10 ? "Fresco" : tsb > -10 ? "Equilibrado" : tsb > -25 ? "Cargado" : "Muy fatigado";
}

function Kpi({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="bg-surface border rounded-xl p-4">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</p>
      <p className="font-display text-3xl font-bold mt-1">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
