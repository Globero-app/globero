import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { actSubtitle } from "./strava-match.helpers";

export type StravaMatch = {
  activity_id: string;
  activity_name: string;
  activity_subtitle: string;
  date: string; // YYYY-MM-DD
  target_kind: "workout" | "competition";
  target_id: string;
  target_title: string;
  target_subtitle: string;
};

/** Actividades de Strava recientes que coinciden en fecha con un entreno o competición pendiente */
export const getStravaMatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StravaMatch[]> => {
    const { supabase, userId } = context;
    const since = new Date(Date.now() - 14 * 24 * 3600 * 1000);
    const sinceDay = since.toISOString().slice(0, 10);

    const [aRes, wRes, cRes] = await Promise.all([
      supabase
        .from("strava_activities")
        .select("id, name, type, distance, moving_time, total_elevation_gain, start_date")
        .eq("user_id", userId)
        .gte("start_date", since.toISOString())
        .order("start_date", { ascending: false }),
      supabase
        .from("workouts")
        .select("id, training_type, duration_minutes, status, plan, created_at, completed_at")
        .eq("user_id", userId),
      supabase
        .from("competitions")
        .select("id, name, date, type, distance_km, elevation_m, race_feedback")
        .eq("user_id", userId)
        .gte("date", sinceDay),
    ]);

    const activities = aRes.data ?? [];
    if (!activities.length) return [];

    // fechas ya enlazadas
    const linkedActivityIds = new Set<string>();
    for (const w of wRes.data ?? []) {
      const id = (w.plan as any)?.strava_activity_id;
      if (id) linkedActivityIds.add(String(id));
    }
    for (const c of cRes.data ?? []) {
      const id = (c.race_feedback as any)?.strava_activity_id;
      if (id) linkedActivityIds.add(String(id));
    }

    const matches: StravaMatch[] = [];

    for (const a of activities) {
      const actId = String(a.id);
      if (linkedActivityIds.has(actId)) continue;
      const day = String(a.start_date).slice(0, 10);

      // competición primero (prioridad)
      const comp = (cRes.data ?? []).find((c) => {
        const fb = (c.race_feedback as any) ?? {};
        return c.date === day && !fb.strava_activity_id && !fb.strava_link_dismissed;
      });
      if (comp) {
        matches.push({
          activity_id: actId,
          activity_name: a.name ?? a.type ?? "Actividad",
          activity_subtitle: actSubtitle(a),
          date: day,
          target_kind: "competition",
          target_id: comp.id,
          target_title: comp.name,
          target_subtitle: [comp.type, comp.distance_km ? `${comp.distance_km} km` : null].filter(Boolean).join(" · "),
        });
        continue;
      }

      const wk = (wRes.data ?? []).find((w) => {
        const plan = (w.plan as any) ?? {};
        if (plan.strava_activity_id || plan.strava_link_dismissed) return false;
        if (w.status === "completed") return false;
        const d = plan.scheduled_date ?? String(w.created_at).slice(0, 10);
        return d === day;
      });
      if (wk) {
        const plan = (wk.plan as any) ?? {};
        matches.push({
          activity_id: actId,
          activity_name: a.name ?? a.type ?? "Actividad",
          activity_subtitle: actSubtitle(a),
          date: day,
          target_kind: "workout",
          target_id: wk.id,
          target_title: plan.title ?? plan.name ?? wk.training_type ?? "Entrenamiento",
          target_subtitle: `${wk.duration_minutes ?? 60} min · ${wk.training_type ?? ""}`.trim(),
        });
      }
    }

    return matches;
  });

const LinkInput = z.object({
  activity_id: z.string().min(1),
  target_kind: z.enum(["workout", "competition"]),
  target_id: z.string().uuid(),
  accept: z.boolean(),
});

/** Asigna (o descarta) una actividad de Strava al entreno/competición de ese día */
export const linkStravaActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => LinkInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    if (data.target_kind === "workout") {
      const { data: w, error: e1 } = await supabase
        .from("workouts")
        .select("plan, planned_tss, duration_minutes")
        .eq("id", data.target_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (e1) throw new Error(e1.message);
      if (!w) throw new Error("Entrenamiento no encontrado");
      const plan: any = { ...(((w.plan as any) ?? {}) as Record<string, unknown>) };
      if (data.accept) plan.strava_activity_id = data.activity_id;
      else plan.strava_link_dismissed = true;

      const update: any = { plan, updated_at: new Date().toISOString() };
      if (data.accept) {
        update.status = "completed";
        update.completed_at = new Date().toISOString();

        // Ejecución real: TSS / IF / cumplimiento vs. lo prescrito
        try {
          const [{ data: profile }, { data: act }] = await Promise.all([
            supabase.from("profiles").select("ftp,lthr,max_hr").eq("id", userId).maybeSingle(),
            supabase
              .from("strava_activities")
              .select("moving_time,average_watts,average_heartrate,suffer_score")
              .eq("id", Number(data.activity_id))
              .eq("user_id", userId)
              .maybeSingle(),
          ]);
          if (act) {
            const { estimateActivityTss, estimatePlanTss } = await import("./training-load.server");
            const ftp = profile?.ftp ?? null;
            const lthr = profile?.lthr ?? null;
            const maxHr = profile?.max_hr ?? null;
            const actualTss = estimateActivityTss(act as any, ftp, lthr, maxHr);
            const planned = Number(w.planned_tss) || estimatePlanTss(plan, ftp, lthr, maxHr, w.duration_minutes ?? 60);
            update.actual_tss = actualTss;
            if (!w.planned_tss && planned) update.planned_tss = planned;
            if (ftp && act.average_watts) update.actual_if = Math.round((Number(act.average_watts) / ftp) * 100) / 100;
            if (planned > 0) update.compliance = Math.round((actualTss / planned) * 100);
          }
        } catch { /* métricas opcionales */ }
      }
      const { error } = await supabase
        .from("workouts")
        .update(update)
        .eq("id", data.target_id)
        .eq("user_id", userId);
      if (error) throw new Error(error.message);

      if (data.accept) {
        const title = String(plan.title ?? plan.name ?? "").trim();
        if (title) {
          const { renameStravaActivity } = await import("./strava.server");
          void renameStravaActivity(supabase, userId, data.activity_id, title);
        }
      }
      return { ok: true, completed: data.accept };
    }

    const { data: c, error: e2 } = await supabase
      .from("competitions")
      .select("race_feedback")
      .eq("id", data.target_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (e2) throw new Error(e2.message);
    if (!c) throw new Error("Competición no encontrada");
    const fb: any = { ...(((c.race_feedback as any) ?? {}) as Record<string, unknown>) };
    if (data.accept) fb.strava_activity_id = data.activity_id;
    else fb.strava_link_dismissed = true;
    const { error } = await supabase
      .from("competitions")
      .update({ race_feedback: fb, updated_at: new Date().toISOString() })
      .eq("id", data.target_id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true, completed: data.accept };
  });
