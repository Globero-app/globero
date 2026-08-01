/* Registro de service worker y suscripción Web Push (cliente) */
import { saveSubscription, removeSubscription } from "./push-server.functions";

// Clave pública VAPID (segura de publicar por diseño).
export const VAPID_PUBLIC_KEY =
  "BF7hZmfLS2GJA3iQlq__xM7MrdIVhPfklMCtki5CWi8Uz1sw9Xla6LrPRDHy2imfDLKf0Uu8zYrgO_E9zFQPfFA";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function serverPushSupported(): boolean {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!serverPushSupported()) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (e) {
    console.error("SW register failed", e);
    return null;
  }
}

export async function getServerPushSubscription(): Promise<PushSubscription | null> {
  if (!serverPushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return await reg.pushManager.getSubscription();
}

export async function enableServerPush(): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!serverPushSupported()) return { ok: false, reason: "Tu navegador no soporta Web Push" };
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: "Permiso denegado" };
  const reg = await registerServiceWorker();
  if (!reg) return { ok: false, reason: "No se pudo registrar el service worker" };
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
    });
  }
  const json = sub.toJSON() as any;
  await saveSubscription({
    data: {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      user_agent: navigator.userAgent,
    },
  });
  return { ok: true };
}

export async function disableServerPush(): Promise<void> {
  if (!serverPushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  try { await sub.unsubscribe(); } catch (_) {}
  try { await removeSubscription({ data: { endpoint } }); } catch (_) {}
}