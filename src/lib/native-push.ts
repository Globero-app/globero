// Notificaciones nativas (Capacitor) en Android/iOS. En navegador no hace nada.
import { Capacitor } from "@capacitor/core";
import { saveDeviceToken, removeDeviceToken } from "./push-server.functions";

export const isNativePush = () => Capacitor.isNativePlatform();

export async function enableNativePush(): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") perm = await PushNotifications.requestPermissions();
  if (perm.receive !== "granted") return { ok: false, reason: "Permiso denegado" };
  const platform = Capacitor.getPlatform() as "android" | "ios";
  const token = await new Promise<string>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Sin respuesta del servicio de notificaciones")), 15000);
    PushNotifications.addListener("registration", (r) => { clearTimeout(t); resolve(r.value); });
    PushNotifications.addListener("registrationError", (e) => { clearTimeout(t); reject(new Error(e.error)); });
    PushNotifications.register();
  }).catch((e: Error) => e);
  if (token instanceof Error) return { ok: false, reason: token.message };
  localStorage.setItem("native-push-token", token);
  await saveDeviceToken({ data: { token, platform } });
  PushNotifications.addListener("pushNotificationActionPerformed", (a) => {
    const url = (a.notification.data as any)?.url;
    if (typeof url === "string" && url.startsWith("/")) window.location.href = url;
  });
  return { ok: true };
}

export async function disableNativePush(): Promise<void> {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  const token = localStorage.getItem("native-push-token");
  try { await PushNotifications.unregister(); } catch (_) {}
  if (token) { try { await removeDeviceToken({ data: { token } }); } catch (_) {} localStorage.removeItem("native-push-token"); }
}
