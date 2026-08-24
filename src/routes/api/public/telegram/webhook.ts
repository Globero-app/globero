import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { telegramWebhookSecret, safeEqual, handleTelegramUpdate } = await import("@/lib/telegram.server");
        let expected: string;
        try {
          expected = telegramWebhookSecret();
        } catch {
          return new Response("Not configured", { status: 503 });
        }
        const got = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(got, expected)) return new Response("Unauthorized", { status: 401 });

        const update = await request.json();
        try {
          await handleTelegramUpdate(update);
        } catch (e: any) {
          console.error("telegram webhook error", e);
          const chatId = update?.message?.chat?.id ?? update?.edited_message?.chat?.id;
          if (chatId) {
            try {
              const { telegramSend } = await import("@/lib/telegram.server");
              await telegramSend(chatId, `⚠️ ${e?.message ?? "Error procesando tu mensaje"}`);
            } catch {}
          }
        }
        return Response.json({ ok: true });
      },
    },
  },
});
