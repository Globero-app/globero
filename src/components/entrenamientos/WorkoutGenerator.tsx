import { useState, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { generateWorkouts } from "@/lib/workouts.functions";
import { uploadWorkoutsToIntervals } from "@/lib/intervals.functions";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export const BIKE_OPTIONS = [
  { value: "carretera", label: "Carretera" },
  { value: "gravel", label: "Gravel" },
  { value: "montana", label: "Montaña" },
  { value: "electrica", label: "Eléctrica" },
] as const;

// value = getDay() (0 domingo)
export const WEEK_DAYS = [
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

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export function WorkoutGenerator({ profile }: { profile: any }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const gen = useServerFn(generateWorkouts);
  const uploadIcu = useServerFn(uploadWorkoutsToIntervals);

  const [bikeType, setBikeType] = useState<typeof BIKE_OPTIONS[number]["value"]>("carretera");
  const [duration, setDuration] = useState(60);
  const [competitionId, setCompetitionId] = useState<string>("");
  const [trainingDays, setTrainingDays] = useState<number[]>([2, 4, 6]);
  const [longRideDay, setLongRideDay] = useState<number | null>(6);
  const [nutritionEnabled, setNutritionEnabled] = useState(false);
  const [nutritionGoal, setNutritionGoal] = useState<"perdida_peso" | "mantenimiento" | "masa_muscular">("mantenimiento");
  const [targetBasis, setTargetBasis] = useState<"power" | "hr" | null>(null);
  const [autoEnabled, setAutoEnabled] = useState<boolean>(profile?.weekly_auto_enabled ?? false);

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

  const [prefsLoaded, setPrefsLoaded] = useState(false);
  type SavedPrefs = { days: number[]; long: number | null; nutrition: boolean; goal: string; basis: "power" | "hr" };
  const [savedDays, setSavedDays] = useState<SavedPrefs | null>(null);
  useEffect(() => {
    if (prefsLoaded || !profile) return;
    const p: any = profile;
    const days = (p.weekly_training_days ?? []).map((d: any) => Number(d));
    const long = p.weekly_long_ride_day;
    const nextLong = long === null || long === undefined ? null : Number(long);
    const basis: "power" | "hr" = p.weekly_target_basis === "hr" ? "hr" : "power";
    const nutrition = !!p.nutrition_plan_enabled;
    const goal = p.nutrition_goal ?? "mantenimiento";
    setTargetBasis(basis);
    setNutritionEnabled(nutrition);
    setNutritionGoal(goal);
    setAutoEnabled(!!p.weekly_auto_enabled);
    if (days.length) {
      setTrainingDays(days);
      setLongRideDay(nextLong);
      setSavedDays({ days, long: nextLong, nutrition, goal, basis });
    } else {
      setSavedDays({ days: trainingDays, long: longRideDay, nutrition, goal, basis });
    }
    setPrefsLoaded(true);
  }, [profile, prefsLoaded]);

  const persistDays = async (days: number[], long: number | null) => {
    if (!user) return;
    await supabase.from("profiles").update({ weekly_training_days: days, weekly_long_ride_day: long }).eq("id", user.id);
  };

  const persistPrefs = async (patch: Record<string, any>) => {
    if (!user) return;
    await (supabase.from("profiles") as any).update(patch).eq("id", user.id);
  };

  const maxHr = profile?.max_hr ?? null;
  const lthr = profile?.lthr ?? null;
  const intervalsConnected = !!profile?.intervals_athlete_id;

  const effectiveBasis: "power" | "hr" =
    targetBasis ?? (profile?.zones_display_mode === "hr" ? "hr" : "power");

  const daysChanged =
    !!savedDays &&
    (savedDays.long !== longRideDay ||
      savedDays.days.length !== trainingDays.length ||
      [...savedDays.days].sort().join() !== [...trainingDays].sort().join() ||
      savedDays.nutrition !== nutritionEnabled ||
      (nutritionEnabled && savedDays.goal !== nutritionGoal) ||
      savedDays.basis !== effectiveBasis);

  const hasCompetition = !!competitionId;

  const generateMut = useMutation({
    mutationFn: (opts?: { replace_pending?: boolean }) => gen({ data: { bike_type: bikeType, duration_minutes: duration, competition_id: competitionId || null, target_basis: effectiveBasis, training_days: trainingDays, long_ride_day: longRideDay, nutrition_enabled: nutritionEnabled, nutrition_goal: nutritionEnabled ? nutritionGoal : null, replace_pending: !!opts?.replace_pending, ...(competitionId ? { max_count: 90 } : {}) } }),
    onSuccess: async (inserted: any) => {
      setAutoEnabled(true);
      void persistPrefs({ weekly_auto_enabled: true });
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
    <div className="bg-surface border rounded-xl p-4 sm:p-5 space-y-4">
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
              {profile?.ftp ? `FTP ${profile.ftp} W` : "Sin FTP en el perfil"}
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

      <div className="flex flex-col sm:flex-row gap-2">
        <button
          disabled={generateMut.isPending || trainingDays.length === 0 || autoEnabled}
          onClick={() => generateMut.mutate(undefined)}
          className="inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50 w-full sm:w-auto"
        >
          {generateMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {generateMut.isPending ? "Generando con IA…" : hasCompetition ? "Generar plan para la competición" : "Generar con IA"}
        </button>
        {autoEnabled && (
          <button
            type="button"
            onClick={() => {
              if (!window.confirm("Si continúas se desactivará la creación automática de nuevos entrenamientos. Los de esta semana se mantienen, pero no se generarán más a partir del domingo. ¿Continuar?")) return;
              setAutoEnabled(false);
              void persistPrefs({ weekly_auto_enabled: false });
              toast.success("Generación automática desactivada");
            }}
            className="inline-flex items-center justify-center gap-2 border-2 border-destructive/50 text-destructive px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-destructive/10 w-full sm:w-auto"
          >
            Cancelar Entrenamientos
          </button>
        )}
      </div>
    </div>
  );
}
