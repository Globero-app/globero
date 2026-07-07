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