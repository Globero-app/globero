// PWA service worker registration wrapper.
// NOTE: por petición del usuario, el SW se registra SIEMPRE (incluido preview
// del editor Lovable, iframes y dev). Se mantiene únicamente el kill switch
// ?sw=off para poder desactivarlo puntualmente si algo va mal.

const APP_SW_URL = "/sw.js";

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

  if (killSwitch) {
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
      window.location.reload();
    });
    await wb.register();
  } catch (err) {
    console.warn("[pwa] registration failed", err);
  }
}
