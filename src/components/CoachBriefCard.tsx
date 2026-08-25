import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCoachToday, dismissCoachAlert } from "@/lib/coach.functions";
import { useAuth } from "@/lib/use-auth";
import { Compass, AlertTriangle, Info, X, Loader2 } from "lucide-react";

/** Coach IA proactivo: resumen del día + alertas de fatiga/forma. */
export function CoachBriefCard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fetchCoach = useServerFn(getCoachToday);
  const dismiss = useServerFn(dismissCoachAlert);

  const q = useQuery({
    queryKey: ["coach-today", user?.id],
    queryFn: async () => await fetchCoach({ data: undefined }),
    enabled: !!user,
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 120,
    refetchOnWindowFocus: false,
  });

  if (!user) return null;

  const brief: any = (q.data as any)?.brief;
  const alerts: any[] = ((q.data as any)?.alerts ?? []) as any[];

  return (
    <div className="bg-surface border rounded-xl p-5 space-y-4">
      <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground flex items-center gap-2">
        <Compass className="size-3.5 text-primary" /> Coach IA
      </p>

      {q.isLoading && (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" /> Analizando tu día…
        </p>
      )}

      {brief && (
        <div className="space-y-2">
          <p className="font-display text-lg leading-tight">{brief.short}</p>
          {brief.workout?.summary && <p className="text-sm text-muted-foreground">{brief.workout.summary}</p>}
          <div className="flex flex-wrap gap-2 text-[11px] font-mono">
            <span className="px-2 py-1 rounded bg-muted">CTL {brief.load.ctl}</span>
            <span className="px-2 py-1 rounded bg-muted">ATL {brief.load.atl}</span>
            <span className="px-2 py-1 rounded bg-muted">TSB {brief.load.tsb}</span>
            {brief.readiness_score && <span className="px-2 py-1 rounded bg-muted">Readiness {brief.readiness_score}/5</span>}
          </div>
          {brief.advice && <p className="text-sm border-l-2 border-primary pl-3">{brief.advice}</p>}
        </div>
      )}

      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a) => {
            const critical = a.severity === "critical";
            const warn = a.severity === "warning";
            const Icon = critical || warn ? AlertTriangle : Info;
            return (
              <div
                key={a.id}
                className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
                  critical ? "border-destructive/50 bg-destructive/10" : warn ? "border-primary/40 bg-primary/5" : "bg-muted/40"
                }`}
              >
                <Icon className="size-4 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="font-semibold">{a.title}</p>
                  <p className="text-muted-foreground">{a.message}</p>
                </div>
                <button
                  aria-label="Descartar aviso"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={async () => {
                    await dismiss({ data: { id: a.id } });
                    qc.invalidateQueries({ queryKey: ["coach-today"] });
                  }}
                >
                  <X className="size-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
