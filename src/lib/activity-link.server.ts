/** Asignación de una actividad de Strava a un entreno o competición (compartido app + cron). */

export async function linkWorkoutActivity(
  supabase: any,
  userId: string,
  workoutId: string,
  activityId: string,
  accept: boolean,
): Promise<{ ok: boolean; completed: boolean }> {
  const { data: w, error: e1 } = await supabase
    .from("workouts")
    .select("plan, planned_tss, duration_minutes")
    .eq("id", workoutId)
    .eq("user_id", userId)
    .maybeSingle();
  if (e1) throw new Error(e1.message);
  if (!w) throw new Error("Entrenamiento no encontrado");

  const plan: any = { ...(((w.plan as any) ?? {}) as Record<string, unknown>) };
  if (accept) plan.strava_activity_id = activityId;
  else plan.strava_link_dismissed = true;

  const update: any = { plan, updated_at: new Date().toISOString() };
  if (accept) {
    update.status = "completed";
    update.completed_at = new Date().toISOString();
    try {
      const [{ data: profile }, { data: act }] = await Promise.all([
        supabase.from("profiles").select("ftp,lthr,max_hr").eq("id", userId).maybeSingle(),
        supabase
          .from("intervals_activities")
          .select("moving_time,average_watts,average_heartrate,icu_training_load")
          .eq("id", Number(activityId))
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
    } catch {
      /* métricas opcionales */
    }
  }

  const { error } = await supabase.from("workouts").update(update).eq("id", workoutId).eq("user_id", userId);
  if (error) throw new Error(error.message);

  if (accept) {
    const title = String(plan.title ?? plan.name ?? "").trim();
    if (title) {
      const { renameStravaActivity } = await import("./strava.server");
      void renameStravaActivity(supabase, userId, activityId, title, { indoor: !!plan.indoor });
    }
  }
  return { ok: true, completed: accept };
}

export async function linkCompetitionActivity(
  supabase: any,
  userId: string,
  competitionId: string,
  activityId: string,
  accept: boolean,
): Promise<{ ok: boolean; completed: boolean }> {
  const { data: c, error: e2 } = await supabase
    .from("competitions")
    .select("race_feedback")
    .eq("id", competitionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (e2) throw new Error(e2.message);
  if (!c) throw new Error("Competición no encontrada");
  const fb: any = { ...(((c.race_feedback as any) ?? {}) as Record<string, unknown>) };
  if (accept) fb.strava_activity_id = activityId;
  else fb.strava_link_dismissed = true;
  const { error } = await supabase
    .from("competitions")
    .update({ race_feedback: fb, updated_at: new Date().toISOString() })
    .eq("id", competitionId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return { ok: true, completed: accept };
}
