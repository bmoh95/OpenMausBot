self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

async function show(payload) {
  if (!payload || typeof payload.title !== "string") return;
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  if (!payload.test && windows.some(client => client.focused && client.visibilityState === "visible")) return;
  const tag = `omb-push:${payload.id || "notice"}`;
  const existing = await self.registration.getNotifications({ tag });
  if (existing.length) return;
  await self.registration.showNotification(payload.title.slice(0, 120), {
    body: String(payload.body || "").slice(0, 300),
    icon: "/app-icon-192.png", badge: "/app-icon-192.png", tag,
    silent: payload.silent === true,
    data: { botId: payload.botId, threadId: payload.threadId },
  });
}

self.addEventListener("push", event => {
  let payload;
  try { payload = event.data?.json(); } catch { return; }
  event.waitUntil(show(payload));
});
self.addEventListener("message", event => {
  if (event.data?.type === "SHOW_NOTIFICATION") event.waitUntil(show(event.data.payload));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = event.notification.data || {};
  const hash = typeof target.botId === "string" && typeof target.threadId === "string"
    ? `#push=${encodeURIComponent(JSON.stringify({ botId: target.botId, threadId: target.threadId }))}` : "";
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const client = windows.find(window => new URL(window.url).origin === self.location.origin);
    if (client) {
      await client.focus();
      client.postMessage({ type: "OPEN_PUSH_NOTIFICATION", target });
    } else await self.clients.openWindow("/" + hash);
  })());
});
