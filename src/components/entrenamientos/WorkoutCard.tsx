import { useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Download, CheckCircle2, Trash2, Loader2, ChevronDown, Eye, FileDown, Home, Bike, CloudRain, Sun, FileText,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { describeStepZone } from "@/lib/zones";
import { downloadFit, type FitWorkout, type FitWorkoutStep } from "@/lib/fit-writer";
import { downloadZwo, type ZwoWorkout, type ZwoStep } from "@/lib/zwo-writer";
import { WorkoutIntervalsChart } from "./WorkoutIntervalsChart";

export type ZoneRefs = { ftp: number | null; lthr: number | null; maxHr: number | null };

export function WorkoutCard({
  w,
  ftp,
  refs,
  onComplete,
  onDelete,
  onTrainer,
  onOutdoor,
  onQuick,
}: {
  w: any;
  ftp: number;
  refs: ZoneRefs;
  onComplete: (rpe: number, notes?: string) => Promise<void>;
  onDelete: () => void;
  onTrainer: () => Promise<void>;
  onOutdoor: () => Promise<void>;
  onQuick?: (action: "easier" | "harder" | "shorter" | "skip") => Promise<void>;
}) {
  const [quick, setQuick] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [showRpe, setShowRpe] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [rpe, setRpe] = useState(3);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [converting, setConverting] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const isIndoor = w.bike_type === "rodillo" || !!(w.plan as any)?.indoor;

  const plan = w.plan ?? {};
  const completed = w.status === "completed";

  const handleDownload = () => {
    const fit: FitWorkout = {
      name: plan.name ?? "Workout",
      sport: "cycling",
      steps: (plan.steps ?? []).map((s: any): FitWorkoutStep => ({
        name: s.name,
        duration_type: s.duration_type === "open" ? "open" : "time",
        duration_value: s.duration_seconds,
        target: s.target,
        target_low: s.target_low ?? 0,
        target_high: s.target_high ?? 0,
        intensity: s.intensity,
      })),
    };
    const safe = (plan.name || "entrenamiento").replace(/[^a-zA-Z0-9_-]/g, "_");
    downloadFit(fit, `${safe}_${w.id.slice(0, 6)}.fit`);
    toast.success("Archivo .FIT descargado");
    setShowPreview(false);
  };

  const handleDownloadZwo = () => {
    const zwo: ZwoWorkout = {
      name: plan.title ?? plan.name ?? "Workout",
      description: plan.summary ?? "",
      author: "Globero",
      steps: (plan.steps ?? []).map((s: any): ZwoStep => ({
        name: s.name,
        description: s.description,
        duration_type: s.duration_type === "open" ? "open" : "time",
        duration_seconds: s.duration_seconds,
        target: s.target,
        target_low: s.target_low ?? 0,
        target_high: s.target_high ?? 0,
        intensity: s.intensity,
      })),
    };
    const safe = (plan.name || "entrenamiento").replace(/[^a-zA-Z0-9_-]/g, "_");
    downloadZwo(zwo, ftp, `${safe}_${w.id.slice(0, 6)}.zwo`);
    toast.success(`Archivo .ZWO descargado (FTP ${ftp}W)`);
    setShowPreview(false);
  };

  return (
    <>
      <div className={`bg-surface border rounded-xl overflow-hidden ${completed ? "opacity-75" : ""}`}>
        <div className="p-4 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold truncate">{plan.title ?? plan.name ?? "Entrenamiento"}</h3>
              {completed && <span className="text-[10px] font-mono uppercase bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">Completado</span>}
              <span className="text-[10px] font-mono uppercase bg-secondary px-2 py-0.5 rounded">{w.training_type}</span>
              <span className="text-[10px] font-mono uppercase bg-secondary px-2 py-0.5 rounded">{w.bike_type}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {w.duration_minutes} min · {plan.steps?.length ?? 0} bloques
              {plan.scheduled_date && ` · 📅 ${format(new Date(plan.scheduled_date), "d MMM", { locale: es })}`}
              {completed && w.completed_at && ` · Completado ${format(new Date(w.completed_at), "d MMM", { locale: es })}${w.rpe != null ? ` · RPE ${w.rpe}/5` : ""}`}
            </p>
            <WorkoutIntervalsChart steps={plan.steps} refs={refs} />
            {plan.competition_name && <p className="text-[11px] font-mono uppercase text-primary mt-0.5">🏁 {plan.competition_name}</p>}
            {plan.summary && <p className="text-sm mt-2">{plan.summary}</p>}
            {plan.rationale && <p className="text-[11px] text-muted-foreground mt-1.5">🧠 {plan.rationale}</p>}
            {plan.weather_advice && (
              <div className={`flex items-start gap-2 mt-2 text-[11px] rounded-md px-2 py-1.5 border ${plan.weather_advice.indoor ? "bg-sky-50 border-sky-200 text-sky-800" : "bg-emerald-50 border-emerald-200 text-emerald-800"}`}>
                {plan.weather_advice.indoor ? <CloudRain className="size-3.5 shrink-0 mt-0.5" /> : <Sun className="size-3.5 shrink-0 mt-0.5" />}
                <span>{plan.weather_advice.note}</span>
              </div>
            )}
            {plan.report?.text && (
              <button
                onClick={() => setShowReport(true)}
                className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-mono uppercase rounded-md border border-primary/30 bg-primary/10 text-primary px-2 py-1 hover:bg-primary/20"
              >
                <FileText className="size-3.5" /> Ver informe
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => setShowPreview(true)} title="Ver y descargar .FIT" className="p-2 rounded-md hover:bg-secondary text-primary">
              <Eye className="size-4" />
            </button>

            {!completed && isIndoor && (
              <button
                onClick={async () => {
                  if (converting) return;
                  if (!confirm("¿Volver a la versión de EXTERIOR?\n\nSe restaurará el entrenamiento original, se recalculará el TSS previsto y se actualizará el evento en Intervals.icu.")) return;
                  setConverting(true);
                  try { await onOutdoor(); }
                  catch (e: any) { toast.error(e?.message ?? "Error volviendo a exterior"); }
                  finally { setConverting(false); }
                }}
                title="Volver a exterior"
                className="p-2 rounded-md hover:bg-secondary text-amber-600 disabled:opacity-50"
                disabled={converting}
              >
                {converting ? <Loader2 className="size-4 animate-spin" /> : <Bike className="size-4" />}
              </button>
            )}
            {!completed && !isIndoor && (
              <button
                onClick={async () => {
                  if (converting) return;
                  if (!confirm("¿Adaptar este entrenamiento a RODILLO (60-90 min)?\n\nSe recalculará el TSS previsto y se actualizará el evento en Intervals.icu. Podrás volver a exterior cuando quieras.")) return;
                  setConverting(true);
                  try { await onTrainer(); }
                  catch (e: any) { toast.error(e?.message ?? "Error adaptando a rodillo"); }
                  finally { setConverting(false); }
                }}
                title="Cambiar a rodillo"
                className="p-2 rounded-md hover:bg-secondary text-sky-600 disabled:opacity-50"
                disabled={converting}
              >
                {converting ? <Loader2 className="size-4 animate-spin" /> : <Home className="size-4" />}
              </button>
            )}
            {!completed && (
              <button onClick={() => setShowRpe((s) => !s)} title="Marcar completado" className="p-2 rounded-md hover:bg-secondary text-emerald-600">
                <CheckCircle2 className="size-4" />
              </button>
            )}

            {!completed && (
              <button onClick={onDelete} title="Eliminar" className="p-2 rounded-md hover:bg-secondary text-destructive">
                <Trash2 className="size-4" />
              </button>
            )}

            <button onClick={() => setOpen((o) => !o)} className="p-2 rounded-md hover:bg-secondary">
              <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
          </div>
        </div>

        {!completed && w.status !== "skipped" && onQuick && (
          <div className="border-t px-4 py-2 flex flex-wrap gap-2">
            {([
              ["skip", "Hoy no puedo"],
              ["shorter", "Menos tiempo"],
              ["easier", "Más suave"],
              ["harder", "Más caña"],
            ] as const).map(([k, label]) => (
              <button
                key={k}
                disabled={quick !== null}
                onClick={async () => {
                  if (k === "skip" && !confirm("¿Marcar este entreno como no realizado? Te propondremos reubicarlo en un día libre de esta semana.")) return;
                  setQuick(k);
                  try { await onQuick(k); }
                  catch (e: any) { toast.error(e?.message ?? "No se ha podido ajustar"); }
                  finally { setQuick(null); }
                }}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-md border hover:bg-secondary disabled:opacity-50"
              >
                {quick === k ? "…" : label}
              </button>
            ))}
          </div>
        )}

        {showRpe && !completed && (
          <div className="border-t bg-secondary/40 p-4 space-y-3">
            <p className="text-sm font-semibold">¿Cómo te has sentido?</p>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setRpe(n)}
                  className={`flex-1 py-3 rounded-lg border-2 font-bold transition ${rpe === n ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">1 = muy fácil · 5 = imposible terminar</p>
            <textarea
              className="input min-h-[60px]"
              placeholder="Notas opcionales (sensaciones, dolor, condiciones…)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowRpe(false)} className="text-xs px-3 py-1.5 rounded-md hover:bg-secondary">Cancelar</button>
              <button
                disabled={submitting}
                onClick={async () => {
                  setSubmitting(true);
                  try { await onComplete(rpe, notes || undefined); setShowRpe(false); }
                  finally { setSubmitting(false); }
                }}
                className="text-xs font-semibold px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? "Guardando…" : "Confirmar"}
              </button>
            </div>
          </div>
        )}

        {open && (
          <div className="border-t bg-background/50 p-4 space-y-2">
            <h4 className="text-xs font-mono uppercase text-muted-foreground tracking-wider mb-2">Estructura del entrenamiento</h4>
            {(plan.steps ?? []).map((s: any, i: number) => {
              const z = describeStepZone(s, refs);
              return (
                <div key={i} className="flex items-start gap-3 py-2 border-b last:border-0">
                  <div className="w-6 text-center text-xs font-mono text-muted-foreground">{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm flex items-center gap-2 flex-wrap">
                      {s.name}
                      <span className="text-[10px] font-mono uppercase text-muted-foreground">{s.intensity}</span>
                      {z && (
                        <span
                          className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded text-white"
                          style={{ backgroundColor: z.zone.color }}
                        >
                          {z.zone.label.split(" · ")[0]} · {z.pctLow}-{z.pctHigh}% {z.refLabel}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{s.description}</p>
                    <p className="text-xs mt-0.5">
                      {s.duration_type === "time" ? formatDuration(s.duration_seconds) : "Hasta lap"}
                      {s.target !== "open" && ` · ${targetLabel(s)}`}
                    </p>
                    {z && <p className="text-[11px] text-muted-foreground mt-0.5">🎯 {z.explanation}</p>}
                  </div>
                </div>
              );
            })}
            <PrescribedVsExecuted w={w} />
          </div>
        )}
      </div>

      {/* Preview Modal */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl uppercase">{plan.title ?? plan.name ?? "Entrenamiento"}</DialogTitle>
            <DialogDescription>
              {w.duration_minutes} min · {plan.steps?.length ?? 0} bloques · {w.training_type} · {w.bike_type}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 mt-2">
            {plan.summary && <p className="text-sm text-muted-foreground">{plan.summary}</p>}
            <WorkoutIntervalsChart steps={plan.steps} refs={refs} expanded />
            <h4 className="text-xs font-mono uppercase text-muted-foreground tracking-wider">Estructura completa</h4>
            <div className="space-y-2">
              {(plan.steps ?? []).map((s: any, i: number) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30 border">
                  <div className="w-7 h-7 flex items-center justify-center rounded-full bg-primary/10 text-xs font-mono font-bold text-primary shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{s.name}</p>
                      <span className="text-[10px] font-mono uppercase bg-secondary px-1.5 py-0.5 rounded">{s.intensity}</span>
                    </div>
                    {s.description && <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>}
                    {(() => {
                      const z = describeStepZone(s, refs);
                      return z ? <p className="text-[11px] text-muted-foreground mt-0.5">🎯 {z.explanation}</p> : null;
                    })()}
                    <div className="flex gap-3 mt-1.5 text-xs">
                      <span className="font-mono">
                        {s.duration_type === "time" ? formatDuration(s.duration_seconds) : "Hasta lap"}
                      </span>
                      {s.target !== "open" && (
                        <span className="font-mono text-primary">
                          {targetLabel(s)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {(plan.steps ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">No hay pasos definidos en este entrenamiento.</p>
              )}
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <p className="text-[11px] text-muted-foreground text-center">
              Garmin / Wahoo / Edge → <span className="font-semibold">.FIT</span> · TrainingPeaks / Zwift → <span className="font-semibold">.ZWO</span>
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button onClick={() => setShowPreview(false)} className="text-xs px-4 py-2 rounded-md hover:bg-secondary">Cerrar</button>
              <button
                onClick={handleDownloadZwo}
                className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-md border-2 border-primary text-primary hover:bg-primary/10"
              >
                <FileDown className="size-4" />
                Descargar .ZWO
              </button>
              <button
                onClick={handleDownload}
                className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90"
              >
                <Download className="size-4" />
                Descargar .FIT
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showReport} onOpenChange={setShowReport}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl uppercase">Informe del entrenamiento</DialogTitle>
            <DialogDescription>
              {plan.title ?? plan.name ?? "Entrenamiento"}
              {plan.report?.created_at && ` · ${format(new Date(plan.report.created_at), "d MMM HH:mm", { locale: es })}`}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm whitespace-pre-line leading-relaxed">{plan.report?.text}</p>
          {plan.gamification && <GamificationBlock g={plan.gamification} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function GamificationBlock({ g }: { g: any }) {
  const pct = g?.compliance?.percent as number | null;
  const records: any[] = g?.records ?? [];
  const badges: any[] = g?.badges ?? [];
  return (
    <div className="mt-4 space-y-3 border-t pt-3">
      {pct != null && (
        <div>
          <div className="flex items-baseline justify-between">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Cumplimiento del entreno</p>
            <p className="font-display text-lg font-bold">{pct}%</p>
          </div>
          <div className="h-2 rounded-full bg-secondary overflow-hidden mt-1">
            <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">{g.compliance.label}</p>
        </div>
      )}

      {records.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Récords de la temporada</p>
          <div className="grid grid-cols-2 gap-2">
            {records.map((r) => (
              <div key={r.seconds} className="rounded-lg bg-amber-100/60 border border-amber-300/60 px-2 py-1.5">
                <p className="text-[10px] uppercase font-semibold text-amber-800">🏆 {r.label}</p>
                <p className="font-display text-sm font-bold">{r.watts} W{r.gain ? <span className="text-[11px] font-normal"> (+{r.gain})</span> : null}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {badges.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">Insignias</p>
          <div className="flex flex-wrap gap-1.5">
            {badges.map((b, i) => (
              <span key={i} title={b.detail} className="text-[11px] rounded-full border bg-secondary px-2 py-1">
                {b.emoji} {b.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatDuration(sec: number) {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}min ${s}s` : `${m}min`;
}

function targetLabel(s: any) {
  const u = s.target === "power" ? "W" : s.target === "hr" ? "bpm" : s.target === "cadence" ? "rpm" : "";
  if (s.target_low && s.target_high) return `${s.target_low}–${s.target_high} ${u}`;
  if (s.target_low) return `${s.target_low} ${u}`;
  return "—";
}

/** Comparativa entre lo prescrito y lo ejecutado (desde Intervals.icu). */
function PrescribedVsExecuted({ w }: { w: any }) {
  const planned = Number(w.planned_tss) || null;
  const actual = Number(w.actual_tss) || null;
  const iff = Number(w.actual_if) || null;
  const compliance = Number(w.compliance) || null;
  if (!planned && !actual) return null;
  const diff = planned && actual ? Math.round(((actual - planned) / planned) * 100) : null;
  return (
    <div className="mt-3 rounded-lg border bg-secondary/30 p-3">
      <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Prescrito vs ejecutado</p>
      <div className="grid grid-cols-3 gap-3 mt-2 text-center">
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">TSS previsto</p>
          <p className="font-display text-lg font-bold">{planned ? Math.round(planned) : "—"}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">TSS real</p>
          <p className="font-display text-lg font-bold">{actual ? Math.round(actual) : "—"}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-muted-foreground">Cumplimiento</p>
          <p className="font-display text-lg font-bold">{compliance ? `${Math.round(compliance)}%` : "—"}</p>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground mt-2">
        {iff ? `Intensidad real (IF) ${iff.toFixed(2)} sobre tus umbrales actuales. ` : ""}
        {diff !== null
          ? diff > 10
            ? "Fuiste por encima de lo prescrito: la IA subirá ligeramente la carga de las próximas sesiones."
            : diff < -10
              ? "Te quedaste por debajo de lo prescrito: la IA ajustará a la baja para asegurar el cumplimiento."
              : "Sesión ejecutada dentro del rango previsto: la progresión continúa según el bloque."
          : "Cuando enlaces la actividad de Intervals.icu se calculará el TSS real y el cumplimiento."}
      </p>
    </div>
  );
}
