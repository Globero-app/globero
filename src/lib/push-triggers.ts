import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { sendLocalPush } from "@/lib/push";

/**
 * Se monta en el Dashboard: revisa entrenamiento planificado hoy y
 * competiciones inminentes, y dispara notificaciones locales según
 * las preferencias del usuario. Dedupe diaria por localStorage.
 */
export function useTodayPushTriggers() {
  const { user } = useAuth();

  const prefsQ = useQuery({
    queryKey: ["notify_prefs", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("notify_training_push,notify_prerace_push").eq("id", user!.id).maybeSingle();
      return data as { notify_training_push?: boolean; notify_prerace_push?: boolean } | null;
    },
    enabled: !!user,
  });

  const today = new Date().toISOString().slice(0, 10);

  const trainingQ = useQuery({
    queryKey: ["today_workout", user?.id, today],
    queryFn: async () => {
      const { data } = await supabase
        .from("workouts")
        .select("id,plan,status,duration_minutes,training_type")
        .eq("user_id", user!.id)
        .neq("status", "completed");
      const match = (data ?? []).find((w) => {
        const p = w.plan as any;
        return p?.scheduled_date === today;
      });
      return match ?? null;
    },
    enabled: !!user && !!prefsQ.data?.notify_training_push,
  });

  const preraceQ = useQuery({
    queryKey: ["next_race_push", user?.id, today],
    queryFn: async () => {
      const { data } = await supabase
        .from("competitions")
        .select("id,name,date,hydration_plan,weather_forecast")
        .eq("user_id", user!.id)
        .gte("date", today)
        .order("date", { ascending: true })
        .limit(1);
      return data?.[0] ?? null;
    },
    enabled: !!user && !!prefsQ.data?.notify_prerace_push,
  });

  // Aviso entrenamiento de hoy
  useEffect(() => {
    if (!prefsQ.data?.notify_training_push) return;
    const w = trainingQ.data;
    if (!w) return;
    const plan = w.plan as any;
    const name = plan?.name ?? "Sesión planificada";
    sendLocalPush({
      category: "training",
      tag: `training-${w.id}-${today}`,
      dedupe: "day",
      title: "🚴 Entrenamiento de hoy",
      body: `${name} · ${w.duration_minutes} min · ${w.training_type}`,
      url: "/entrenamientos",
    });
  }, [trainingQ.data, prefsQ.data?.notify_training_push, today]);


  // Aviso pre-carrera (2-3 días antes)
  useEffect(() => {
    if (!prefsQ.data?.notify_prerace_push) return;
    const c = preraceQ.data;
    if (!c) return;
    const days = Math.ceil((new Date(c.date).getTime() - Date.now()) / 86400000);
    if (days < 0 || days > 3) return;
    const hp = c.hydration_plan as any;
    const wf = c.weather_forecast as any;
    const body = hp
      ? `${c.name} en ${days === 0 ? "hoy" : days === 1 ? "mañana" : `${days} días`}. Plan: ${hp.fluid_ml_per_hour} ml/h + ${hp.sodium_mg_per_hour} mg sodio${wf ? ` · ${Math.round(wf.apparent_max_c)}°C` : ""}.`
      : `${c.name} en ${days === 0 ? "hoy" : days === 1 ? "mañana" : `${days} días`}. Revisa hidratación y avituallamiento.`;
    sendLocalPush({
      category: "prerace",
      tag: `prerace-${c.id}-${days}`,
      dedupe: "day",
      title: "💧 Recordatorio pre-carrera",
      body,
      url: `/competiciones/${c.id}`,
    });
  }, [preraceQ.data, prefsQ.data?.notify_prerace_push]);
}

/** Notifica al completar sync Intervals.icu si el usuario lo ha habilitado. */
export async function notifyActivitySync(userId: string, count: number) {
  if (count <= 0) return;
  const { data } = await supabase.from("profiles").select("notify_strava_push").eq("id", userId).maybeSingle();
  if (!(data as any)?.notify_strava_push) return;
  sendLocalPush({
    category: "strava",
    tag: `strava-sync-${new Date().toISOString().slice(0, 10)}`,
    dedupe: "hour",
    title: "✅ Intervals.icu sincronizado",
    body: count === 1 ? "1 actividad nueva importada" : `${count} actividades nuevas importadas`,
    url: "/actividades",
  });
}
