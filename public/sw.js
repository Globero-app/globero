/* Service worker para push notifications del servidor */
self.addEventListener("install", (e) => { self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(self.clients.claim()); });

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: "Globero", body: event.data ? event.data.text() : "" }; }
  const title = data.title || "Globero";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icon-192.png",
    badge: data.badge || "/icon-192.png",
    tag: data.tag || "sb-push",
    data: { url: data.url || "/", ...data },
    requireInteraction: !!data.requireInteraction,
    actions: Array.isArray(data.actions) ? data.actions.slice(0, 3) : undefined,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let url = (event.notification.data && event.notification.data.url) || "/";
  const action = event.action || "";
  const m = /^readiness-(\d)$/.exec(action);
  if (m) url = "/readiness?score=" + m[1];
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if ("focus" in c) { try { await c.navigate(url); } catch (_) {} return c.focus(); }
    }
    if (self.clients.openWindow) return self.clients.openWindow(url);
  })());
});
