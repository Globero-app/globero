import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getTelegramStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("profiles")
      .select("telegram_chat_id, linking_code")
      .eq("id", userId)
      .maybeSingle();
    const { telegramBotUsername } = await import("./telegram.server");
    return {
      connected: !!(data as any)?.telegram_chat_id,
      linking_code: (data as any)?.linking_code ?? null,
      bot_username: await telegramBotUsername(),
    };
  });

export const generateTelegramCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const code = `sb${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
    const { error } = await supabase
      .from("profiles")
      .update({ linking_code: code, telegram_chat_id: null })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    const { telegramBotUsername } = await import("./telegram.server");
    return { code, bot_username: await telegramBotUsername() };
  });

export const disconnectTelegram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("profiles")
      .update({ telegram_chat_id: null, linking_code: null })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
