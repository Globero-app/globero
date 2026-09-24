import { tr, activeLang } from "@/lib/i18n";import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { format } from "date-fns";
import { es, ca, fr, enGB, de } from "date-fns/locale";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import { listRescheduleProposals, resolveReschedule } from "@/lib/workout-actions.functions";

export function RescheduleProposals() {
  const qc = useQueryClient();
  const list = useServerFn(listRescheduleProposals);
  const resolve = useServerFn(resolveReschedule);
  const [busy, setBusy] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["reschedule-proposals"],
    queryFn: () => list({ data: undefined as any })
  });

  const items = (q.data ?? []) as Array<{
    id: string;title: string;original_date: string | null;proposed_date: string;duration_minutes: number;
  }>;
  if (!items.length) return null;

  const act = async (id: string, accept: boolean) => {
    setBusy(id);
    try {
      await resolve({ data: { workout_id: id, accept } });
      toast.success(accept ? "Entrenamiento reubicado" : "Semana ajustada sin ese entrenamiento");
      qc.invalidateQueries({ queryKey: ["reschedule-proposals"] });
      qc.invalidateQueries({ queryKey: ["workouts"] });
    } catch (e: any) {
      toast.error(e?.message ?? "No se ha podido completar");
    } finally {
      setBusy(null);
    }
  };

  const fmt = (d: string) => format(new Date(`${d}T12:00:00Z`), "EEEE d MMM", { locale: ({ es, ca, fr, en: enGB, de } as const)[activeLang()] });

  return (
    <div className="space-y-3">
      {items.map((it) =>
      <div key={it.id} className="border rounded-xl bg-amber-50 border-amber-200 p-4 space-y-2">
          <div className="flex items-start gap-2">
            <CalendarClock className="size-4 text-amber-700 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-900">{tr("Entrenamiento no realizado")}</p>
              <p className="text-xs text-amber-800">
                "{it.title}"{it.original_date ? ` del ${fmt(it.original_date)}` : ""} ({it.duration_minutes} {tr("min). ¿Quieres reubicarlo el")} 
              {fmt(it.proposed_date)}?
              </p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
            disabled={busy === it.id}
            onClick={() => act(it.id, false)}
            className="text-xs px-3 py-1.5 rounded-md border border-amber-300 hover:bg-amber-100 disabled:opacity-50"> {tr("No, recorta la semana")} 


          </button>
            <button
            disabled={busy === it.id}
            onClick={() => act(it.id, true)}
            className="text-xs font-semibold px-3 py-1.5 rounded-md bg-amber-600 text-white hover:opacity-90 disabled:opacity-50"> {tr("Sí, reubicar")} 


          </button>
          </div>
        </div>
      )}
    </div>);

}
