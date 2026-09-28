import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const BIKE_TYPES = ["carretera", "gravel", "montana", "electrica"] as const;

const GenInput = z.object({
  bike_type: z.enum(BIKE_TYPES),
  duration_minutes: z.number().int().min(20).max(360),
  competition_id: z.string().uuid().optional().nullable(),
  target_basis: z.enum(["power", "hr"]).optional().default("power"),
  // 0 = domingo … 6 = sábado (getDay)
  training_days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  long_ride_day: z.number().int().min(0).max(6).optional().nullable(),
  /** Nº máximo de sesiones (por defecto tantas como días marcados). */
  max_count: z.number().int().min(1).max(90).optional(),
  /** Plan nutricional asociado. */
  nutrition_enabled: z.boolean().optional().default(false),
  nutrition_goal: z.enum(["perdida_peso", "mantenimiento", "masa_muscular"]).optional().nullable(),
  /** Elimina los entrenamientos pendientes futuros antes de generar. */
  replace_pending: z.boolean().optional().default(false),
});

export const generateWorkouts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GenInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { generateWorkoutsCore } = await import("./workouts-gen.server");

    // Guarda las preferencias para la generación automática de los domingos
    await supabase
      .from("profiles")
      .update({
        weekly_training_days: data.training_days,
        weekly_long_ride_day: data.long_ride_day ?? null,
        weekly_bike_type: data.bike_type,
        weekly_duration_minutes: data.duration_minutes,
        weekly_target_basis: data.target_basis ?? "power",
        nutrition_plan_enabled: !!data.nutrition_enabled,
        ...(data.nutrition_enabled && data.nutrition_goal ? { nutrition_goal: data.nutrition_goal } : {}),
      })
      .eq("id", userId);

    if (data.replace_pending) {
      const today = new Date().toISOString().slice(0, 10);
      const { data: pending } = await supabase
        .from("workouts")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "pending");
      const toDelete = (pending ?? []).filter((w: any) => {
        const d = (w.plan as any)?.scheduled_date;
        return !d || d >= today;
      });
      if (toDelete.length) {
        const { removeWorkoutEvent } = await import("./intervals.server");
        for (const w of toDelete) {
          try { await removeWorkoutEvent(supabase, userId, w); } catch { /* noop */ }
        }
        await supabase.from("workouts").delete().in("id", toDelete.map((w: any) => w.id));
      }
    }

    // Ventana: sólo la semana en curso (hasta el domingo). Si ya no quedan días
    // de entreno esta semana, se planifica la semana siguiente completa.
    const { madridTodayISO, weekStart, isoDate } = await import("./training-load.server");
    const todayISO = madridTodayISO();
    const monday = weekStart(todayISO);
    const addDays = (iso: string, n: number) => isoDate(new Date(new Date(`${iso}T12:00:00Z`).getTime() + n * 86400000));
    let sunday = addDays(monday, 6);
    let fromISO = todayISO;
    const remaining = (() => {
      for (let d = addDays(todayISO, 1); d <= sunday; d = addDays(d, 1)) {
        if (data.training_days.includes(new Date(`${d}T12:00:00Z`).getUTCDay())) return true;
      }
      return false;
    })();
    if (!remaining) {
      fromISO = sunday;
      sunday = addDays(sunday, 7);
    }

    const inserted = await generateWorkoutsCore(supabase, userId, {
      bike_type: data.bike_type,
      duration_minutes: data.duration_minutes,
      competition_id: data.competition_id ?? null,
      target_basis: data.target_basis ?? "power",
      training_days: data.training_days,
      long_ride_day: data.long_ride_day ?? null,
      max_count: data.max_count,
      from: new Date(`${fromISO}T12:00:00Z`),
      until: sunday,
      nutrition_goal: data.nutrition_enabled ? (data.nutrition_goal ?? "mantenimiento") : null,
    });

    const { data: deviceProfile } = await supabase
      .from("profiles")
      .select("wahoo_access_token,garmin_access_token")
      .eq("id", userId)
      .maybeSingle();
    if (deviceProfile?.wahoo_access_token || (deviceProfile as any)?.garmin_access_token) {
      const { syncWorkoutToDevices } = await import("./devices.server");
      for (const workout of inserted ?? []) await syncWorkoutToDevices(supabase, userId, workout);
    }

    // Plan nutricional: se regenera para todas las semanas afectadas por los nuevos días
    let nutritionOn = data.nutrition_enabled;
    let nutritionGoal: string = data.nutrition_goal ?? "mantenimiento";
    if (!nutritionOn) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("nutrition_plan_enabled,nutrition_goal")
        .eq("id", userId)
        .maybeSingle();
      if (prof?.nutrition_plan_enabled) {
        nutritionOn = true;
        nutritionGoal = prof.nutrition_goal ?? "mantenimiento";
      }
    }

    if (nutritionOn) {
      try {
        const { generateWeeklyNutritionCore, weekStartISO } = await import("./nutrition-gen.server");
        const dates = (inserted ?? [])
          .map((w: any) => w.plan?.scheduled_date)
          .filter(Boolean) as string[];
        const weeks = Array.from(
          new Set(dates.map((d) => weekStartISO(new Date(`${d}T12:00:00Z`)))),
        ).sort();
        if (!weeks.length) weeks.push(weekStartISO(new Date()));
        for (const week_start of weeks.slice(0, 4)) {
          await generateWeeklyNutritionCore(supabase, userId, { goal: nutritionGoal, week_start });
        }
      } catch (e) {
        console.error("nutrition-plan", e);
      }
    }

    return inserted;
  });
