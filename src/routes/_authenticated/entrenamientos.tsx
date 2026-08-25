import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { generateWorkouts, completeWorkout, deleteWorkout, convertWorkoutToTrainer, revertWorkoutToOutdoor, getTrainingLoad } from "@/lib/workouts.functions";
import { uploadWorkoutsToIntervals } from "@/lib/intervals.functions";
import { downloadFit, type FitWorkout, type FitWorkoutStep } from "@/lib/fit-writer";
import { downloadZwo, type ZwoWorkout, type ZwoStep } from "@/lib/zwo-writer";
import { Dumbbell, Download, CheckCircle2, Trash2, Loader2, Sparkles, ChevronDown, Eye, FileDown, Home, Bike, CloudRain, Sun } from "lucide-react";

import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { describeStepZone } from "@/lib/zones";
import { ThresholdCard } from "@/components/ThresholdCard";
import { getThresholdStatus } from "@/lib/progress.functions";
import { format } from "date-fns";
import { es } from "date-fns/locale";


export const Route = createFileRoute("/_authenticated/entrenamientos")({
  component: EntrenamientosPage,
});

const BIKE_OPTIONS = [

  { value: "carretera", label: "Carretera" },
  { value: "gravel", label: "Gravel" },
  { value: "montana", label: "Montaña" },
  { value: "electrica", label: "Eléctrica" },
] as const;

// value = getDay() (0 domingo)
const WEEK_DAYS = [
  { value: 1, label: "Lunes", short: "L" },
  { value: 2, label: "Martes", short: "M" },
  { value: 3, label: "Miércoles", short: "X" },
  { value: 4, label: "Jueves", short: "J" },
  { value: 5, label: "Viernes", short: "V" },
  { value: 6, label: "Sábado", short: "S" },
  { value: 0, label: "Domingo", short: "D" },
] as const;

const NUTRITION_GOAL_OPTIONS = [
  { value: "perdida_peso", label: "Pérdida de peso" },
  { value: "mantenimiento", label: "Mantenimiento" },
  { value: "masa_muscular", label: "Ganar masa muscular" },
] as const;

function EntrenamientosPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const gen = useServerFn(generateWorkouts);
  const complete = useServerFn(completeWorkout);
  const del = useServerFn(deleteWorkout);
  const toTrainer = useServerFn(convertWorkoutToTrainer);
  const toOutdoor = useServerFn(revertWorkoutToOutdoor);


  const [bikeType, setBikeType] = useState<typeof BIKE_OPTIONS[number]["value"]>("carretera");

  const [duration, setDuration] = useState(60);
  const [competitionId, setCompetitionId] = useState<string>("");
  const [trainingDays, setTrainingDays] = useState<number[]>([2, 4, 6]);
  const [longRideDay, setLongRideDay] = useState<number | null>(6);
  const [nutritionEnabled, setNutritionEnabled] = useState(false);
  const [nutritionGoal, setNutritionGoal] = useState<"perdida_peso" | "mantenimiento" | "masa_muscular">("mantenimiento");

  const competitions = useQuery({
    queryKey: ["competitions-future", user?.id],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from("competitions")
        .select("id,name,date")
        .eq("user_id", user!.id)
        .gte("date", today)
        .order("date", { ascending: true });
      return data ?? [];
    },
    enabled: !!user,
  });

  const profile = useQuery({
    queryKey: ["profile-ftp", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("ftp,max_hr,lthr,zones_display_mode,intervals_athlete_id,weekly_training_days,weekly_long_ride_day,weekly_target_basis,nutrition_plan_enabled,nutrition_goal").eq("id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const [targetBasis, setTargetBasis] = useState<"power" | "hr" | null>(null);

  const [prefsLoaded, setPrefsLoaded] = useState(false);
  type SavedPrefs = { days: number[]; long: number | null; nutrition: boolean; goal: string; basis: "power" | "hr" };
  const [savedDays, setSavedDays] = useState<SavedPrefs | null>(null);
  useEffect(() => {
    if (prefsLoaded || !profile.data) return;
    const p: any = profile.data;
    const days = (p.weekly_training_days ?? []).map((d: any) => Number(d));
    const long = p.weekly_long_ride_day;
    const nextLong = long === null || long === undefined ? null : Number(long);
    const basis: "power" | "hr" = p.weekly_target_basis === "hr" ? "hr" : "power";
    const nutrition = !!p.nutrition_plan_enabled;
    const goal = p.nutrition_goal ?? "mantenimiento";
    setTargetBasis(basis);
    setNutritionEnabled(nutrition);
    setNutritionGoal(goal);
    if (days.length) {
      setTrainingDays(days);
      setLongRideDay(nextLong);
      setSavedDays({ days, long: nextLong, nutrition, goal, basis });
    } else {
      setSavedDays({ days: trainingDays, long: longRideDay, nutrition, goal, basis });
    }
    setPrefsLoaded(true);
  }, [profile.data, prefsLoaded]);

  const persistDays = async (days: number[], long: number | null) => {
    if (!user) return;
    await supabase.from("profiles").update({ weekly_training_days: days, weekly_long_ride_day: long }).eq("id", user.id);
  };

  const persistPrefs = async (patch: Record<string, any>) => {
    if (!user) return;
    await (supabase.from("profiles") as any).update(patch).eq("id", user.id);
  };

  const ftp = profile.data?.ftp ?? 250;
  const maxHr = profile.data?.max_hr ?? null;
  const lthr = profile.data?.lthr ?? null;

  const intervalsConnected = !!profile.data?.intervals_athlete_id;
  const uploadIcu = useServerFn(uploadWorkoutsToIntervals);

  const effectiveBasis: "power" | "hr" =
    targetBasis ?? (profile.data?.zones_display_mode === "hr" ? "hr" : "power");

  const daysChanged =
    !!savedDays &&
    (savedDays.long !== longRideDay ||
      savedDays.days.length !== trainingDays.length ||
      [...savedDays.days].sort().join() !== [...trainingDays].sort().join() ||
      savedDays.nutrition !== nutritionEnabled ||
      (nutritionEnabled && savedDays.goal !== nutritionGoal) ||
      savedDays.basis !== effectiveBasis);


  const hasCompetition = !!competitionId;

  const workouts = useQuery({
    queryKey: ["workouts", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("workouts")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      const cutoff = Date.now() - 15 * 24 * 60 * 60 * 1000;
      const sorted = (data ?? [])
        .filter((w: any) => {
          const ref =
            w.completed_at ??
            (w.plan as any)?.scheduled_date ??
            w.created_at;
          const t = new Date(ref).getTime();
          return isNaN(t) ? true : t >= cutoff;
        })
        .sort((a: any, b: any) => {
          const da = new Date((a.plan as any)?.scheduled_date ?? a.created_at).getTime();
          const db = new Date((b.plan as any)?.scheduled_date ?? b.created_at).getTime();
          return da - db;
        });
      return sorted;
    },

    enabled: !!user,
  });

  const generateMut = useMutation({
    mutationFn: (opts?: { replace_pending?: boolean }) => gen({ data: { bike_type: bikeType, duration_minutes: duration, competition_id: competitionId || null, target_basis: effectiveBasis, training_days: trainingDays, long_ride_day: longRideDay, nutrition_enabled: nutritionEnabled, nutrition_goal: nutritionEnabled ? nutritionGoal : null, replace_pending: !!opts?.replace_pending, ...(competitionId ? { max_count: 90 } : {}) } }),
    onSuccess: async (inserted: any) => {
      setSavedDays({ days: trainingDays, long: longRideDay, nutrition: nutritionEnabled, goal: nutritionGoal, basis: effectiveBasis });
      const n = Array.isArray(inserted) ? inserted.length : trainingDays.length;

      toast.success(hasCompetition ? `Plan para tu competición creado: ${n} entrenamientos` : `${n} entrenamiento${n > 1 ? "s" : ""} generado${n > 1 ? "s" : ""}`);
      qc.invalidateQueries({ queryKey: ["workouts"] });
      const ids = Array.isArray(inserted) ? inserted.map((w: any) => w.id) : [];
      if (intervalsConnected && ids.length > 0) {
        const yes = window.confirm(`¿Quieres subir los ${ids.length} entrenamientos a Intervals.icu en los días seleccionados?`);
        if (yes) {
          try {
            const r: any = await uploadIcu({ data: { workout_ids: ids } });
            toast.success(`${r.uploaded} entrenamiento(s) subidos a Intervals.icu`);
            qc.invalidateQueries({ queryKey: ["workouts"] });
          } catch (e: any) {
            toast.error(e.message ?? "Error subiendo a Intervals.icu");
          }
        }
      }
    },
    onError: (e: any) => toast.error(e.message ?? "Error generando entrenamientos"),
  });


  return (
    <div className="space-y-8">
      <div>
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">Plan personalizado</p>
        <h1 className="font-display text-4xl font-bold uppercase tracking-tight">Entrenamientos</h1>
      </div>

      <TrainingLoadCard />
      <ThresholdsSection />


      {/* Generador */}
      <div className="bg-surface border rounded-xl p-5 space-y-4">
        <h2 className="font-display text-lg font-bold uppercase">Generar nuevos entrenamientos</h2>

        {competitions.data && competitions.data.length > 0 && (
          <Field label="Competición objetivo (opcional)">
            <select className="input" value={competitionId} onChange={(e) => setCompetitionId(e.target.value)}>
              <option value="">— Sin competición (entrenamiento libre) —</option>
              {competitions.data.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {format(new Date(c.date), "d MMM yyyy", { locale: es })}
                </option>
              ))}
            </select>
            {hasCompetition && (
              <p className="text-[11px] text-muted-foreground mt-1.5">
                La IA generará un plan periodizado y mixto hasta el día del evento, en los días que marques abajo.
              </p>
            )}
          </Field>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Tipo de bicicleta">
            <select className="input" value={bikeType} onChange={(e) => setBikeType(e.target.value as any)}>
              {BIKE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label={`Duración por entrenamiento: ${duration} min`}>
            <input type="range" min={20} max={240} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-full" />
          </Field>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Los entrenamientos son siempre <strong>mixtos</strong> (resistencia, intervalos y fuerza) y se crea uno por cada día marcado.
          Cada domingo a las 21:00 la IA generará automáticamente los entrenamientos de la semana siguiente según estos días y tu progreso.
        </p>


        <Field label="Días que puedes entrenar">
          <div className="grid grid-cols-7 gap-1.5">
            {WEEK_DAYS.map((d) => {
              const active = trainingDays.includes(d.value);
              return (
                <button
                  key={d.value}
                  type="button"
                  aria-pressed={active}
                  title={d.label}
                  onClick={() => {
                    const next = active ? trainingDays.filter((v) => v !== d.value) : [...trainingDays, d.value];
                    const nextLong = next.includes(longRideDay ?? -1) ? longRideDay : null;
                    setTrainingDays(next);
                    setLongRideDay(nextLong);
                    void persistDays(next, nextLong);
                  }}

                  className={`rounded-lg border-2 py-2 text-sm font-bold transition ${active ? "border-primary bg-primary/10" : "border-border hover:border-primary/50 text-muted-foreground"}`}
                >
                  {d.short}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            {trainingDays.length === 0
              ? "Marca al menos un día para planificar el calendario."
              : `La IA creará ${trainingDays.length} entrenamiento(s) en: ${WEEK_DAYS.filter((d) => trainingDays.includes(d.value)).map((d) => d.label).join(", ")}.`}
          </p>
        </Field>

        <Field label="Día de la tirada larga">
          <div className="grid grid-cols-7 gap-1.5">
            {WEEK_DAYS.map((d) => {
              const enabled = trainingDays.includes(d.value);
              const active = longRideDay === d.value;
              return (
                <button
                  key={d.value}
                  type="button"
                  disabled={!enabled}
                  aria-pressed={active}
                  title={d.label}
                  onClick={() => { const nl = active ? null : d.value; setLongRideDay(nl); void persistDays(trainingDays, nl); }}
                  className={`rounded-lg border-2 py-2 text-sm font-bold transition disabled:opacity-30 disabled:cursor-not-allowed ${active ? "border-primary bg-primary/10" : "border-border hover:border-primary/50 text-muted-foreground"}`}
                >
                  {d.short}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            {longRideDay === null
              ? "Sin tirada larga. Selecciona un día (debe estar marcado arriba como día de entreno)."
              : `Tirada larga los ${WEEK_DAYS.find((d) => d.value === longRideDay)!.label.toLowerCase()}: rodaje largo en Z2, más duración que el resto.`}
          </p>
        </Field>

        {daysChanged && trainingDays.length > 0 && (
          <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-3 space-y-2">
            <p className="text-[12px]">
              Has cambiado tu configuración de entrenamiento (días, plan nutricional o base de prescripción). Se ha guardado para las próximas semanas. ¿Quieres regenerar los entrenamientos pendientes con la nueva configuración?
            </p>
            <button
              type="button"
              disabled={generateMut.isPending}
              onClick={() => generateMut.mutate({ replace_pending: true })}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
            >
              {generateMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              Regenerar con la nueva configuración
            </button>
          </div>
        )}



        <Field label="Plan nutricional">
          <label className="flex items-start gap-3 p-3 bg-background border rounded-lg cursor-pointer hover:border-primary/40 transition-colors">
            <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={nutritionEnabled} onChange={(e) => { const v = e.target.checked; setNutritionEnabled(v); void persistPrefs({ nutrition_plan_enabled: v, ...(v ? { nutrition_goal: nutritionGoal } : {}) }); }} />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold">Quiero un plan nutricional</span>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                La IA adaptará los entrenamientos a tu objetivo y creará los menús de la semana en la pantalla <strong>Menús</strong>. Se actualiza cada domingo.
              </p>
            </div>
          </label>
          {nutritionEnabled && (
            <div className="grid sm:grid-cols-3 gap-2 mt-2">
              {NUTRITION_GOAL_OPTIONS.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => { setNutritionGoal(g.value); void persistPrefs({ nutrition_goal: g.value }); }}
                  className={`rounded-lg border-2 px-3 py-2.5 text-sm font-semibold transition ${nutritionGoal === g.value ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          )}
        </Field>

        <Field label="Base de prescripción de la IA">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => { setTargetBasis("power"); void persistPrefs({ weekly_target_basis: "power" }); }}
              className={`rounded-lg border-2 px-3 py-2.5 text-left transition ${effectiveBasis === "power" ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}
            >
              <span className="block text-sm font-semibold">Potencia (FTP)</span>
              <span className="block text-[11px] text-muted-foreground">
                {profile.data?.ftp ? `FTP ${profile.data.ftp} W` : "Sin FTP en el perfil"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => { setTargetBasis("hr"); void persistPrefs({ weekly_target_basis: "hr" }); }}
              className={`rounded-lg border-2 px-3 py-2.5 text-left transition ${effectiveBasis === "hr" ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}
            >
              <span className="block text-sm font-semibold">Frecuencia cardíaca</span>
              <span className="block text-[11px] text-muted-foreground">
                {maxHr || lthr ? `FC máx ${maxHr ?? "—"} · LTHR ${lthr ?? "—"}` : "Sin FC máx en el perfil"}
              </span>
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1.5">
            {effectiveBasis === "hr"
              ? "La IA creará los entrenamientos con objetivos en pulsaciones (ppm) sobre tu LTHR / FC máx."
              : "La IA creará los entrenamientos con objetivos en vatios sobre tu FTP."}
          </p>
        </Field>

        <button
          disabled={generateMut.isPending || trainingDays.length === 0}
          onClick={() => generateMut.mutate(undefined)}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {generateMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {generateMut.isPending ? "Generando con IA…" : hasCompetition ? "Generar plan para la competición" : "Generar con IA"}
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
            ftp={ftp}
            refs={{ ftp, lthr, maxHr }}
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
            onTrainer={async () => {
              const r: any = await toTrainer({ data: { workout_id: w.id } });
              toast.success(
                r.intervals_synced
                  ? "Entrenamiento adaptado a rodillo y actualizado en Intervals.icu"
                  : "Entrenamiento adaptado a rodillo",
              );
              qc.invalidateQueries({ queryKey: ["workouts"] });
              qc.invalidateQueries({ queryKey: ["calendar"] });
            }}
            onOutdoor={async () => {
              const r: any = await toOutdoor({ data: { workout_id: w.id } });
              toast.success(
                r.intervals_synced
                  ? "Entrenamiento devuelto a exterior y actualizado en Intervals.icu"
                  : "Entrenamiento devuelto a exterior",
              );
              qc.invalidateQueries({ queryKey: ["workouts"] });
              qc.invalidateQueries({ queryKey: ["calendar"] });
            }}
          />

        ))}
      </div>

      <style>{`.input{width:100%;padding:.55rem .75rem;border-radius:.5rem;border:1px solid var(--border);background:var(--surface);font-size:.875rem;outline:none}.input:focus{box-shadow:0 0 0 2px var(--ring)}`}</style>
    </div>
  );
}

const FOCUS_LABEL: Record<string, string> = {
  base: "Base", construccion: "Construcción", pico: "Pico", tapering: "Tapering", descarga: "Descarga",
};

function TrainingLoadCard() {
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function ThresholdsSection() {
  const getTh = useServerFn(getThresholdStatus);
  const q = useQuery({ queryKey: ["threshold-status"], queryFn: () => getTh({ data: {} } as any), staleTime: 10 * 60_000 });
  if (!q.data || !(q.data as any).stale) return null;
  return <ThresholdCard status={q.data as any} compact />;
}

function WorkoutCard({
  w,
  ftp,
  refs,
  onComplete,
  onDelete,
  onTrainer,
  onOutdoor,
}: {
  w: any;
  ftp: number;
  refs: { ftp: number | null; lthr: number | null; maxHr: number | null };
  onComplete: (rpe: number, notes?: string) => Promise<void>;
  onDelete: () => void;
  onTrainer: () => Promise<void>;
  onOutdoor: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [showRpe, setShowRpe] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [rpe, setRpe] = useState(3);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [converting, setConverting] = useState(false);
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
      author: "Sentmenat Bici",
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
              {completed && w.completed_at && ` · Completado ${format(new Date(w.completed_at), "d MMM", { locale: es })} · RPE ${w.rpe}/5`}
            </p>
            {plan.competition_name && <p className="text-[11px] font-mono uppercase text-primary mt-0.5">🏁 {plan.competition_name}</p>}
            {plan.summary && <p className="text-sm mt-2">{plan.summary}</p>}
            {plan.rationale && <p className="text-[11px] text-muted-foreground mt-1.5">🧠 {plan.rationale}</p>}
            {plan.weather_advice && (
              <div className={`flex items-start gap-2 mt-2 text-[11px] rounded-md px-2 py-1.5 border ${plan.weather_advice.indoor ? "bg-sky-50 border-sky-200 text-sky-800" : "bg-emerald-50 border-emerald-200 text-emerald-800"}`}>
                {plan.weather_advice.indoor ? <CloudRain className="size-3.5 shrink-0 mt-0.5" /> : <Sun className="size-3.5 shrink-0 mt-0.5" />}
                <span>{plan.weather_advice.note}</span>
              </div>
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

/** Comparativa entre lo prescrito y lo ejecutado (desde Strava/Intervals). */
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
          : "Cuando enlaces la actividad de Strava se calculará el TSS real y el cumplimiento."}
      </p>
    </div>
  );
}
