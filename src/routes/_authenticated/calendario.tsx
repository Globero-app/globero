import { tr } from "@/lib/i18n";import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCalendar, rescheduleWorkout, type CalendarEvent } from "@/lib/calendar.functions";
import { downloadIcs } from "@/lib/ics";
import {
  ChevronLeft, ChevronRight, CalendarDays, Download, Trophy, Dumbbell, Activity, CalendarRange } from
"lucide-react";
import { addDays, addMonths, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek, isToday } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/calendario")({
  head: () => ({
    meta: [
    { title: "Calendario — Globero" },
    { name: "description", content: "Calendario unificado: entrenamientos, competiciones y actividades reales de Intervals.icu." }]

  }),
  component: CalendarioPage
});

type ViewMode = "month" | "week";

const KIND_STYLES: Record<CalendarEvent["kind"], {bg: string;text: string;icon: typeof Trophy;label: string;}> = {
  competition: { bg: "bg-amber-500/15 border-amber-500/40", text: "text-amber-200", icon: Trophy, label: "Competición" },
  workout: { bg: "bg-sky-500/15 border-sky-500/40", text: "text-sky-200", icon: Dumbbell, label: "Entrenamiento" },
  activity: { bg: "bg-emerald-500/15 border-emerald-500/40", text: "text-emerald-200", icon: Activity, label: "Actividad" }
};

