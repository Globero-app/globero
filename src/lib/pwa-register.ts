// PWA service worker registration wrapper.
// Guarded to NEVER register in dev, Lovable preview, or iframes.
// Supports ?sw=off kill switch.

const APP_SW_URL = "/sw.js";

function isPreviewHost(hostname: string) {
  if (hostname.startsWith("id-preview--") || hostname.startsWith("preview--")) return true;
  if (hostname === "lovableproject.com" || hostname.endsWith(".lovableproject.com")) return true;
  if (hostname === "lovableproject-dev.com" || hostname.endsWith(".lovableproject-dev.com"))
    return true;
  if (hostname === "beta.lovable.dev" || hostname.endsWith(".beta.lovable.dev")) return true;
  return false;
}

async function unregisterAppServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs
        .filter((r) => {
          const url = r.active?.scriptURL ?? r.installing?.scriptURL ?? r.waiting?.scriptURL ?? "";
          return url.endsWith(APP_SW_URL);
        })
        .map((r) => r.unregister()),
    );
  } catch {
    /* ignore */
  }
}

export async function registerPWA() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  const url = new URL(window.location.href);
  const killSwitch = url.searchParams.get("sw") === "off";
  const inIframe = window.top !== window.self;
  const isProd = import.meta.env.PROD;
  const hostname = window.location.hostname;

  if (!isProd || inIframe || isPreviewHost(hostname) || killSwitch) {
    await unregisterAppServiceWorkers();
    return;
  }

  try {
    const { Workbox } = await import("workbox-window");
    const wb = new Workbox(APP_SW_URL);
    wb.addEventListener("waiting", () => {
      wb.messageSkipWaiting();
    });
    wb.addEventListener("controlling", () => {
      // New SW took control — reload to get fresh assets.
      window.location.reload();
    });
    await wb.register();
  } catch (err) {
    console.warn("[pwa] registration failed", err);
  }
}
