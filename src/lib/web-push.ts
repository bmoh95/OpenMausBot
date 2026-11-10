import { api } from "../state/api";
import { finishedNotificationsEnabled, notificationSoundsEnabled } from "./notification-preferences";
import { subscribePreparedPush, pushWorker } from "./push-subscription";
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
  const pending = subscribePreparedPush();
  progress("브라우저의 푸시 알림 허용 창을 확인해 주세요. 허용 후 구독을 연결합니다…");
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
export async function testPush() {
  const subscription = await (await pushWorker()).pushManager.getSubscription();
  if (!subscription) throw new Error("먼저 백그라운드 알림을 켜 주세요.");
  await api("/api/web-push/test", { method: "POST", body: JSON.stringify({ subscription: wire(subscription) }), timeoutMs: 15_000 });
}
