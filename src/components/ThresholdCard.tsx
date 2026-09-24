import { tr } from "@/lib/i18n";import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { scheduleFtpTest } from "@/lib/workouts.functions";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export interface ThresholdStatusView {
  stale: boolean;
  ftp: number | null;
  lthr: number | null;
  ftp_age_days: number | null;
  suggested_ftp: number | null;
  suggested_lthr: number | null;
  reasons: string[];
  recommendation: string;
  suggested_test_date: string | null;
  suggested_basis: "power" | "hr";
}

/** Aviso de umbrales desactualizados con propuesta de test. */
export function ThresholdCard({ status, compact }: {status: ThresholdStatusView;compact?: boolean;}) {
  const schedule = useServerFn(scheduleFtpTest);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState(status.suggested_test_date ?? "");
  const [basis, setBasis] = useState<"power" | "hr">(status.suggested_basis);

  if (!status.stale) {
    if (compact) return null;
    return (
      <div className="rounded-xl border bg-surface p-4 flex items-start gap-3">
        <CheckCircle2 className="size-4 text-emerald-600 mt-0.5" />
        <div>
          <p className="text-sm font-semibold">{tr("Umbrales actualizados")}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{status.recommendation}</p>
        </div>
      </div>);

  }

  const handle = async () => {
    if (!date) {toast.error(tr("Elige la fecha del test"));return;}
    setBusy(true);
    try {
      const r: any = await schedule({ data: { date, basis } });
      toast.success(r?.intervals_synced ? tr("Test programado y enviado a Intervals.icu") : tr("Test programado en tu calendario"));
      qc.invalidateQueries({ queryKey: ["workouts"] });
      qc.invalidateQueries({ queryKey: ["calendar"] });
      qc.invalidateQueries({ queryKey: ["threshold-status"] });
    } catch (e: any) {
      toast.error(e?.message ?? tr("No se pudo programar el test"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="size-4 text-amber-600 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg font-bold uppercase">{tr("Umbrales desactualizados")}</h3>
          <ul className="mt-2 space-y-1">
            {status.reasons.map((r, i) =>
            <li key={i} className="text-xs text-muted-foreground">• {r}</li>
            )}
          </ul>
          <p className="text-xs mt-3">{status.recommendation}</p>
          {(status.suggested_ftp || status.suggested_lthr) &&
          <p className="text-[11px] font-mono text-muted-foreground mt-2"> {tr("Estimación desde Intervals.icu:")} 

            {status.suggested_ftp ? ` FTP ~${status.suggested_ftp} W` : ""}
              {status.suggested_lthr ? ` · LTHR ~${status.suggested_lthr} ppm` : ""}
            </p>
          }

          <div className="flex flex-wrap items-end gap-2 mt-4">
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{tr("Fecha del test")}</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 block rounded-lg border bg-surface px-3 py-2 text-sm" />
              
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{tr("Basado en")}</span>
              <select
                value={basis}
                onChange={(e) => setBasis(e.target.value as "power" | "hr")}
                className="mt-1 block rounded-lg border bg-surface px-3 py-2 text-sm">
                
                <option value="power">{tr("Potencia (FTP)")}</option>
                <option value="hr">{tr("Frecuencia cardíaca (LTHR)")}</option>
              </select>
            </label>
            <button
              onClick={handle}
              disabled={busy}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
              
              {busy ? <Loader2 className="size-4 animate-spin" /> : null} {tr("Programar test")} 

            </button>
          </div>
        </div>
      </div>
    </div>);

}
