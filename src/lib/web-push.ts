import { api } from "../state/api";
import { BLOCKED_NOTIFICATION_HELP } from "./notification-access";
import { finishedNotificationsEnabled, notificationSoundsEnabled } from "./notification-preferences";
import { samsungInternet, subscribePreparedPush, pushWorker } from "./push-subscription";
export { pushSupported, pushWorker } from "./push-subscription";

const PUSH_ENABLED = "omb-web-push-enabled";
export function pushEnabled(): boolean {
  try { return localStorage.getItem(PUSH_ENABLED) === "1"; } catch { return false; }
}
function wire(subscription: PushSubscription) {
  const data = subscription.toJSON();
  return { endpoint: subscription.endpoint, keys: data.keys };
}
export async function savePushPreferences(current?: PushSubscription) {
  const subscription = current ?? await (await pushWorker()).pushManager.getSubscription();
  if (!subscription) throw new Error("이 기기의 푸시 구독이 없어요. 알림을 다시 켜 주세요.");
  await api("/api/web-push/subscription", { method: "POST", body: JSON.stringify({
    subscription: wire(subscription), sounds: notificationSoundsEnabled(), finished: finishedNotificationsEnabled(),
  }), timeoutMs: 15_000 });
}
export async function enablePush(progress: (message: string) => void = () => {}) {
  if (typeof Notification === "undefined") throw new Error("이 브라우저는 알림을 지원하지 않아요.");
  if (Notification.permission === "denied") throw new Error(BLOCKED_NOTIFICATION_HELP);
  if (Notification.permission !== "granted") throw new Error("먼저 위의 기기 알림을 켜 주세요. 권한 요청과 푸시 구독은 따로 진행합니다.");
  const pending = subscribePreparedPush();
  progress("푸시 구독을 연결하고 있어요. 알림 권한은 이미 허용되어 있어 권한 창은 다시 뜨지 않습니다.");
  const subscription = await pending;
  progress("푸시 구독을 서버에 저장하고 있어요…");
  await savePushPreferences(subscription);
  localStorage.setItem(PUSH_ENABLED, "1");
  progress("백그라운드 푸시 알림을 켰어요. 테스트 알림을 보내 확인해 주세요.");
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
export async function testPush(): Promise<{ deliversInMs: number }> {
  const registration = await pushWorker();
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) throw new Error("먼저 백그라운드 알림을 켜 주세요.");
  // The server also waits when it sees Samsung Internet. This timer covers the case where the page is still alive in the background.
  const delayMs = samsungInternet() ? 8_000 : 0;
  const id = `test-${Date.now()}`;
  if (delayMs) window.setTimeout(() => {
    void registration.showNotification("OpenMausBot", {
      body: "테스트 알림이 도착했어요.", icon: "/app-icon-192.png", tag: `omb-push:${id}`, data: {},
    }).catch(() => {});
  }, delayMs);
  await api("/api/web-push/test", { method: "POST", body: JSON.stringify({ subscription: wire(subscription), id, ...(delayMs ? { delayMs } : {}) }), timeoutMs: 15_000 });
  return { deliversInMs: delayMs };
}
