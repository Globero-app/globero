import { tr, activeLang } from "@/lib/i18n";
import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/use-auth";
import { intervalsSyncActivities } from "@/lib/intervals.functions";
import { format } from "date-fns";
import { es, ca, fr, enGB, de } from "date-fns/locale";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { getWeeklyStats } from "@/lib/weekly-stats.functions";
import { getFtpTests } from "@/lib/ftp-tests.functions";
import { FtpHistoryChart } from "@/components/FtpHistoryChart";

const fmtWeek = (iso: string) => format(new Date(`${iso}T12:00:00Z`), "d MMM", { locale: ({ es, ca, fr, en: enGB, de } as const)[activeLang()] });

export function WeeklySummary() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fn = useServerFn(getWeeklyStats);
  const ftpFn = useServerFn(getFtpTests);
  const ftpQ = useQuery({
    queryKey: ["ftp-tests", user?.id],
    queryFn: () => ftpFn({ data: {} } as any),
    enabled: !!user,
    staleTime: 5 * 60_000
  });
  const sync = useServerFn(intervalsSyncActivities);
  const q = useQuery({
    queryKey: ["weekly-stats", user?.id],
    queryFn: () => fn({ data: {} } as any),
    enabled: !!user,
    staleTime: 60_000,
    refetchOnWindowFocus: true
  });

  // Trae las sesiones reales subidas desde el ciclocomputador antes de mostrar el resumen (máx. 1 vez cada 10 min)
  const syncedRef = useRef(false);
  useEffect(() => {
    if (!user || syncedRef.current) return;
    const key = `intervals:lastSync:${user.id}`;
    const last = Number(localStorage.getItem(key) ?? 0);
    if (Date.now() - last < 10 * 60 * 1000) return;
    syncedRef.current = true;
    localStorage.setItem(key, String(Date.now()));
    sync({ data: undefined } as any).
    then(() => {
      qc.invalidateQueries({ queryKey: ["weekly-stats"] });
      qc.invalidateQueries({ queryKey: ["intervals_activities"] });
    }).
    catch(() => {});
  }, [user, sync, qc]);
  const d: any = q.data;

  const chart = (d?.weeks ?? []).map((w: any) => ({ ...w, label: fmtWeek(w.week_start) }));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">{tr("Volumen")}</p>
        <h1 className="font-display text-2xl sm:text-3xl font-bold uppercase tracking-tight mt-1">{tr("Resumen semanal")}</h1>
      </div>

      {q.isLoading ?
      <Skeleton className="h-64 w-full rounded-xl" /> :
      !d ? null :
      <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi label={tr("Kilómetros")} value={d.current?.km ?? 0} unit="km" now={d.current?.km ?? 0} prev={d.previous?.km ?? null} avg={d.avg4?.km ?? null} />
            <Kpi label={tr("Horas")} value={d.current?.hours ?? 0} unit="h" now={d.current?.hours ?? 0} prev={d.previous?.hours ?? null} avg={d.avg4?.hours ?? null} />
            <Kpi label={tr("Vatios medios")} value={d.current?.avg_watts ?? "—"} unit="W" now={d.current?.avg_watts ?? null} prev={d.previous?.avg_watts ?? null} avg={d.avg4?.avg_watts ?? null} />
            <Kpi label={tr("Carga (TSS)")} value={d.current?.tss ?? 0} unit="" now={d.current?.tss ?? 0} prev={d.previous?.tss ?? null} avg={d.avg4?.tss ?? null} />
          </div>

          <section className="bg-surface border rounded-xl p-4 sm:p-5">
            <h2 className="font-display text-lg font-bold uppercase">{tr("Kilómetros y horas por semana")}</h2>
            <div className="h-56 mt-4 -ml-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="km" name="km" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="hours" name={tr("Horas")} fill="var(--muted-foreground)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="bg-surface border rounded-xl p-4 sm:p-5">
            <h2 className="font-display text-lg font-bold uppercase">{tr("Carga y vatios por semana")}</h2>
            <div className="h-56 mt-4 -ml-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="tss" name="TSS" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="avg_watts" name={tr("Vatios medios")} fill="var(--chart-4)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <FtpHistoryChart history={((ftpQ.data as any)?.items ?? []) as any} />

          <section className="bg-surface border rounded-xl p-4 sm:p-5">
            <h2 className="font-display text-lg font-bold uppercase">{tr("Detalle por semana")}</h2>
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-sm min-w-[520px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-muted-foreground text-left">
                    <th className="py-2 pr-3">{tr("Semana")}</th>
                    <th className="py-2 pr-3">{tr("Km")}</th>
                    <th className="py-2 pr-3">{tr("Horas")}</th>
                    <th className="py-2 pr-3">{tr("Vatios")}</th>
                    <th className="py-2 pr-3">{tr("Desnivel")}</th>
                    <th className="py-2 pr-3">TSS</th>
                    <th className="py-2">{tr("Salidas")}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...(d.weeks ?? [])].reverse().map((w: any) =>
                <tr key={w.week_start} className="border-t">
                      <td className="py-2 pr-3 font-mono text-xs">{fmtWeek(w.week_start)}</td>
                      <td className="py-2 pr-3">{w.km}</td>
                      <td className="py-2 pr-3">{w.hours}</td>
                      <td className="py-2 pr-3">{w.avg_watts ?? "—"}</td>
                      <td className="py-2 pr-3">{w.elevation_m} {tr("m")}</td>
                      <td className="py-2 pr-3">{w.tss}</td>
                      <td className="py-2">{w.activities}</td>
                    </tr>
                )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      }
    </div>);

}

function Kpi({ label, value, unit, now, prev, avg }: {label: string;value: number | string;unit: string;now: number | null;prev: number | null;avg: number | null;}) {
  return (
    <div className="bg-surface border rounded-xl p-4">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</p>
      <p className="font-display text-2xl sm:text-3xl font-bold mt-1">
        {value}
        {unit && <span className="text-sm ml-1">{unit}</span>}
      </p>
      <Delta now={now} prev={prev} text="vs semana anterior" />
      <Delta now={now} prev={avg} text="vs media 4 semanas" />
    </div>);

}

function Delta({ now, prev, text }: {now: number | null;prev: number | null;text: string;}) {
  if (now == null || prev == null || prev === 0) return <p className="text-[11px] text-muted-foreground">— {text}</p>;
  const pct = Math.round((now - prev) / prev * 100);
  const Icon = pct > 0 ? ArrowUpRight : pct < 0 ? ArrowDownRight : Minus;
  const color = pct > 0 ? "text-emerald-600" : pct < 0 ? "text-red-600" : "text-muted-foreground";
  return (
    <p className={`text-[11px] flex items-center gap-1 ${color}`}>
      <Icon className="size-3" />
      {pct > 0 ? "+" : ""}{pct}% <span className="text-muted-foreground">{text}</span>
    </p>);

}
