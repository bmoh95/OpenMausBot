import { api } from "../state/api";
import { finishedNotificationsEnabled, notificationSoundsEnabled } from "./notification-preferences";

const PUSH_ENABLED = "omb-web-push-enabled";
export function pushSupported() {
  return window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}
export function pushEnabled(): boolean {
  try { return localStorage.getItem(PUSH_ENABLED) === "1"; } catch { return false; }
}
export async function pushWorker(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register("/push-sw.js", { scope: "/", updateViaCache: "none" });
  return navigator.serviceWorker.ready;
}
function wire(subscription: PushSubscription) {
  const data = subscription.toJSON();
  return { endpoint: subscription.endpoint, keys: data.keys };
}
export async function savePushPreferences() {
  const registration = await pushWorker();
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) throw new Error("이 기기의 푸시 구독이 없어요. 알림을 다시 켜 주세요.");
  await api("/api/web-push/subscription", { method: "POST", body: JSON.stringify({
    subscription: wire(subscription), sounds: notificationSoundsEnabled(), finished: finishedNotificationsEnabled(),
  }) });
}
export async function enablePush() {
  if (await Notification.requestPermission() !== "granted") throw new Error("브라우저에서 알림을 허용해 주세요.");
  const { publicKey } = await api<{ publicKey: string }>("/api/web-push/key");
  const key = Uint8Array.from(atob(publicKey.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
  const registration = await pushWorker();
  let subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    const old = subscription.options.applicationServerKey;
    if (old && Array.from(new Uint8Array(old)).join() !== Array.from(key).join()) {
      await subscription.unsubscribe();
      subscription = null;
    }
  }
  if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await savePushPreferences();
  localStorage.setItem(PUSH_ENABLED, "1");
}
export async function disablePush() {
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await api("/api/web-push/subscription", { method: "DELETE", body: JSON.stringify({ subscription: wire(subscription) }) });
    await subscription.unsubscribe();
  }
  localStorage.removeItem(PUSH_ENABLED);
}
export async function testPush() {
  const subscription = await (await pushWorker()).pushManager.getSubscription();
  if (!subscription) throw new Error("먼저 백그라운드 알림을 켜 주세요.");
  await api("/api/web-push/test", { method: "POST", body: JSON.stringify({ subscription: wire(subscription) }), timeoutMs: 15_000 });
}
