import { api } from "../state/api";
import { finishedNotificationsEnabled, notificationSoundsEnabled } from "./notification-preferences";
import { BLOCKED_NOTIFICATION_HELP, notificationStep, requestNotificationAccess } from "./notification-access";

const PUSH_ENABLED = "omb-web-push-enabled";
export function pushSupported() {
  return window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}
export function pushEnabled(): boolean {
  try { return localStorage.getItem(PUSH_ENABLED) === "1"; } catch { return false; }
}
export async function pushWorker(): Promise<ServiceWorkerRegistration> {
  await notificationStep(navigator.serviceWorker.register("/push-sw.js", { scope: "/", updateViaCache: "none" }), "알림 서비스 등록이 지연되고 있어요. 새로고침 후 다시 시도해 주세요.");
  return notificationStep(navigator.serviceWorker.ready, "알림 서비스가 시작되지 않았어요. 브라우저를 다시 열고 시도해 주세요.");
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
  }), timeoutMs: 15_000 });
}
export async function enablePush(progress: (message: string) => void = () => {}) {
  progress("브라우저에 알림 권한을 요청하고 있어요. 허용 창이 뜨면 허용해 주세요.");
  const permission = await requestNotificationAccess();
  if (permission !== "granted") throw new Error(permission === "denied" ? BLOCKED_NOTIFICATION_HELP : "알림 권한 요청이 닫혔어요. 다시 눌러 허용해 주세요.");
  progress("서버의 알림 설정을 확인하고 있어요…");
  const { publicKey } = await api<{ publicKey: string }>("/api/web-push/key", { timeoutMs: 15_000 });
  const key = Uint8Array.from(atob(publicKey.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
  progress("이 브라우저의 알림 서비스를 준비하고 있어요…");
  const registration = await pushWorker();
  let subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    const old = subscription.options.applicationServerKey;
    if (old && Array.from(new Uint8Array(old)).join() !== Array.from(key).join()) {
      await subscription.unsubscribe();
      subscription = null;
    }
  }
  progress("브라우저의 푸시 서비스에 연결하고 있어요…");
  if (!subscription) subscription = await notificationStep(registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }), "브라우저의 푸시 서비스가 응답하지 않아요. 네트워크와 브라우저의 알림 설정을 확인해 주세요.");
  progress("푸시 구독을 서버에 저장하고 있어요…");
  await savePushPreferences();
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
