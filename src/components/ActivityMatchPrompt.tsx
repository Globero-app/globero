import { tr, activeLang } from "@/lib/i18n";import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getActivityMatches, linkActivityToTarget, type ActivityMatch } from "@/lib/activity-match.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Activity, Trophy, Dumbbell } from "lucide-react";
import { format } from "date-fns";
import { es, ca, fr, enGB, de } from "date-fns/locale";
import { toast } from "sonner";
import { useAuth } from "@/lib/use-auth";
import { activitySource } from "@/lib/activity-source";

/** Pregunta si una actividad de Intervals.icu corresponde al entreno/competición del día */
export function ActivityMatchPrompt({ enabled = true }: {enabled?: boolean;}) {
  const qc = useQueryClient();
  const load = useServerFn(getActivityMatches);
  const link = useServerFn(linkActivityToTarget);
  const [dismissed, setDismissed] = useState<string[]>([]);

  const { user, loading } = useAuth();

  const q = useQuery({
    queryKey: ["activity-matches", user?.id],
    queryFn: () => load({ data: undefined }),
    enabled: enabled && !loading && !!user,
    retry: false
  });

  const m = useMutation({
    mutationFn: (v: {match: ActivityMatch;accept: boolean;}) =>
    link({
      data: {
        activity_id: v.match.activity_id,
        target_kind: v.match.target_kind,
        target_id: v.match.target_id,
        accept: v.accept
      }
    }),
    onSuccess: (_r, v) => {
      setDismissed((d) => [...d, v.match.activity_id]);
      if (v.accept) {
        toast.success(
          v.match.target_kind === "workout" ?
          tr("Entrenamiento marcado como completado") :
          tr("Actividad asignada a la competición")
        );
      }
      qc.invalidateQueries({ queryKey: ["activity-matches"] });
      qc.invalidateQueries({ queryKey: ["calendar"] });
      qc.invalidateQueries({ queryKey: ["workouts"] });
    },
    onError: (e: Error) => toast.error(e.message)
  });

  const match = (q.data ?? []).find((x) => !dismissed.includes(x.activity_id));
  if (!match) return null;

  const TargetIcon = match.target_kind === "competition" ? Trophy : Dumbbell;

  return (
    <Dialog open onOpenChange={(o) => !o && setDismissed((d) => [...d, match.activity_id])}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="size-4 text-primary" /> {tr("Nueva actividad detectada en Intervals.icu").replace("Intervals.icu", activitySource(match.activity_id))} 

          </DialogTitle>
          <DialogDescription>
            {format(new Date(match.date + "T00:00:00"), "EEEE d MMMM yyyy", { locale: ({ es, ca, fr, en: enGB, de } as const)[activeLang()] })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-border p-3">
            <p className="font-medium flex items-center gap-1.5">
              <Activity className="size-3.5" /> {match.activity_name}
            </p>
            <p className="text-xs text-muted-foreground">{match.activity_subtitle}</p>
          </div>
          <p className="text-muted-foreground"> {tr("¿Quieres asignarla como")}
            {" "}
            {match.target_kind === "competition" ? "la competición" : "el entrenamiento"} {tr("de ese día?")} 
          </p>
          <div className="rounded-md border border-border p-3">
            <p className="font-medium flex items-center gap-1.5">
              <TargetIcon className="size-3.5" /> {match.target_title}
            </p>
            <p className="text-xs text-muted-foreground">{match.target_subtitle}</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button
            disabled={m.isPending}
            onClick={() => m.mutate({ match, accept: false })}
            className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-secondary disabled:opacity-50"> {tr("No")} 


          </button>
          <button
            disabled={m.isPending}
            onClick={() => m.mutate({ match, accept: true })}
            className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"> {tr("Sí, asignar")} 


          </button>
        </div>
      </DialogContent>
    </Dialog>);

}
