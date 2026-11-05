// Notificaciones nativas (Capacitor) en Android/iOS. En navegador no hace nada.
import { Capacitor } from "@capacitor/core";
import { toast } from "sonner";
import { saveDeviceToken, removeDeviceToken } from "./push-server.functions";

export const isNativePush = () => Capacitor.isNativePlatform();

let nativeListenersReady = false;

// LocalNotifications no es obligatorio: si el binario del APK no lo incluye,
// mostramos el aviso en primer plano con un toast en su lugar.
async function showLocalForegroundNotification(title: string, body: string, extra: unknown): Promise<boolean> {
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== "granted") return false;
    await LocalNotifications.schedule({
      notifications: [{
        id: Date.now() % 2147483647,
        title,
        body,
        extra: extra as any,
      }],
    });
    return true;
  } catch (error) {
    console.error("No se pudo mostrar la notificación en primer plano", error);
    toast.message(title, { description: body });
    return false;
  }
}

async function ensureNativeListeners(): Promise<void> {
  if (nativeListenersReady) return;
  nativeListenersReady = true;
  const { PushNotifications } = await import("@capacitor/push-notifications");

  await PushNotifications.addListener("pushNotificationReceived", async (notification) => {
    // Android entrega el push a la WebView cuando la app está abierta, pero no lo
    // muestra en la bandeja automáticamente. Lo convertimos en notificación local.
    try {
      await showLocalForegroundNotification(
        notification.title ?? "Globero",
        notification.body ?? "",
        notification.data ?? {},
      );
    } catch (error) {
      console.error("No se pudo mostrar la notificación en primer plano", error);
    }
  });

  await PushNotifications.addListener("pushNotificationActionPerformed", (a) => {
    const url = (a.notification.data as any)?.url;
    if (typeof url === "string" && url.startsWith("/")) window.location.href = url;
  });
}

export async function enableNativePush(): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === "prompt" || perm.receive === "prompt-with-rationale") perm = await PushNotifications.requestPermissions();
  if (perm.receive !== "granted") return { ok: false, reason: "Permiso denegado" };

  // LocalNotifications es opcional: si falta en el binario, seguimos sin bloquear.
  try {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const localPerm = await LocalNotifications.checkPermissions();
    if (localPerm.display !== "granted") await LocalNotifications.requestPermissions();
  } catch (error) {
    console.error("LocalNotifications no disponible en este binario", error);
  }
  await ensureNativeListeners();

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
  return { ok: true };
}

export async function disableNativePush(): Promise<void> {
  const { PushNotifications } = await import("@capacitor/push-notifications");
  const token = localStorage.getItem("native-push-token");
  try { await PushNotifications.unregister(); } catch (_) {}
  if (token) { try { await removeDeviceToken({ data: { token } }); } catch (_) {} localStorage.removeItem("native-push-token"); }
}
