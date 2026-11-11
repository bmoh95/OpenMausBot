self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

function iconUrl(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("..") || value.length > 240) return "/app-icon-192.png";
  return value;
}
function show(payload) {
  const body = payload && typeof payload === "object" ? payload : {};
  const title = typeof body.title === "string" && body.title ? body.title : "OpenMausBot";
  const silent = body.silent === true;
  // Show immediately. A vibration pattern is what makes Samsung post a heads-up
  // after the app has left the screen; silent and vibrate together are rejected.
  const options = {
    body: String(body.body || "새 알림이 있어요.").slice(0, 300),
    icon: iconUrl(body.icon),
    tag: `omb-push:${body.id || "notice"}`,
    renotify: true,
    silent,
    data: { botId: body.botId, threadId: body.threadId },
  };
  if (!silent) options.vibrate = [180, 80, 180];
  return self.registration.showNotification(title.slice(0, 120), options);
}

self.addEventListener("push", event => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { payload = {}; }
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
