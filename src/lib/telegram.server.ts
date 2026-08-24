/** Helpers de servidor para el Bot de Telegram (no importar desde el cliente). */
import { createHash, timingSafeEqual } from "crypto";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

function creds() {
  const lovable = process.env.LOVABLE_API_KEY;
  const telegram = process.env.TELEGRAM_API_KEY;
  if (!lovable) throw new Error("LOVABLE_API_KEY no configurada");
  if (!telegram) throw new Error("TELEGRAM_API_KEY no configurada");
  return { lovable, telegram };
}

export async function telegramCall(method: string, body: Record<string, unknown> = {}) {
  const { lovable, telegram } = creds();
  const res = await fetch(`${GATEWAY_URL}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovable}`,
      "X-Connection-Api-Key": telegram,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Telegram ${res.status}: ${text.slice(0, 300)}`);
  }
  const json: any = await res.json();
  if (json?.ok === false) throw new Error(`Telegram: ${json.description ?? "error"}`);
  return json.result;
}

export async function telegramSend(chatId: string | number, text: string) {
  const chunks = String(text).match(/[\s\S]{1,3800}/g) ?? ["…"];
  for (const chunk of chunks) {
    await telegramCall("sendMessage", { chat_id: chatId, text: chunk });
  }
}

export async function telegramBotUsername(): Promise<string | null> {
  try {
    const me: any = await telegramCall("getMe");
    return me?.username ?? null;
  } catch {
    return null;
  }
}

export function telegramWebhookSecret(): string {
  const { telegram } = creds();
  return createHash("sha256").update(`telegram-webhook:${telegram}`).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

const IntentSchema = {
  type: "object",
  properties: {
    intent: {
      type: "string",
      enum: ["chat", "set_readiness", "modify_workout", "update_profile", "swap_meal"],
      description:
        "set_readiness si indica cómo se encuentra hoy; modify_workout si pide cambiar el entreno de hoy; update_profile si pide cambiar un dato de su perfil (peso, altura, edad, FTP, FCmáx, LTHR, objetivo nutricional, duración por defecto, base de entreno potencia/fc, hora del aviso de readiness); swap_meal si pide cambiar/sustituir una comida del menú de hoy; chat en el resto (incluidas preguntas sobre menú, recetas, zonas, FTP, métricas)",
    },
    readiness_score: { type: "number", description: "1-5 solo si intent=set_readiness" },
    change_request: { type: "string", description: "Qué cambio pide en el entreno, solo si intent=modify_workout" },
    meal_key: {
      type: "string",
      enum: ["desayuno", "media_manana", "comida", "merienda", "cena"],
      description: "Comida a sustituir, solo si intent=swap_meal",
    },
    meal_request: { type: "string", description: "Preferencias para la nueva comida, solo si intent=swap_meal" },
    profile_updates: {
      type: "object",
      description: "Solo si intent=update_profile. Incluye únicamente los campos a cambiar",
      properties: {
        weight_kg: { type: "number" },
        height_cm: { type: "number" },
        age: { type: "number" },
        ftp: { type: "number" },
        max_hr: { type: "number" },
        lthr: { type: "number" },
        nutrition_goal: { type: "string", enum: ["perdida_peso", "mantenimiento", "masa_muscular"] },
        nutrition_plan_enabled: { type: "boolean" },
        weekly_duration_minutes: { type: "number" },
        weekly_target_basis: { type: "string", enum: ["power", "hr"] },
        readiness_push_hour: { type: "number" },
        zones_display_mode: { type: "string", enum: ["watts", "hr"] },
      },
    },
    reply: { type: "string", description: "Respuesta breve en español para el chat (se usa si intent=chat)" },
  },
  required: ["intent", "reply"],
};

const MealSchema = {
  type: "object",
  properties: {
    nombre: { type: "string" },
    ingredientes: { type: "array", items: { type: "string" }, description: "Ingredientes con cantidades en gramos" },
    preparacion: { type: "string" },
    macros: {
      type: "object",
      properties: {
        carbohidratos_g: { type: "number" },
        proteinas_g: { type: "number" },
        grasas_g: { type: "number" },
        calorias_kcal: { type: "number" },
      },
      required: ["carbohidratos_g", "proteinas_g", "grasas_g", "calorias_kcal"],
    },
  },
  required: ["nombre", "ingredientes", "preparacion", "macros"],
};

const PROFILE_LABELS: Record<string, string> = {
  weight_kg: "Peso (kg)",
  height_cm: "Altura (cm)",
  age: "Edad",
  ftp: "FTP (W)",
  max_hr: "FC máx (bpm)",
  lthr: "Umbral FC (bpm)",
  nutrition_goal: "Objetivo nutricional",
  nutrition_plan_enabled: "Plan nutricional",
  weekly_duration_minutes: "Duración por defecto (min)",
  weekly_target_basis: "Base del entreno",
  readiness_push_hour: "Hora del aviso de readiness",
  zones_display_mode: "Zonas mostradas en",
};

function formatMeal(key: string, meal: any): string {
  if (!meal) return "";
  const m = meal.macros ?? {};
  return `${key}: ${meal.nombre} — ${Math.round(m.calorias_kcal ?? 0)} kcal · HC ${Math.round(m.carbohidratos_g ?? 0)}g · P ${Math.round(m.proteinas_g ?? 0)}g · G ${Math.round(m.grasas_g ?? 0)}g`;
}


/** Procesa un update de Telegram. Devuelve true si se ha respondido. */
export async function handleTelegramUpdate(update: any): Promise<void> {
  const message = update?.message ?? update?.edited_message;
  const chatId = message?.chat?.id;
  const text: string = (message?.text ?? "").trim();
  if (!chatId || !text) return;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { madridToday, callAI, AdaptSchema, pickTodayWorkout, buildAdaptPrompt, READINESS_LABELS } = await import(
    "./readiness.server"
  );
  const today = madridToday();

  // /start CODIGO -> vinculación
  const startMatch = text.match(/^\/start(?:\s+(\S+))?/i);
  if (startMatch) {
    const code = startMatch[1];
    if (!code) {
      await telegramSend(chatId, "Hola 👋 Para vincular tu cuenta, entra en la app → Perfil → Conectar Telegram y pulsa el botón.");
      return;
    }
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .eq("linking_code", code)
      .maybeSingle();
    if (!profile) {
      await telegramSend(chatId, "❌ Código no válido o caducado. Genera uno nuevo en la app (Perfil → Conectar Telegram).");
      return;
    }
    await supabaseAdmin
      .from("profiles")
      .update({ telegram_chat_id: String(chatId), linking_code: null })
      .eq("id", (profile as any).id);
    await telegramSend(
      chatId,
      `✅ Cuenta vinculada, ${(profile as any).full_name ?? "ciclista"}.\n\nYa puedes escribirme:\n· "hoy me encuentro a 4" para registrar tu readiness\n· "pásame el entreno de hoy a rodillo 1h" para adaptarlo\n· o preguntarme cualquier duda sobre tu entrenamiento.`,
    );
    return;
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("telegram_chat_id", String(chatId))
    .maybeSingle();

  if (!profile) {
    await telegramSend(chatId, "No reconozco este chat. Vincula tu cuenta desde la app: Perfil → Conectar Telegram.");
    return;
  }
  const userId = (profile as any).id as string;

  const { data: pending } = await supabaseAdmin
    .from("workouts")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const workout = pickTodayWorkout((pending ?? []) as any[], today);

  const { data: readinessToday } = await supabaseAdmin
    .from("readiness_entries")
    .select("score,note,ai_message")
    .eq("user_id", userId)
    .eq("entry_date", today)
    .maybeSingle();

  // Entrenos de la semana (pendientes + completados recientes)
  const { weekStartISO } = await import("./nutrition-gen.server");
  const weekStart = weekStartISO(new Date(`${today}T12:00:00Z`));
  const weekEnd = new Date(`${weekStart}T12:00:00Z`);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const weekEndISO = weekEnd.toISOString().slice(0, 10);

  const { data: allWorkouts } = await supabaseAdmin
    .from("workouts")
    .select("id,status,duration_minutes,bike_type,plan,completed_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(200);

  const weekWorkouts = ((allWorkouts ?? []) as any[])
    .map((w) => ({ ...w, date: w.plan?.scheduled_date ?? null }))
    .filter((w) => w.date && w.date >= weekStart && w.date <= weekEndISO)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map(
      (w) =>
        `${w.date}: ${w.plan?.title ?? "—"} · ${w.duration_minutes} min · ${w.bike_type} · ${w.status}${w.plan?.summary ? ` — ${w.plan.summary}` : ""}`,
    );

  // Plan nutricional de la semana / día
  const { data: nutriRow } = await supabaseAdmin
    .from("weekly_nutrition_plans")
    .select("week_start,goal,plan")
    .eq("user_id", userId)
    .eq("week_start", weekStart)
    .maybeSingle();

  const nutriPlan = (nutriRow as any)?.plan ?? null;
  const todayMenu = nutriPlan?.dias?.find((d: any) => d.fecha === today) ?? null;
  const menuText = todayMenu
    ? [
        `Objetivos: ${Math.round(todayMenu.objetivo_calorias_kcal ?? 0)} kcal · HC ${Math.round(todayMenu.objetivo_carbohidratos_g ?? 0)}g · P ${Math.round(todayMenu.objetivo_proteinas_g ?? 0)}g`,
        formatMeal("Desayuno", todayMenu.desayuno),
        formatMeal("Media mañana", todayMenu.media_manana),
        formatMeal("Comida", todayMenu.comida),
        formatMeal("Merienda", todayMenu.merienda),
        formatMeal("Cena", todayMenu.cena),
        `Detalle completo (JSON): ${JSON.stringify(todayMenu)}`,
      ]
        .filter(Boolean)
        .join("\n")
    : "sin plan nutricional para hoy";

  // Zonas
  const { computePowerZones, computeHrZones } = await import("./zones");
  const pz = computePowerZones((profile as any).ftp);
  const hz = computeHrZones((profile as any).lthr, (profile as any).max_hr);
  const zonesText = [
    pz ? `Potencia: ${pz.map((z) => `${z.label} ${z.low}-${z.high === Infinity ? "∞" : z.high}W`).join(" | ")}` : "Potencia: sin FTP",
    hz ? `FC: ${hz.map((z) => `${z.label} ${z.low}-${z.high === Infinity ? "∞" : z.high}bpm`).join(" | ")}` : "FC: sin LTHR/FCmáx",
  ].join("\n");

  const p: any = profile;
  const context = `FECHA: ${today} (semana ${weekStart} → ${weekEndISO})
PERFIL: ${p.full_name ?? "—"} · edad ${p.age ?? "n/a"} · sexo ${p.gender ?? "n/a"} · peso ${p.weight_kg ?? "n/a"}kg · altura ${p.height_cm ?? "n/a"}cm · FTP ${p.ftp ?? "n/a"}W · FCmáx ${p.max_hr ?? "n/a"} · LTHR ${p.lthr ?? "n/a"}
AJUSTES: base entreno ${p.weekly_target_basis} · duración por defecto ${p.weekly_duration_minutes} min · bici ${p.weekly_bike_type} · días entreno ${JSON.stringify(p.weekly_training_days)} · tirada larga ${p.weekly_long_ride_day ?? "n/a"} · plan nutricional ${p.nutrition_plan_enabled ? "activo" : "desactivado"} (objetivo ${p.nutrition_goal}) · aviso readiness ${p.readiness_push_hour}:00 · zonas mostradas en ${p.zones_display_mode} · preferencias dietéticas: ${p.dietary_preferences || "ninguna"}
READINESS DE HOY: ${readinessToday ? `${(readinessToday as any).score}/5 — ${READINESS_LABELS[(readinessToday as any).score]}` : "sin registrar"}
ENTRENO DE HOY: ${workout ? JSON.stringify({ title: workout.plan?.title, summary: workout.plan?.summary, duration_minutes: workout.duration_minutes, bike_type: workout.bike_type, steps: workout.plan?.steps }) : "no hay entreno pendiente"}
ENTRENOS DE LA SEMANA:
${weekWorkouts.length ? weekWorkouts.join("\n") : "sin entrenos esta semana"}
MENÚ DE HOY:
${menuText}
RESUMEN NUTRICIONAL SEMANAL: ${nutriPlan?.resumen ?? "n/a"}
ZONAS DE ENTRENAMIENTO:
${zonesText}`;


  const analysis = await callAI(
    [
      {
        role: "system",
        content: `Eres el entrenador de ciclismo y nutricionista del usuario dentro de un bot de Telegram. Respondes SIEMPRE en español, en texto plano, breve y claro (sin markdown).
Puedes responder a cualquier pregunta sobre su cuenta: entrenos de la semana, menú del día y recetas (ingredientes, cantidades, macros), zonas de potencia y de frecuencia cardíaca, FTP, LTHR, FCmáx y demás métricas del perfil. Si la respuesta está en el contexto, dala con datos concretos; nunca te la inventes.
Escala de readiness: 1 Nada preparado, 2 Paseo relajado, 3 Entreno normal, 4 Entreno exigente, 5 Dar lo máximo.
Contexto actual:
${context}`,
      },
      { role: "user", content: text },
    ],
    IntentSchema,
  );

  if (analysis.intent === "set_readiness" && analysis.readiness_score >= 1 && analysis.readiness_score <= 5) {
    const score = Math.round(analysis.readiness_score);
    let action: "none" | "suggest_delete" | "adapted" = "none";
    let msg = "";

    if (!workout) {
      msg = `Registrado: ${score}/5 — ${READINESS_LABELS[score]}. Hoy no tienes entreno pendiente.`;
    } else if (score === 1) {
      action = "suggest_delete";
      msg = `Registrado 1/5. Hoy mejor descansa: te sugiero eliminar la sesión "${workout.plan?.title ?? "de hoy"}" y priorizar sueño e hidratación.`;
    } else {
      const { data: hist } = await supabaseAdmin
        .from("readiness_entries")
        .select("entry_date,score")
        .eq("user_id", userId)
        .order("entry_date", { ascending: false })
        .limit(14);
      const adapted = await callAI(
        [{ role: "user", content: buildAdaptPrompt({ score, note: text, profile, workout, history: (hist ?? []) as any[] }) }],
        AdaptSchema,
      );
      const newPlan = {
        ...(workout.plan as any),
        name: adapted.name,
        title: adapted.title,
        summary: adapted.summary,
        steps: adapted.steps,
        readiness_adapted: { score, date: today, message: adapted.message },
      };
      await supabaseAdmin
        .from("workouts")
        .update({ plan: newPlan, duration_minutes: Math.max(15, Math.round(adapted.duration_minutes || workout.duration_minutes)) })
        .eq("id", workout.id)
        .eq("user_id", userId);
      const { syncWorkoutEvent } = await import("./intervals.server");
      await syncWorkoutEvent(supabaseAdmin, userId, { ...workout, plan: newPlan });
      action = "adapted";
      msg = `Registrado ${score}/5. ${adapted.message}\n\nNuevo entreno: ${adapted.title} (${Math.round(adapted.duration_minutes)} min). Actualizado también en Intervals.icu.`;
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
    return;
  }

  if (analysis.intent === "modify_workout") {
    if (!workout) {
      await telegramSend(chatId, "Hoy no tienes ningún entrenamiento pendiente que modificar.");
      return;
    }
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
    );
    const newPlan = {
      ...(workout.plan as any),
      name: adapted.name,
      title: adapted.title,
      summary: adapted.summary,
      steps: adapted.steps,
    };
    await supabaseAdmin
      .from("workouts")
      .update({ plan: newPlan, duration_minutes: Math.max(15, Math.round(adapted.duration_minutes || workout.duration_minutes)) })
      .eq("id", workout.id)
      .eq("user_id", userId);
    const { syncWorkoutEvent } = await import("./intervals.server");
    await syncWorkoutEvent(supabaseAdmin, userId, { ...workout, plan: newPlan });
    await telegramSend(
      chatId,
      `✅ ${adapted.message}\n\n${adapted.title} · ${Math.round(adapted.duration_minutes)} min\n${adapted.summary}\n\nSincronizado con Intervals.icu.`,
    );
    return;
  }

  if (analysis.intent === "update_profile" && analysis.profile_updates && Object.keys(analysis.profile_updates).length) {
    const allowed = Object.keys(PROFILE_LABELS);
    const updates: Record<string, any> = {};
    for (const [k, v] of Object.entries(analysis.profile_updates as Record<string, any>)) {
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
    const { error } = await supabaseAdmin.from("profiles").update(updates).eq("id", userId);
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
    return;
  }

  if (analysis.intent === "swap_meal") {
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
    return;
  }

  await telegramSend(chatId, analysis.reply || "No te he entendido, ¿puedes reformularlo?");
}
