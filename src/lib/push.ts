// Helper para lanzar notificaciones locales del navegador (Notification API).
// Sirve para eventos que ocurren cuando la app está abierta o al arrancar la PWA.
// Añade dedupe por tag+día en localStorage para no repetir el mismo aviso.

export type PushCategory = "training" | "prerace" | "strava" | "maintenance";

const STORAGE_PREFIX = "sb-push:";

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function pushPermission(): NotificationPermission | "unsupported" {
  if (!pushSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestPushPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  return await Notification.requestPermission();
}

interface SendOptions {
  title: string;
  body: string;
  tag: string;              // agrupa/reemplaza notificaciones existentes
  category: PushCategory;
  /** Deduplicación: "day" (una vez al día), "hour" (una vez cada 60 min) o "none" */
  dedupe?: "day" | "hour" | "none";
  url?: string;             // ruta a abrir al hacer click
}

export function sendLocalPush(opts: SendOptions): boolean {
  if (!pushSupported() || Notification.permission !== "granted") return false;

  if (opts.dedupe && opts.dedupe !== "none") {
    const key = `${STORAGE_PREFIX}${opts.category}:${opts.tag}`;
    const last = Number(localStorage.getItem(key) ?? 0);
    const windowMs = opts.dedupe === "day" ? 20 * 60 * 60 * 1000 : 60 * 60 * 1000;
    if (Date.now() - last < windowMs) return false;
    localStorage.setItem(key, String(Date.now()));
  }

  try {
    const n = new Notification(opts.title, {
      body: opts.body,
      icon: "/icon-192.png",
      badge: "/favicon.ico",
      tag: opts.tag,
    });
    if (opts.url) {
      n.onclick = () => {
        window.focus();
        window.location.href = opts.url!;
        n.close();
      };
    }
    return true;
  } catch {
    return false;
  }
}
