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

/** Envía push a todas las suscripciones de un usuario. Limpia caducadas. */
export async function notifyUser(userId: string, payload: PushPayload): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions").select("*").eq("user_id", userId);
  if (!subs || !subs.length) return 0;
  let sent = 0;
  for (const s of subs as any[]) {
    const ok = await sendWebPush(
      { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
      payload,
    );
    if (ok) sent++;
    else await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
  }
  return sent;
}