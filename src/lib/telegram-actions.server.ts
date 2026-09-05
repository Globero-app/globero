/** Acciones del bot de Telegram: readiness, eliminar/modificar entreno, perfil y menú. */
import { telegramSend } from "./telegram-api.server";
import { MealSchema, PROFILE_LABELS } from "./telegram-schemas.server";

export async function applyReadiness(opts: {
  supabaseAdmin: any;
  chatId: any;
  userId: string;
  profile: any;
  workout: any | null;
  today: string;
  text: string;
  score: number;
}) {
  const { supabaseAdmin, chatId, userId, profile, workout, today, text } = opts;
  const score = Math.round(opts.score);
  const { deterministicAdapt, READINESS_LABELS } = await import("./readiness.server");
  let action: "none" | "suggest_delete" | "adapted" = "none";
  let msg = "";

  if (!workout) {
    msg = `Registrado: ${score}/5 — ${READINESS_LABELS[score]}. Hoy no tienes entreno pendiente.`;
  } else if (score === 1) {
    action = "suggest_delete";
    msg = `Registrado 1/5. Hoy mejor descansa: te sugiero eliminar la sesión "${workout.plan?.title ?? "de hoy"}" y priorizar sueño e hidratación. Confirma la eliminación desde la pantalla Readiness de la app.`;
  } else if (score === 3) {
    msg = `Registrado 3/5 — ${READINESS_LABELS[score]}. El entrenamiento de hoy se mantiene sin cambios.`;
  } else {
    // Ajuste determinista por reglas (sin llamada a la IA).
    const adapted = deterministicAdapt({ score, workout, profile });
    const newPlan = {
      ...(workout.plan as any),
      name: adapted.name,
      title: adapted.title,
      summary: adapted.summary,
      steps: adapted.steps,
      readiness_adapted: { score, date: today, message: adapted.message },
    };
    const durationMinutes = Math.max(
      15,
      Math.round(
        (adapted.steps as any[]).reduce((total, step) => total + (Number(step.duration_seconds) || 0), 0) / 60,
      ) || Math.round(adapted.duration_minutes || workout.duration_minutes),
    );
    const { estimatePlanTss } = await import("./training-load.server");
    const plannedTss = estimatePlanTss(
      newPlan,
      profile?.ftp ?? null,
      profile?.lthr ?? null,
      profile?.max_hr ?? null,
      durationMinutes,
    );
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("workouts")
      .update({ plan: newPlan, duration_minutes: durationMinutes, planned_tss: plannedTss })
      .eq("id", workout.id)
      .eq("user_id", userId)
      .select()
      .maybeSingle();
    if (updateError) throw new Error(updateError.message);
    if (!updated) throw new Error("No se pudo recuperar el entrenamiento adaptado");
    const { syncWorkoutEvent } = await import("./intervals.server");
    let intervalsEventId: string | null;
    try {
      intervalsEventId = await syncWorkoutEvent(supabaseAdmin, userId, updated, { strict: true });
    } catch (syncError) {
      await supabaseAdmin
        .from("workouts")
        .update({
          plan: workout.plan,
          duration_minutes: workout.duration_minutes,
          planned_tss: workout.planned_tss,
        })
        .eq("id", workout.id)
        .eq("user_id", userId);
      throw syncError;
    }
    action = "adapted";
    msg = `Registrado ${score}/5. ${adapted.message}\n\nNuevo entreno: ${adapted.title} (${durationMinutes} min).${intervalsEventId ? " Actualizado también en Intervals.icu." : ""}`;
  }

  await supabaseAdmin.from("readiness_entries").upsert(
    {
      user_id: userId,
      entry_date: today,
      score,
      note: text.slice(0, 500),
      ai_action: action,
      ai_message: msg,
      workout_id: workout?.id ?? null,
    },
    { onConflict: "user_id,entry_date" },
  );
  await telegramSend(chatId, msg);
}

