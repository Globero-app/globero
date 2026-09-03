import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Skeleton } from "@/components/ui/skeleton";
import { getTrainingLoad } from "@/lib/workouts.functions";
import { getThresholdStatus } from "@/lib/progress.functions";
import { ThresholdCard } from "@/components/ThresholdCard";

const FOCUS_LABEL: Record<string, string> = {
  base: "Base", construccion: "Construcción", pico: "Pico", tapering: "Tapering", descarga: "Descarga",
};

export function TrainingLoadCard() {
  const getLoad = useServerFn(getTrainingLoad);
  const q = useQuery({ queryKey: ["training-load"], queryFn: () => getLoad({ data: {} } as any), staleTime: 5 * 60_000 });
  if (q.isLoading) return <Skeleton className="h-24 w-full rounded-xl" />;
  const load: any = (q.data as any)?.load;
  const block: any = (q.data as any)?.block;
  if (!load) return null;
  const tsb = Number(load.tsb ?? 0);
  const form = tsb > 10 ? { t: "Fresco", c: "text-emerald-600" } : tsb > -10 ? { t: "Equilibrado", c: "text-sky-600" } : tsb > -25 ? { t: "Cargado", c: "text-amber-600" } : { t: "Muy fatigado", c: "text-red-600" };
  return (
    <div className="bg-surface border rounded-xl p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-display text-lg font-bold uppercase">Estado de forma</h2>
        {block?.focus && (
          <span className="text-[10px] font-mono uppercase bg-secondary px-2 py-0.5 rounded">
            Bloque {FOCUS_LABEL[block.focus] ?? block.focus} · semana {block.week_index ?? 1}/4
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3 mt-4">
        <Metric label="Fitness (CTL)" value={Math.round(load.ctl ?? 0)} />
        <Metric label="Fatiga (ATL)" value={Math.round(load.atl ?? 0)} />
        <Metric label="Forma (TSB)" value={Math.round(tsb)} className={form.c} />
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        {form.t}
        {load.weekly_tss != null && ` · ${Math.round(load.weekly_tss)} TSS esta semana`}
        {load.readiness_7d != null && ` · readiness 7d ${load.readiness_7d}/5`}
      </p>
    </div>
  );
}

function Metric({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className="rounded-lg bg-secondary/50 p-3 text-center">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</p>
      <p className={`font-display text-2xl font-bold ${className ?? ""}`}>{value}</p>
    </div>
  );
}

export function ThresholdsSection() {
  const getTh = useServerFn(getThresholdStatus);
  const q = useQuery({ queryKey: ["threshold-status"], queryFn: () => getTh({ data: {} } as any), staleTime: 10 * 60_000 });
  if (!q.data || !(q.data as any).stale) return null;
  return <ThresholdCard status={q.data as any} compact />;
}
