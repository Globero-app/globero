import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { generateWorkouts, completeWorkout, deleteWorkout } from "@/lib/workouts.functions";
import { downloadFit, type FitWorkout, type FitWorkoutStep } from "@/lib/fit-writer";
import { Dumbbell, Download, CheckCircle2, Trash2, Loader2, Sparkles, ChevronDown, Eye } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import { es } from "date-fns/locale";


export const Route = createFileRoute("/_authenticated/entrenamientos")({
  component: EntrenamientosPage,
});

const TRAINING_OPTIONS = [
  { value: "resistencia", label: "Resistencia (base aeróbica)" },
  { value: "intervalos", label: "Intervalos (potencia y velocidad)" },
  { value: "fuerza", label: "Fuerza (sobre la bici)" },
  { value: "mixto", label: "Mixto (IA combina los 3)" },
] as const;

const BIKE_OPTIONS = [
  { value: "carretera", label: "Carretera" },
  { value: "gravel", label: "Gravel" },
  { value: "montana", label: "Montaña" },
  { value: "electrica", label: "Eléctrica" },
] as const;

function EntrenamientosPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const gen = useServerFn(generateWorkouts);
  const complete = useServerFn(completeWorkout);
  const del = useServerFn(deleteWorkout);

  const [trainingType, setTrainingType] = useState<typeof TRAINING_OPTIONS[number]["value"]>("resistencia");
  const [bikeType, setBikeType] = useState<typeof BIKE_OPTIONS[number]["value"]>("carretera");
  const [count, setCount] = useState(3);
  const [duration, setDuration] = useState(60);

  const workouts = useQuery({
    queryKey: ["workouts", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("workouts")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!user,
  });

  const generateMut = useMutation({
    mutationFn: () => gen({ data: { training_type: trainingType, bike_type: bikeType, count, duration_minutes: duration } }),
    onSuccess: () => {
      toast.success(`${count} entrenamiento${count > 1 ? "s" : ""} generado${count > 1 ? "s" : ""}`);
      qc.invalidateQueries({ queryKey: ["workouts"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Error generando entrenamientos"),
  });


  return (
    <div className="space-y-8">
      <div>
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">Plan personalizado</p>
        <h1 className="font-display text-4xl font-bold uppercase tracking-tight">Entrenamientos</h1>
      </div>

      {/* Generador */}
      <div className="bg-surface border rounded-xl p-5 space-y-4">
        <h2 className="font-display text-lg font-bold uppercase">Generar nuevos entrenamientos</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Tipo de entrenamiento">
            <select className="input" value={trainingType} onChange={(e) => setTrainingType(e.target.value as any)}>
              {TRAINING_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Tipo de bicicleta">
            <select className="input" value={bikeType} onChange={(e) => setBikeType(e.target.value as any)}>
              {BIKE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label={`Cantidad: ${count} entrenamiento${count > 1 ? "s" : ""}`}>
            <input type="range" min={1} max={10} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-full" />
          </Field>
          <Field label={`Duración por entrenamiento: ${duration} min`}>
            <input type="range" min={20} max={240} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-full" />
          </Field>
        </div>
        <button
          disabled={generateMut.isPending}
          onClick={() => generateMut.mutate()}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {generateMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {generateMut.isPending ? "Generando con IA…" : "Generar con IA"}
        </button>
      </div>

      {/* Lista */}
      <div className="space-y-3">
        <h2 className="font-display text-lg font-bold uppercase">Tus entrenamientos</h2>
        {workouts.isLoading && (
          <div className="grid gap-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
          </div>
        )}
        {workouts.data?.length === 0 && (
          <div className="text-center py-12 bg-surface border rounded-xl">
            <Dumbbell className="size-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Aún no has generado ningún entrenamiento.</p>
          </div>
        )}
        {workouts.data?.map((w: any) => (
          <WorkoutCard
            key={w.id}
            w={w}
            onComplete={async (rpe, notes) => {
              await complete({ data: { workout_id: w.id, rpe, notes } });
              toast.success("Entrenamiento marcado como completado");
              qc.invalidateQueries({ queryKey: ["workouts"] });
            }}
            onDelete={async () => {
              if (!confirm("¿Eliminar este entrenamiento?")) return;
              await del({ data: { workout_id: w.id } });
              qc.invalidateQueries({ queryKey: ["workouts"] });
            }}
          />
        ))}
      </div>

      <style>{`.input{width:100%;padding:.55rem .75rem;border-radius:.5rem;border:1px solid var(--border);background:var(--surface);font-size:.875rem;outline:none}.input:focus{box-shadow:0 0 0 2px var(--ring)}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function WorkoutCard({
  w,
  onComplete,
  onDelete,
}: {
  w: any;
  onComplete: (rpe: number, notes?: string) => Promise<void>;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [showRpe, setShowRpe] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [rpe, setRpe] = useState(3);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
              {completed && w.completed_at && ` · Completado ${format(new Date(w.completed_at), "d MMM", { locale: es })} · RPE ${w.rpe}/5`}
            </p>
            {plan.summary && <p className="text-sm mt-2">{plan.summary}</p>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => setShowPreview(true)} title="Ver y descargar .FIT" className="p-2 rounded-md hover:bg-secondary text-primary">
              <Eye className="size-4" />
            </button>
            {!completed && (
              <button onClick={() => setShowRpe((s) => !s)} title="Marcar completado" className="p-2 rounded-md hover:bg-secondary text-emerald-600">
                <CheckCircle2 className="size-4" />
              </button>
            )}
            <button onClick={onDelete} title="Eliminar" className="p-2 rounded-md hover:bg-secondary text-destructive">
              <Trash2 className="size-4" />
            </button>
            <button onClick={() => setOpen((o) => !o)} className="p-2 rounded-md hover:bg-secondary">
              <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
          </div>
        </div>

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
            {(plan.steps ?? []).map((s: any, i: number) => (
              <div key={i} className="flex items-start gap-3 py-2 border-b last:border-0">
                <div className="w-6 text-center text-xs font-mono text-muted-foreground">{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">
                    {s.name}
                    <span className="ml-2 text-[10px] font-mono uppercase text-muted-foreground">{s.intensity}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{s.description}</p>
                  <p className="text-xs mt-0.5">
                    {s.duration_type === "time" ? formatDuration(s.duration_seconds) : "Hasta lap"}
                    {s.target !== "open" && ` · ${targetLabel(s)}`}
                  </p>
                </div>
              </div>
            ))}
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

          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setShowPreview(false)} className="text-xs px-4 py-2 rounded-md hover:bg-secondary">Cerrar</button>
            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90"
            >
              <Download className="size-4" />
              Descargar .FIT
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
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