export async function deleteTodayWorkout(opts: {
  supabaseAdmin: any;
  chatId: any;
  userId: string;
  workout: any | null;
}) {
  const { supabaseAdmin, chatId, userId, workout } = opts;
  if (!workout) {
    await telegramSend(chatId, "Hoy no tienes ningún entrenamiento pendiente que eliminar.");
    return;
  }
  const { removeWorkoutEvent } = await import("./intervals.server");
  let syncOk = true;
  try {
    await removeWorkoutEvent(supabaseAdmin, userId, workout, { strict: true });
  } catch {
    syncOk = false;
  }
  const { error: delErr } = await supabaseAdmin
    .from("workouts")
    .delete()
    .eq("id", workout.id)
    .eq("user_id", userId);
  if (delErr) throw new Error(delErr.message);
  await telegramSend(
    chatId,
    `🗑️ Entrenamiento de hoy eliminado. Descansa y recupera.\n${syncOk ? "Eliminado también en Intervals.icu." : "⚠️ No se ha podido eliminar en Intervals.icu."}`,
  );
}

export async function modifyTodayWorkout(opts: {
  supabaseAdmin: any;
  chatId: any;
  userId: string;
  workout: any | null;
  context: string;
  text: string;
  analysis: any;
}) {
  const { supabaseAdmin, chatId, userId, workout, context, text, analysis } = opts;
  if (!workout) {
    await telegramSend(chatId, "Hoy no tienes ningún entrenamiento pendiente que modificar.");
    return;
  }
  const { callAI, AdaptSchema } = await import("./readiness.server");
  const adapted = await callAI(
    [
      {
        role: "user",
        content: `Eres un entrenador profesional de ciclismo. Modifica el entrenamiento de hoy según la petición del ciclista.

PETICIÓN: "${analysis.change_request || text}"

${context}

ENTRENAMIENTO ORIGINAL (JSON): ${JSON.stringify({ ...(workout.plan as any), competition_id: undefined })}
Duración original: ${workout.duration_minutes} min · Bici: ${workout.bike_type}

INSTRUCCIONES:
1. Devuelve el entrenamiento COMPLETO con todos sus steps (calentamiento y vuelta a la calma incluidos).
2. Si hay FTP usa target='power' en vatios; si no target='hr' en bpm u 'open'.
3. name ≤ 15 caracteres. TODO en ESPAÑOL.
4. "message": explica en 1-2 frases qué has cambiado.`,
      },
    ],
    AdaptSchema,
    { fn: "telegram-modify", userId },
  );
  const requestedDate =
    typeof analysis.new_scheduled_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(analysis.new_scheduled_date)
      ? (analysis.new_scheduled_date as string)
      : null;
  const newPlan = {
    ...(workout.plan as any),
    name: adapted.name,
    title: adapted.title,
    summary: adapted.summary,
    steps: adapted.steps,
    ...(requestedDate ? { scheduled_date: requestedDate } : {}),
  };
  const newDuration = Math.max(15, Math.round(adapted.duration_minutes || workout.duration_minutes));
  const { data: updatedWorkout, error: modifyError } = await supabaseAdmin
    .from("workouts")
    .update({ plan: newPlan, duration_minutes: newDuration })
    .eq("id", workout.id)
    .eq("user_id", userId)
    .select()
    .maybeSingle();
  if (modifyError) throw new Error(modifyError.message);
  if (!updatedWorkout) throw new Error("No se pudo actualizar el entrenamiento");
  const { syncWorkoutEvent } = await import("./intervals.server");
  let syncOk = true;
  try {
    await syncWorkoutEvent(supabaseAdmin, userId, updatedWorkout, { strict: true });
  } catch {
    syncOk = false;
  }
  await telegramSend(
    chatId,
    `✅ ${adapted.message}\n\n${adapted.title} · ${newDuration} min${requestedDate ? ` · ${requestedDate}` : ""}\n${adapted.summary}\n\n${syncOk ? "Sincronizado con Intervals.icu." : "⚠️ No se ha podido sincronizar con Intervals.icu."}`,
  );
}

