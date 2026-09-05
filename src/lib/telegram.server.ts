/** Orquestador del Bot de Telegram (no importar desde el cliente). */
export {
  telegramCall,
  telegramSend,
  telegramBotUsername,
  telegramWebhookSecret,
  safeEqual,
} from "./telegram-api.server";

import { telegramSend } from "./telegram-api.server";
import { IntentSchema } from "./telegram-schemas.server";
import { handleStartCommand, handleQuickCommand } from "./telegram-commands.server";
import { buildTelegramContext } from "./telegram-context.server";
import {
  applyReadiness,
  deleteTodayWorkout,
  modifyTodayWorkout,
  updateProfileFields,
  swapMeal,
} from "./telegram-actions.server";

/** Procesa un update de Telegram. */
export async function handleTelegramUpdate(update: any): Promise<void> {
  const message = update?.message ?? update?.edited_message;
  const chatId = message?.chat?.id;
  const text: string = (message?.text ?? "").trim();
  if (!chatId || !text) return;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { madridToday, callAI } = await import("./readiness.server");
  const today = madridToday();

  if (await handleStartCommand(supabaseAdmin, chatId, text)) return;

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

  const cmd = await handleQuickCommand(supabaseAdmin, chatId, userId, profile, text);
  if (cmd === true) return;
  if (typeof cmd === "object" && cmd.rerunAs) {
    return handleTelegramUpdate({ message: { chat: { id: chatId }, text: cmd.rerunAs } });
  }

  const { context, workout, todayMenu, nutriPlan, nutriRow, weekStart } = await buildTelegramContext(
    supabaseAdmin,
    profile,
    today,
  );

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
    { fn: "telegram-intent", userId },
  );

  if (analysis.intent === "set_readiness" && analysis.readiness_score >= 1 && analysis.readiness_score <= 5) {
    await applyReadiness({ supabaseAdmin, chatId, userId, profile, workout, today, text, score: analysis.readiness_score });
    return;
  }

  if (analysis.intent === "delete_workout") {
    await deleteTodayWorkout({ supabaseAdmin, chatId, userId, workout });
    return;
  }

  if (analysis.intent === "modify_workout") {
    await modifyTodayWorkout({ supabaseAdmin, chatId, userId, workout, context, text, analysis });
    return;
  }

  if (analysis.intent === "update_profile" && analysis.profile_updates && Object.keys(analysis.profile_updates).length) {
    await updateProfileFields({ supabaseAdmin, chatId, userId, updatesInput: analysis.profile_updates });
    return;
  }

  if (analysis.intent === "swap_meal") {
    await swapMeal({
      supabaseAdmin,
      chatId,
      userId,
      profile,
      today,
      weekStart,
      todayMenu,
      nutriPlan,
      nutriRow,
      analysis,
      text,
    });
    return;
  }

  await telegramSend(chatId, analysis.reply || "No te he entendido, ¿puedes reformularlo?");
}
