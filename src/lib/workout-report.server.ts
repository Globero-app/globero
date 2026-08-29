/* Informe IA del entrenamiento realizado (planificado vs ejecutado).
   Solo servidor: no importar desde el cliente. */

import { buildTrainingLoad, madridTodayISO } from "./training-load.server";

function fmtMin(sec?: number | null): string | null {
  if (!sec) return null;
  return `${Math.round(Number(sec) / 60)} min`;
}

/** Reúne datos y genera el texto del informe. Devuelve null si faltan datos clave. */
export async function buildWorkoutReport(
  supabase: any,
  userId: string,
  workoutId: string,
): Promise<{ text: string; title: string } | null> {
  const { data: w } = await supabase
    .from("workouts")
    .select("id,plan,planned_tss,actual_tss,actual_if,compliance,duration_minutes,bike_type,rpe")
    .eq("id", workoutId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!w) return null;

  const plan: any = w.plan ?? {};
  const activityId: string | null = plan.strava_activity_id ? String(plan.strava_activity_id) : null;

  const [{ data: profile }, { data: act }, { data: daily }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    activityId
      ? supabase
          .from("intervals_activities")
          .select(
            "name,type,start_date,moving_time,distance,total_elevation_gain,average_speed,average_heartrate,max_heartrate,average_watts,icu_training_load,icu_intensity",
          )
          .eq("id", activityId)
          .eq("user_id", userId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    activityId
      ? supabase
          .from("daily_activities")
          .select("rpe,feel,date")
          .eq("user_id", userId)
          .eq("activity_id", activityId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (!act) return null;

  // Sin potencia ni FC no hay análisis útil: informe determinista breve (sin IA).
  if (!Number(act.average_watts) && !Number(act.average_heartrate)) {
    const mins = Math.round(Number(act.moving_time ?? 0) / 60);
    const km = Number(act.distance ?? 0) / 1000;
    return {
      title: plan.title ?? plan.name ?? "Sesión",
      text: `Sesión registrada: ${mins} min${km > 1 ? `, ${km.toFixed(1)} km` : ""}. Sin datos de potencia ni frecuencia cardíaca no se genera análisis detallado.`,
    };
  }

  let load: any = null;
  try {
    load = await buildTrainingLoad(supabase, userId, profile);
  } catch {
    /* opcional */
  }

  const today = madridTodayISO();
  const [{ data: block }, { data: readiness }] = await Promise.all([
    supabase
      .from("training_blocks")
      .select("focus,week_index,target_tss,start_date")
      .eq("user_id", userId)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("readiness_entries")
      .select("score")
      .eq("user_id", userId)
      .eq("entry_date", daily?.date ?? today)
      .maybeSingle(),
  ]);

  const planTitle = plan.title ?? plan.name ?? "Sesión";
  const dateISO = (daily?.date ?? String(act.start_date ?? "").slice(0, 10)) || today;

  const facts: string[] = [];
  facts.push(`Entrenamiento planificado: "${planTitle}" del ${dateISO}`);
  if (plan.summary) facts.push(`Objetivo del plan: ${plan.summary}`);
  facts.push(`Duración planificada: ${w.duration_minutes} min · real: ${fmtMin(act.moving_time) ?? "n/d"}`);
  if (w.planned_tss) facts.push(`TSS previsto: ${Math.round(Number(w.planned_tss))}`);
  if (act.icu_training_load) facts.push(`Carga real (TSS): ${Math.round(Number(act.icu_training_load))}`);
  if (act.icu_intensity) facts.push(`Intensidad (IF): ${Number(act.icu_intensity).toFixed(2)}`);
  if (w.compliance) facts.push(`Cumplimiento de carga: ${w.compliance}%`);
  if (act.distance) facts.push(`Distancia: ${(Number(act.distance) / 1000).toFixed(1)} km`);
  if (act.total_elevation_gain) facts.push(`Desnivel positivo: ${Math.round(Number(act.total_elevation_gain))} m`);
  if (act.average_heartrate) facts.push(`FC media: ${Math.round(Number(act.average_heartrate))} ppm`);
  if (act.max_heartrate) facts.push(`FC máx: ${Math.round(Number(act.max_heartrate))} ppm`);
  if (act.average_watts) facts.push(`Potencia media: ${Math.round(Number(act.average_watts))} W`);
  if (daily?.rpe) facts.push(`RPE indicado por el ciclista: ${daily.rpe}/10`);
  if (daily?.feel) facts.push(`Sensaciones: ${daily.feel}/5`);
  if (plan.estimated_tss) facts.push(`RPE/esfuerzo esperado según el plan (TSS estimado): ${Math.round(Number(plan.estimated_tss))}`);
  if (profile?.ftp) facts.push(`FTP: ${profile.ftp} W`);
  if (profile?.lthr) facts.push(`LTHR: ${profile.lthr} ppm`);
  if (profile?.max_hr) facts.push(`FC máx perfil: ${profile.max_hr} ppm`);
  if (load) facts.push(`Forma: CTL ${Math.round(load.ctl)} · ATL ${Math.round(load.atl)} · TSB ${Math.round(load.tsb)}`);
  if (block) facts.push(`Fase actual: ${block.focus} (semana ${block.week_index})`);
  if (readiness?.score) facts.push(`Readiness del día: ${readiness.score}/5`);

  const system = `Eres el entrenador de ciclismo del usuario. Escribe un informe BREVE en español comparando lo planificado con lo ejecutado.
Formato exacto (sin markdown, sin emojis, sin negritas):
Línea 1: "He completado el análisis del entrenamiento planificado "<título>" del <DD/MM>."
Línea "Cumplimiento: <una o dos frases>."
Un párrafo corto (máx. 4 frases) con las desviaciones relevantes (duración, intensidad/IF, carga, RPE real vs esperado).
Bloque "Detalles adicionales:" con 2-4 viñetas que empiecen por "- " y solo con datos disponibles.
Párrafo final (máx. 3 frases) con la conclusión en el contexto de la fase de entrenamiento, TSB y readiness.
Nunca inventes datos que no aparezcan. Máximo 200 palabras en total.`;

  const { callAI } = await import("./ai-call.server");
  const res = await callAI(
    [
      { role: "system", content: system },
      { role: "user", content: facts.join("\n") },
    ],
    undefined,
    { fn: "workout-report", userId },
  );
  const text = (typeof res === "string" ? res : String(res?.reply ?? res?.content ?? "")).trim();
  if (!text) return null;

  return { text, title: planTitle };
}

/** Genera el informe, lo guarda en workouts.plan.report y avisa por push/Telegram. */
export async function generateAndNotifyWorkoutReport(
  supabase: any,
  userId: string,
  workoutId: string,
): Promise<boolean> {
  try {
    const report = await buildWorkoutReport(supabase, userId, workoutId);
    if (!report) return false;

    const { data: w } = await supabase
      .from("workouts")
      .select("plan")
      .eq("id", workoutId)
      .eq("user_id", userId)
      .maybeSingle();
    const plan: any = { ...(((w?.plan as any) ?? {}) as Record<string, unknown>) };
    plan.report = { text: report.text, created_at: new Date().toISOString() };
    await supabase
      .from("workouts")
      .update({ plan, updated_at: new Date().toISOString() })
      .eq("id", workoutId)
      .eq("user_id", userId);

    const { data: prof } = await supabase
      .from("profiles")
      .select("notify_channel,telegram_chat_id")
      .eq("id", userId)
      .maybeSingle();
    const channel = (prof?.notify_channel as string) || "push";
    const chatId = prof?.telegram_chat_id as string | null;

    // Telegram: informe completo
    if ((channel === "telegram" || channel === "both") && chatId) {
      try {
        const { telegramSend } = await import("./telegram.server");
        await telegramSend(chatId, `📊 Informe del entrenamiento\n\n${report.text}`);
      } catch (e) {
        console.error("[workout-report] telegram", e);
      }
    }

    // Push: solo aviso corto que abre la app
    if (channel !== "telegram") {
      try {
        const { notifyUserPushOnly } = await import("./web-push.server");
        await notifyUserPushOnly(userId, {
          title: "📊 Informe listo",
          body: `Ya puedes ver el análisis de "${report.title}" en Entrenamientos.`,
          tag: `workout-report-${workoutId}`,
          url: "/entrenamientos",
        });
      } catch (e) {
        console.error("[workout-report] push", e);
      }
    }

    return true;
  } catch (e) {
    console.error("[workout-report] error", e);
    return false;
  }
}
