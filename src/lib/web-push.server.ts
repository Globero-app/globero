import webpush from "web-push";

export interface PushSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  icon?: string;
  requireInteraction?: boolean;
  actions?: Array<{ action: string; title: string; icon?: string }>;
}


let configured = false;
function ensureConfigured() {
  if (configured) return;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
  if (!pub || !priv) throw new Error("Faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY");
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
}

/** Envía push a una suscripción. Devuelve false si la suscripción está caducada (410/404). */
export async function sendWebPush(sub: PushSub, payload: PushPayload): Promise<boolean> {
  ensureConfigured();
  try {
    await webpush.sendNotification(sub as any, JSON.stringify(payload), { TTL: 60 * 60 * 24 });
    return true;
  } catch (e: any) {
    const status = e?.statusCode;
    if (status === 404 || status === 410) return false;
    console.error("[web-push] error", status, e?.body || e?.message);
    return true; // conserva la suscripción; otro fallo temporal
  }
}

/** Registra el envío de una notificación (histórico para diagnóstico). */
export async function logNotification(
  userId: string,
  entry: { channel: string; title: string; body: string; status?: string; attempts?: number; error?: string | null },
) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("notification_log").insert({
      user_id: userId,
      channel: entry.channel,
      title: entry.title,
      body: entry.body,
      status: entry.status ?? "sent",
      attempts: entry.attempts ?? 1,
      error: entry.error ?? null,
    } as any);
  } catch (e) {
    console.error("[notify-log]", e);
  }
}

/** Reintenta una operación con backoff corto. */
async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<{ value?: T; attempts: number; error?: any }> {
  let lastErr: any;
  for (let i = 1; i <= tries; i++) {
    try {
      return { value: await fn(), attempts: i };
    } catch (e) {
      lastErr = e;
      if (i < tries) await new Promise((r) => setTimeout(r, 300 * i));
    }
  }
  return { attempts: tries, error: lastErr };
}

/** Envía push a todas las suscripciones de un usuario. Limpia caducadas. */
export async function notifyUser(userId: string, payload: PushPayload): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: prof } = await supabaseAdmin
    .from("profiles").select("notify_channel, telegram_chat_id").eq("id", userId).maybeSingle();
  const channel = ((prof as any)?.notify_channel as string) || "push";
  const chatId = (prof as any)?.telegram_chat_id as string | null;

  let tgSent = 0;
  if ((channel === "telegram" || channel === "both") && chatId) {
    const { telegramSend } = await import("./telegram.server");
    const res = await withRetry(() => telegramSend(chatId, `*${payload.title}*\n${payload.body}`.replace(/\*/g, "")));
    tgSent = res.error ? 0 : 1;
    await logNotification(userId, {
      channel: "telegram",
      title: payload.title,
      body: payload.body,
      status: res.error ? "failed" : "sent",
      attempts: res.attempts,
      error: res.error ? String(res.error?.message ?? res.error) : null,
    });
  }
  if (channel === "telegram" && chatId) return tgSent;

  const { sendNativeToUser } = await import("./native-push.server");
  const nativeSent = await sendNativeToUser(userId, payload).catch(() => 0);
  tgSent += nativeSent;
  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions").select("*").eq("user_id", userId);
  if (!subs || !subs.length) {
    if (!tgSent) {
      await logNotification(userId, { channel: "push", title: payload.title, body: payload.body, status: "skipped", error: "Sin suscripciones push" });
    }
    return tgSent;
  }
  let sent = 0;
  for (const s of subs as any[]) {
    const ok = await sendWebPush(
      { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      payload,
    );
    if (ok) sent++;
    else await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
  }
  await logNotification(userId, {
    channel: "push",
    title: payload.title,
    body: payload.body,
    status: sent ? "sent" : "failed",
    error: sent ? null : "Ninguna suscripción aceptó el envío",
  });
  return sent + tgSent;
}




/** Envía push únicamente (sin enrutar a Telegram). */
export async function notifyUserPushOnly(userId: string, payload: PushPayload): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions").select("*").eq("user_id", userId);
  const { sendNativeToUser } = await import("./native-push.server");
  let sent = await sendNativeToUser(userId, payload).catch(() => 0);
  if (!subs || !subs.length) return sent;
  for (const s of subs as any[]) {
    const ok = await sendWebPush(
      { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      payload,
    );
    if (ok) sent++;
    else await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
  }
  await logNotification(userId, { channel: "push", title: payload.title, body: payload.body, status: sent ? "sent" : "failed" });
  return sent;
}
