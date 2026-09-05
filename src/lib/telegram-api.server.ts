/** Llamadas al Bot API de Telegram vía gateway (solo servidor). */
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