function CalendarioPage() {
  const qc = useQueryClient();
  const load = useServerFn(getCalendar);
  const reschedule = useServerFn(rescheduleWorkout);

  const [cursor, setCursor] = useState<Date>(new Date());
  const [view, setView] = useState<ViewMode>("month");
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const range = useMemo(() => {
    if (view === "month") {
      const monthStart = startOfMonth(cursor);
      const monthEnd = endOfMonth(cursor);
      return {
        gridStart: startOfWeek(monthStart, { weekStartsOn: 1 }),
        gridEnd: endOfWeek(monthEnd, { weekStartsOn: 1 })
      };
    }
    return {
      gridStart: startOfWeek(cursor, { weekStartsOn: 1 }),
      gridEnd: endOfWeek(cursor, { weekStartsOn: 1 })
    };
  }, [cursor, view]);

  const from = format(range.gridStart, "yyyy-MM-dd");
  const to = format(range.gridEnd, "yyyy-MM-dd");

  const q = useQuery({
    queryKey: ["calendar", from, to],
    queryFn: () => load({ data: { from, to } })
  });

  const mv = useMutation({
    mutationFn: (v: {workout_id: string;scheduled_date: string;}) => reschedule({ data: v }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["calendar"] });
      const key = ["calendar", from, to] as const;
      const prev = qc.getQueryData<CalendarEvent[]>(key);
      if (prev) {
        qc.setQueryData<CalendarEvent[]>(key, prev.map((e) =>
        e.kind === "workout" && (e.meta as any)?.workout_id === v.workout_id ?
        { ...e, date: v.scheduled_date } :
        e
        ));
      }
      return { prev, key };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
      toast.error(e.message);
    },
    onSuccess: (r: any) =>
    r?.synced ?
    toast.success(tr("Entrenamiento reprogramado y actualizado en Intervals.icu")) :
    toast.warning(tr("Entrenamiento reprogramado, pero no se pudo actualizar en Intervals.icu")),
    onSettled: () => qc.invalidateQueries({ queryKey: ["calendar"] })
  });

  const days: Date[] = useMemo(() => {
    const out: Date[] = [];
    let d = range.gridStart;
    while (d <= range.gridEnd) {
      out.push(d);
      d = addDays(d, 1);
    }
    return out;
  }, [range]);

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of q.data ?? []) {
      const arr = map.get(e.date) ?? [];
      arr.push(e);
      map.set(e.date, arr);
    }
    return map;
  }, [q.data]);

  const handleExport = () => {
    if (!q.data?.length) {toast.info(tr("No hay eventos en el rango"));return;}
    downloadIcs(`globero-${from}-${to}.ics`, q.data);
    toast.success(tr("Calendario exportado (.ics)"));
  };

  const title = view === "month" ?
  format(cursor, "LLLL yyyy", { locale: es }) :
  `${format(range.gridStart, "d MMM", { locale: es })} – ${format(range.gridEnd, "d MMM yyyy", { locale: es })}`;

  const shift = (dir: -1 | 1) => setCursor((c) => view === "month" ? addMonths(c, dir) : addDays(c, dir * 7));

  return (
    <>
      <div className="p-4 md:p-6 space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-display font-semibold flex items-center gap-2">
              <CalendarRange className="size-6 text-primary" /> {tr("Calendario unificado")} 

            </h1>
            <p className="text-sm text-muted-foreground capitalize">{title}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setView("month")}
                className={`px-3 py-1.5 text-xs font-medium ${view === "month" ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}> {tr("Mes")}
              </button>
              <button
                onClick={() => setView("week")}
                className={`px-3 py-1.5 text-xs font-medium ${view === "week" ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}>{tr("Semana")}
              </button>
            </div>
            <button onClick={() => shift(-1)} className="p-2 rounded-md border border-border hover:bg-secondary" aria-label={tr("Anterior")}>
              <ChevronLeft className="size-4" />
            </button>
            <button onClick={() => setCursor(new Date())} className="px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-secondary flex items-center gap-1">
              <CalendarDays className="size-3.5" /> {tr("Hoy")} 
            </button>
            <button onClick={() => shift(1)} className="p-2 rounded-md border border-border hover:bg-secondary" aria-label={tr("Siguiente")}>
              <ChevronRight className="size-4" />
            </button>
            <button onClick={handleExport} className="ml-1 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90">
              <Download className="size-3.5" /> {tr("iCal")} 
            </button>
          </div>
        </header>

        {/* Leyenda */}
        <div className="flex flex-wrap gap-3 text-xs">
          {(Object.entries(KIND_STYLES) as [CalendarEvent["kind"], typeof KIND_STYLES[CalendarEvent["kind"]]][]).map(([k, s]) =>
          <span key={k} className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border ${s.bg} ${s.text}`}>
              <s.icon className="size-3" /> {s.label}
            </span>
          )}
          <span className="text-muted-foreground self-center">{tr("Arrastra un entrenamiento a otro día para reprogramarlo.")}</span>
        </div>

        {/* Grid */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="grid grid-cols-7 text-xs font-medium text-muted-foreground border-b border-border">
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) =>
            <div key={d} className="px-2 py-2 text-center">{d}</div>
            )}
          </div>
          {q.isLoading ?
          <div className="p-4 grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
            </div> :

          <div className={`grid grid-cols-7 ${view === "week" ? "auto-rows-[minmax(180px,1fr)]" : "auto-rows-[minmax(110px,1fr)]"}`}>
              {days.map((day) => {
              const key = format(day, "yyyy-MM-dd");
              const inMonth = view === "week" || isSameMonth(day, cursor);
              const dayEvents = byDate.get(key) ?? [];
              const isDragTarget = dragOverKey === key;
              return (
                <div
                  key={key}
                  onDragOver={(e) => {e.preventDefault();setDragOverKey(key);}}
                  onDragLeave={() => setDragOverKey((k) => k === key ? null : k)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverKey(null);
                    const workoutId = e.dataTransfer.getData("text/workout-id");
                    const originDate = e.dataTransfer.getData("text/origin-date");
                    if (workoutId && originDate !== key) {
                      mv.mutate({ workout_id: workoutId, scheduled_date: key });
                    }
                  }}
                  className={`border-b border-r border-border p-1.5 flex flex-col gap-1 min-w-0 ${
                  inMonth ? "bg-background" : "bg-muted/30"} ${
                  isDragTarget ? "ring-2 ring-primary ring-inset" : ""}`}>
                  
                    <div className={`flex items-center justify-between text-[11px] ${inMonth ? "" : "text-muted-foreground"}`}>
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${isToday(day) ? "bg-primary text-primary-foreground font-semibold" : ""}`}>
                        {format(day, "d")}
                      </span>
                      {dayEvents.length > 0 && <span className="text-muted-foreground">{dayEvents.length}</span>}
                    </div>
                    <div className="flex flex-col gap-1 overflow-hidden">
                      {dayEvents.slice(0, view === "week" ? 20 : 3).map((e) => {
                      const s = KIND_STYLES[e.kind];
                      const draggable = e.kind === "workout";
                      return (
                        <button
                          key={e.id}
                          draggable={draggable}
                          onDragStart={(ev) => {
                            if (!draggable) return;
                            ev.dataTransfer.setData("text/workout-id", String((e.meta as any)?.workout_id ?? ""));
                            ev.dataTransfer.setData("text/origin-date", e.date);
                            ev.dataTransfer.effectAllowed = "move";
                          }}
                          onClick={() => setSelected(e)}
                          className={`text-left text-[11px] leading-tight px-1.5 py-1 rounded border ${s.bg} ${s.text} truncate hover:brightness-125 ${draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
                          title={e.title}>
                          
                            <span className="inline-flex items-center gap-1">
                              <s.icon className="size-2.5 shrink-0" />
                              <span className="truncate">{e.title}</span>
                            </span>
                          </button>);

                    })}
                      {view === "month" && dayEvents.length > 3 &&
                    <span className="text-[10px] text-muted-foreground px-1">+{dayEvents.length - 3} {tr("más")}</span>
                    }
                    </div>
                  </div>);

            })}
            </div>
          }
        </div>
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          {selected &&
          <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {(() => {const I = KIND_STYLES[selected.kind].icon;return <I className="size-4" />;})()}
                  {selected.title}
                </DialogTitle>
                <DialogDescription>
                  {KIND_STYLES[selected.kind].label} · {format(new Date(selected.date + "T00:00:00"), "EEEE d MMMM yyyy", { locale: es })}
                </DialogDescription>
              </DialogHeader>
              {selected.subtitle && <p className="text-sm text-muted-foreground">{selected.subtitle}</p>}
              {selected.status && <p className="text-xs mt-2">{tr("Estado:")} <span className="font-medium">{selected.status}</span></p>}
              <div className="flex justify-end gap-2 mt-4">
                <button
                onClick={() => downloadIcs(`${selected.title}.ics`, [selected])}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-secondary">
                
                  <Download className="size-3.5" /> {tr("Exportar .ics")} 
              </button>
              </div>
            </>
          }
        </DialogContent>
      </Dialog>
    </>);

}