export async function updateProfileFields(opts: {
  supabaseAdmin: any;
  chatId: any;
  userId: string;
  updatesInput: Record<string, any>;
}) {
  const { supabaseAdmin, chatId, userId, updatesInput } = opts;
  const allowed = Object.keys(PROFILE_LABELS);
  const updates: Record<string, any> = {};
  for (const [k, v] of Object.entries(updatesInput)) {
    if (!allowed.includes(k) || v === null || v === undefined) continue;
    if (["weight_kg", "height_cm", "age", "ftp", "max_hr", "lthr", "weekly_duration_minutes", "readiness_push_hour"].includes(k)) {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) continue;
      updates[k] = ["weight_kg", "height_cm"].includes(k) ? n : Math.round(n);
    } else {
      updates[k] = v;
    }
  }
  if (!Object.keys(updates).length) {
    await telegramSend(chatId, "No he podido identificar qué dato de tu perfil quieres cambiar. Dime por ejemplo: \"mi peso es 72 kg\".");
    return;
  }
  if (updates.readiness_push_hour !== undefined) {
    updates.readiness_push_hour = Math.min(23, Math.max(0, updates.readiness_push_hour));
  }
  const { error } = await supabaseAdmin.from("profiles").update(updates as any).eq("id", userId);
  if (error) throw new Error(error.message);

  // Si cambian FTP/LTHR/FCmáx, actualiza zonas en Intervals.icu
  let extra = "";
  if (["ftp", "lthr", "max_hr"].some((k) => k in updates)) {
    try {
      const { intervalsPushZones } = await import("./intervals.server");
      await intervalsPushZones(supabaseAdmin, userId);
      extra = "\nZonas sincronizadas con Intervals.icu.";
    } catch {
      extra = "\n(No se han podido sincronizar las zonas con Intervals.icu)";
    }
  }
  const list = Object.entries(updates)
    .map(([k, v]) => `· ${PROFILE_LABELS[k] ?? k}: ${v}`)
    .join("\n");
  await telegramSend(chatId, `✅ Perfil actualizado:\n${list}${extra}`);
}

export async function swapMeal(opts: {
  supabaseAdmin: any;
  chatId: any;
  userId: string;
  profile: any;
  today: string;
  weekStart: string;
  todayMenu: any;
  nutriPlan: any;
  nutriRow: any;
  analysis: any;
  text: string;
}) {
  const { supabaseAdmin, chatId, userId, profile: p, today, weekStart, todayMenu, nutriPlan, nutriRow, analysis, text } = opts;
  if (!todayMenu || !nutriRow) {
    await telegramSend(chatId, "No tienes plan nutricional para hoy. Puedes generarlo desde la app en Menús.");
    return;
  }
  const key = (analysis.meal_key as string) || "comida";
  const original = (todayMenu as any)[key];
  if (!original) {
    await telegramSend(chatId, "No encuentro esa comida en el menú de hoy.");
    return;
  }
  const { callAI } = await import("./readiness.server");
  const newMeal = await callAI(
    [
      {
        role: "user",
        content: `Eres nutricionista deportivo de ciclismo. Sustituye esta comida (${key}) del menú de hoy por OTRA DISTINTA con macros similares (±10%).
Petición del ciclista: "${analysis.meal_request || text}"
Perfil: peso ${p.weight_kg ?? 70}kg · objetivo ${p.nutrition_goal} · preferencias: ${p.dietary_preferences || "ninguna"}
Entreno de hoy: ${todayMenu.entrenamiento ?? "n/a"}
Comida original (JSON): ${JSON.stringify(original)}
Incluye cantidades en gramos en cada ingrediente. TODO en ESPAÑOL.`,
      },
    ],
    MealSchema,
    { fn: "telegram-meal", userId },
  );
  const newPlan = {
    ...nutriPlan,
    dias: nutriPlan.dias.map((d: any) => (d.fecha === today ? { ...d, [key]: newMeal } : d)),
  };
  const { error } = await supabaseAdmin
    .from("weekly_nutrition_plans")
    .update({ plan: newPlan })
    .eq("user_id", userId)
    .eq("week_start", weekStart);
  if (error) throw new Error(error.message);
  const m = newMeal.macros ?? {};
  await telegramSend(
    chatId,
    `✅ ${key} actualizada: ${newMeal.nombre}\n\nIngredientes:\n${(newMeal.ingredientes ?? []).map((i: string) => `· ${i}`).join("\n")}\n\n${newMeal.preparacion}\n\n${Math.round(m.calorias_kcal ?? 0)} kcal · HC ${Math.round(m.carbohidratos_g ?? 0)}g · P ${Math.round(m.proteinas_g ?? 0)}g · G ${Math.round(m.grasas_g ?? 0)}g`,
  );
}
