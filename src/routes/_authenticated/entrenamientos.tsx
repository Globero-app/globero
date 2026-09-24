import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { completeWorkout, deleteWorkout, convertWorkoutToTrainer, revertWorkoutToOutdoor, rebalanceWeek } from "@/lib/workouts.functions";
import { Dumbbell } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { TrainingLoadCard, ThresholdsSection } from "@/components/entrenamientos/TrainingLoadCard";
import { WorkoutCard } from "@/components/entrenamientos/WorkoutCard";
import { WorkoutGenerator } from "@/components/entrenamientos/WorkoutGenerator";
import { RescheduleProposals } from "@/components/entrenamientos/RescheduleProposals";
import { quickAdjustWorkout } from "@/lib/workout-actions.functions";
import { useI18n, tr } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/entrenamientos")({
  component: EntrenamientosPage
});

function EntrenamientosPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const complete = useServerFn(completeWorkout);
  const del = useServerFn(deleteWorkout);
  const toTrainer = useServerFn(convertWorkoutToTrainer);
  const toOutdoor = useServerFn(revertWorkoutToOutdoor);
  const quick = useServerFn(quickAdjustWorkout);
  const rebalance = useServerFn(rebalanceWeek);
  const [recalc, setRecalc] = useState(false);
  const [tab, setTab] = useState<"semana" | "proximas" | "historial">("semana");

  const profile = useQuery({
    queryKey: ["profile-ftp", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("ftp,max_hr,lthr,zones_display_mode,intervals_athlete_id,weekly_training_days,weekly_long_ride_day,weekly_target_basis,nutrition_plan_enabled,nutrition_goal,weekly_auto_enabled").eq("id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user
  });

  const ftp = profile.data?.ftp ?? 250;
  const maxHr = profile.data?.max_hr ?? null;
  const lthr = profile.data?.lthr ?? null;

  const workouts = useQuery({
    queryKey: ["workouts", user?.id],
    queryFn: async () => {
      const cutoffIso = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
      const cutoffDay = cutoffIso.slice(0, 10);
      const { data } = await supabase.
      from("workouts").
      select("id,user_id,training_type,bike_type,duration_minutes,plan,status,rpe,feedback_notes,completed_at,created_at,planned_tss,actual_tss,actual_if,compliance").
      eq("user_id", user!.id).
      or(`created_at.gte.${cutoffIso},completed_at.gte.${cutoffIso},plan->>scheduled_date.gte.${cutoffDay}`).
      order("created_at", { ascending: false }).
      limit(200);

      const cutoff = Date.now() - 15 * 24 * 60 * 60 * 1000;
      return (data ?? []).
      filter((w: any) => {
        const ref = w.completed_at ?? (w.plan as any)?.scheduled_date ?? w.created_at;
        const t = new Date(ref).getTime();
        return isNaN(t) ? true : t >= cutoff;
      }).
      sort((a: any, b: any) => {
        const da = new Date((a.plan as any)?.scheduled_date ?? a.created_at).getTime();
        const db = new Date((b.plan as any)?.scheduled_date ?? b.created_at).getTime();
        return da - db;
      });
    },
    enabled: !!user
  });

  return (
    <div className="space-y-8">
      <div>
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">{t("workouts.eyebrow")}</p>
        <h1 className="font-display text-2xl sm:text-4xl font-bold uppercase tracking-tight">{t("nav.workouts")}</h1>
      </div>

      <TrainingLoadCard />
      <ThresholdsSection />

      <RescheduleProposals />

      <WorkoutGenerator profile={profile.data} />

      {/* Lista */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-display text-lg font-bold uppercase">{t("workouts.yours")}</h2>
          <button
            type="button"
            disabled={recalc}
            onClick={async () => {
              setRecalc(true);
              try {
                const r: any = await rebalance({ data: {} });
                if (r?.changed) toast.success(`Semana recalculada: ${r.workouts.length} sesión(es) ajustadas`);else
                toast.info(r?.reason === "ya_equilibrada" ? "La semana ya está equilibrada" : r?.reason === "no_quedan_sesiones" ? "No quedan sesiones pendientes esta semana" : "No hay objetivo semanal para recalcular");
                qc.invalidateQueries({ queryKey: ["workouts"] });
                qc.invalidateQueries({ queryKey: ["calendar"] });
              } catch (e: any) {
                toast.error(e?.message ?? "No se pudo recalcular");
              } finally {
                setRecalc(false);
              }
            }}
            className="px-3 py-1.5 rounded-md border text-xs font-semibold hover:bg-secondary disabled:opacity-50">
            
            {recalc ? t("workouts.recalcing") : t("workouts.recalc")}
          </button>
        </div>
        {workouts.isLoading &&
        <div className="grid gap-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
          </div>
        }
        {workouts.data?.length === 0 &&
        <div className="text-center py-12 bg-surface border rounded-xl">
            <Dumbbell className="size-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">{t("workouts.none")}</p>
          </div>
        }
        {(() => {
          const all = workouts.data ?? [];
          if (!all.length) return null;
          const now = new Date();
          const dow = now.getDay();
          const monday = new Date(now);
          monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
          monday.setHours(0, 0, 0, 0);
          const sunday = new Date(monday);
          sunday.setDate(monday.getDate() + 7);
          const refDate = (w: any) => new Date((w.plan as any)?.scheduled_date ?? w.completed_at ?? w.created_at);
          const inWeek = (w: any) => {const d = refDate(w);return d >= monday && d < sunday;};
          const isFuture = (w: any) => refDate(w) >= sunday;
          const groups = {
            semana: all.filter(inWeek),
            proximas: all.filter(isFuture),
            historial: all.filter((w: any) => !inWeek(w) && !isFuture(w))
          };
          const list = groups[tab];
          return (
            <>
              <div className="flex gap-1 rounded-lg border bg-surface p-1 w-full sm:w-fit overflow-x-auto">
                {([
                ["semana", t("workouts.tabWeek")],
                ["proximas", t("workouts.tabNext")],
                ["historial", t("workouts.tabHistory")]] as
                const).map(([key, label]) =>
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`flex-1 sm:flex-none whitespace-nowrap px-2.5 sm:px-3 py-1.5 rounded-md text-[11px] sm:text-xs font-semibold transition ${tab === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}>
                  
                    {label} ({groups[key].length})
                  </button>
                )}
              </div>
              {list.length === 0 &&
              <div className="text-center py-10 bg-surface border rounded-xl">
                  <p className="text-sm text-muted-foreground">
                    {tab === "semana" ? "No hay entrenamientos esta semana." : tab === "proximas" ? "No hay entrenamientos próximos." : "Sin historial reciente (se muestran los últimos 15 días)."}
                  </p>
                </div>
              }
              {list.map((w: any) =>
              <WorkoutCard
                key={w.id}
                w={w}
                ftp={ftp}
                refs={{ ftp, lthr, maxHr }}
                onComplete={async (rpe, notes) => {
                  await complete({ data: { workout_id: w.id, rpe, notes } });
                  toast.success(tr("Entrenamiento marcado como completado"));
                  qc.invalidateQueries({ queryKey: ["workouts"] });
                }}
                onDelete={async () => {
                  if (!confirm(tr("¿Eliminar este entrenamiento? La carga de la semana se redistribuirá entre las sesiones pendientes."))) return;
                  const r: any = await del({ data: { workout_id: w.id } });
                  if (r?.rebalanced?.changed) {
                    toast.success(`Eliminado. Semana redistribuida: ${r.rebalanced.workouts.length} sesión(es) ajustadas`);
                  }
                  qc.invalidateQueries({ queryKey: ["workouts"] });
                }}
                onTrainer={async () => {
                  const r: any = await toTrainer({ data: { workout_id: w.id } });
                  toast.success(
                    r.intervals_synced ?
                    "Entrenamiento adaptado a rodillo y actualizado en Intervals.icu" :
                    "Entrenamiento adaptado a rodillo"
                  );
                  qc.invalidateQueries({ queryKey: ["workouts"] });
                  qc.invalidateQueries({ queryKey: ["calendar"] });
                }}
                onQuick={async (action) => {
                  const r: any = await quick({ data: { workout_id: w.id, action } });
                  if (action === "skip") {
                    toast.success(r?.proposed_date ? "Marcado como no realizado. Te proponemos un día libre para reubicarlo." : "Marcado como no realizado. La semana se ha recortado manteniendo las sesiones clave.");
                    qc.invalidateQueries({ queryKey: ["reschedule-proposals"] });
                  } else {
                    toast.success(`Sesión ajustada a ${r?.minutes} min`);
                  }
                  qc.invalidateQueries({ queryKey: ["workouts"] });
                  qc.invalidateQueries({ queryKey: ["calendar"] });
                }}
                onOutdoor={async () => {
                  const r: any = await toOutdoor({ data: { workout_id: w.id } });
                  toast.success(
                    r.intervals_synced ?
                    "Entrenamiento devuelto a exterior y actualizado en Intervals.icu" :
                    "Entrenamiento devuelto a exterior"
                  );
                  qc.invalidateQueries({ queryKey: ["workouts"] });
                  qc.invalidateQueries({ queryKey: ["calendar"] });
                }} />

              )}
            </>);

        })()}
      </div>

      <style>{`.input{width:100%;padding:.55rem .75rem;border-radius:.5rem;border:1px solid var(--border);background:var(--surface);font-size:.875rem;outline:none}.input:focus{box-shadow:0 0 0 2px var(--ring)}`}</style>
    </div>);

}
