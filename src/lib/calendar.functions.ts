import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RangeInput = z.object({
  from: z.string(), // YYYY-MM-DD
  to: z.string(),
});

export type CalendarEvent = {
  id: string;
  kind: "workout" | "competition" | "activity";
  date: string; // YYYY-MM-DD
  title: string;
  subtitle?: string;
  status?: string | null;
  meta?: Record<string, unknown>;
};

export const getCalendar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RangeInput.parse(d))
  .handler(async ({ data, context }): Promise<CalendarEvent[]> => {
    const { supabase, userId } = context;
    const fromIso = `${data.from}T00:00:00.000Z`;
    const toIso = `${data.to}T23:59:59.999Z`;

    const [wRes, cRes, aRes] = await Promise.all([
      supabase.from("workouts").select("id, training_type, duration_minutes, status, plan, completed_at, created_at").eq("user_id", userId),
      supabase.from("competitions").select("id, name, date, type, distance_km, elevation_m").eq("user_id", userId).gte("date", data.from).lte("date", data.to),
      supabase.from("strava_activities").select("id, name, type, distance, moving_time, total_elevation_gain, start_date").eq("user_id", userId).gte("start_date", fromIso).lte("start_date", toIso),
    ]);

    const events: CalendarEvent[] = [];

    for (const w of wRes.data ?? []) {
      const plan = (w.plan ?? {}) as Record<string, unknown>;
      const sched = (plan.scheduled_date as string | undefined) ?? null;
      const date = sched ?? (w.completed_at ? String(w.completed_at).slice(0, 10) : String(w.created_at).slice(0, 10));
      if (date < data.from || date > data.to) continue;
      const name = (plan.title as string) ?? (plan.name as string) ?? w.training_type ?? "Entrenamiento";
      events.push({
        id: `w-${w.id}`,
        kind: "workout",
        date,
        title: name,
        subtitle: `${w.duration_minutes ?? 60} min · ${w.training_type ?? ""}`.trim(),
        status: w.status,
        meta: { workout_id: w.id },
      });
    }

    for (const c of cRes.data ?? []) {
      events.push({
        id: `c-${c.id}`,
        kind: "competition",
        date: c.date as string,
        title: c.name,
        subtitle: [c.type, c.distance_km ? `${c.distance_km} km` : null, c.elevation_m ? `${c.elevation_m} m+` : null].filter(Boolean).join(" · "),
        meta: { competition_id: c.id },
      });
    }

    for (const a of aRes.data ?? []) {
      const date = String(a.start_date).slice(0, 10);
      events.push({
        id: `a-${a.id}`,
        kind: "activity",
        date,
        title: a.name ?? a.type ?? "Actividad",
        subtitle: [
          a.type,
          a.distance ? `${(Number(a.distance) / 1000).toFixed(1)} km` : null,
          a.moving_time ? `${Math.round(Number(a.moving_time) / 60)} min` : null,
          a.total_elevation_gain ? `${Math.round(Number(a.total_elevation_gain))} m+` : null,
        ].filter(Boolean).join(" · "),
        meta: { activity_id: a.id },
      });
    }

    return events;
  });

const RescheduleInput = z.object({
  workout_id: z.string().uuid(),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const rescheduleWorkout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RescheduleInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: w, error: e1 } = await supabase.from("workouts").select("plan").eq("id", data.workout_id).eq("user_id", userId).maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!w) throw new Error("Entrenamiento no encontrado");
    const plan = { ...((w.plan as Record<string, unknown>) ?? {}), scheduled_date: data.scheduled_date };
    const { error } = await supabase.from("workouts").update({ plan }).eq("id", data.workout_id).eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
