import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPendingActivityFeedback, saveActivityFeedback } from "@/lib/activity-feedback.functions";
import { toast } from "sonner";
import { Bike } from "lucide-react";
import { useAuth } from "@/lib/use-auth";

const FEEL = ["Muy mal", "Mal", "Normal", "Bien", "Muy bien"];

export function ActivityFeedbackPrompt() {
  const qc = useQueryClient();
  const pendingFn = useServerFn(getPendingActivityFeedback);
  const saveFn = useServerFn(saveActivityFeedback);
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [rpe, setRpe] = useState(5);
  const [feel, setFeel] = useState(3);
  const [busy, setBusy] = useState(false);

  const { data: pending } = useQuery({
    queryKey: ["activity-feedback-pending", user?.id],
    queryFn: () => pendingFn({ data: undefined }) as any,
    enabled: !loading && !!user,
    retry: false,
    refetchInterval: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (pending?.activity_id) setOpen(true);
  }, [pending?.activity_id]);

  if (!open || !pending?.activity_id) return null;

  const submit = async () => {
    setBusy(true);
    try {
      await saveFn({ data: { activity_id: String(pending.activity_id), rpe, feel } });
      toast.success("Valoración guardada");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["activity-feedback-pending"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border bg-surface p-5 space-y-5">
        <div className="flex items-center gap-3">
          <Bike className="size-7 text-primary" />
          <div>
            <h2 className="font-display text-xl font-bold uppercase tracking-tight">Entrenamiento detectado</h2>
            <p className="text-xs text-muted-foreground">{pending.date} · Valora tu esfuerzo</p>
          </div>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">RPE (1-10)</p>
          <div className="grid grid-cols-10 gap-1">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button key={n} type="button" onClick={() => setRpe(n)}
                className={`py-2 rounded-md border text-xs font-bold ${rpe === n ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
                {n}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Sensaciones (1-5)</p>
          <div className="grid grid-cols-5 gap-1">
            {FEEL.map((label, i) => (
              <button key={label} type="button" onClick={() => setFeel(i + 1)}
                className={`py-2 rounded-md border text-[10px] font-semibold ${feel === i + 1 ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}>
                {i + 1}
                <span className="block font-normal opacity-80">{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button type="button" onClick={submit} disabled={busy}
            className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-lg font-semibold text-sm disabled:opacity-60">
            {busy ? "Guardando…" : "Guardar y enviar a Intervals.icu"}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="px-3 rounded-lg border text-xs font-semibold">
            Ahora no
          </button>
        </div>
      </div>
    </div>
  );
}
