// Envío de notificaciones nativas (Android/iOS) vía Firebase Cloud Messaging.
// Inactivo hasta conectar Firebase (FIREBASE_MESSAGING_API_KEY).
import type { PushPayload } from "./web-push.server";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/firebase_messaging";

export async function sendNativeToUser(userId: string, payload: PushPayload): Promise<number> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const fcmKey = process.env.FIREBASE_MESSAGING_API_KEY;
  if (!lovableKey || !fcmKey) return 0;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows } = await supabaseAdmin.from("device_push_tokens").select("token").eq("user_id", userId);
  let sent = 0;
  for (const r of rows ?? []) {
    const res = await fetch(`${GATEWAY_URL}/v1/projects/_/messages:send`, {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": fcmKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token: r.token,
          notification: { title: payload.title, body: payload.body },
          data: { url: payload.url ?? "/", tag: payload.tag ?? "" },
          android: { notification: { tag: payload.tag } },
          apns: { payload: { aps: { sound: "default" } } },
        },
      }),
    });
    if (res.ok) { sent++; continue; }
    const body = await res.text();
    if (res.status === 404 || (res.status === 400 && body.includes("INVALID_ARGUMENT"))) {
      await supabaseAdmin.from("device_push_tokens").delete().eq("token", r.token);
    } else console.error(`[fcm] ${res.status}: ${body}`);
  }
  return sent;
}
