import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getTodayWorkout, adjustTodayWorkout } from "@/lib/adjust.functions";
import { SlidersHorizontal, Loader2, Timer, Gauge } from "lucide-react";
import { toast } from "sonner";

/** Módulo rápido del panel: recalcula la sesión de hoy (menos tiempo / más suave). */
export function AdjustTodayCard() {
  const getToday = useServerFn(getTodayWorkout);
  const adjust = useServerFn(adjustTodayWorkout);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [easier, setEasier] = useState(false);
  const [busy, setBusy] = useState(false);

  const q = useQuery({
    queryKey: ["today-workout"],
    queryFn: () => getToday({ data: {} } as any),
    staleTime: 60_000,
  });

  const w: any = q.data;
  if (q.isLoading || !w) return null;

  const base = Number(w.duration_minutes) || 60;
  const options = [30, 45, 60, 90].filter((m) => m < base);

  const run = async () => {
    if (!minutes && !easier) { toast.error("Elige menos tiempo o marcar 'voy más suave'"); return; }
    setBusy(true);
    try {
      const r: any = await adjust({ data: { minutes, easier } });
      toast.success(
        `Sesión ajustada: ${r.minutes} min · ${r.tss} TSS${r.intervals_synced ? " · actualizada en Intervals.icu" : ""}`,
      );
      setOpen(false);
      setMinutes(null);
      setEasier(false);
      qc.invalidateQueries({ queryKey: ["today-workout"] });
      qc.invalidateQueries({ queryKey: ["workouts"] });
      qc.invalidateQueries({ queryKey: ["calendar"] });
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo ajustar la sesión");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-surface border rounded-xl p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground flex items-center gap-2">
            <SlidersHorizontal className="size-3.5 text-primary" /> Ajustar hoy
          </p>
          <p className="font-display text-xl font-bold uppercase tracking-tight mt-1 truncate">
            {w.plan?.title ?? w.plan?.name ?? "Sesión de hoy"}
          </p>
          <p className="text-xs text-muted-foreground">
            {base} min · {w.training_type} · {w.bike_type}
            {w.planned_tss ? ` · ${Math.round(Number(w.planned_tss))} TSS` : ""}
            {w.plan?.adjust_notes ? ` · ${w.plan.adjust_notes}` : ""}
          </p>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-xs font-semibold px-3 py-2 rounded-lg border-2 border-primary text-primary hover:bg-primary/10"
        >
          {open ? "Cerrar" : "Recalcular"}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-3 border-t pt-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1.5">
              <Timer className="size-3.5" /> Tengo menos tiempo
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {options.map((m) => (
                <button
                  key={m}
                  onClick={() => setMinutes(minutes === m ? null : m)}
                  className={`px-3 py-2 rounded-lg border-2 text-sm font-semibold ${minutes === m ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}
                >
                  {m} min
                </button>
              ))}
              {options.length === 0 && <p className="text-xs text-muted-foreground">La sesión ya es corta ({base} min).</p>}
            </div>
          </div>

          <button
            onClick={() => setEasier((e) => !e)}
            className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 text-sm font-semibold text-left ${easier ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}
          >
            <Gauge className="size-4" /> Hoy voy más suave (bajar intensidad)
          </button>

          <button
            onClick={run}
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Recalcular sesión
          </button>
          <p className="text-[11px] text-muted-foreground">
            Se recalculan bloques, TSS y, si tienes Intervals.icu conectado, se actualiza el evento del día.
          </p>
        </div>
      )}
    </div>
  );
}
