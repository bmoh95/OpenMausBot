import { api } from "../state/api";
import { BLOCKED_NOTIFICATION_HELP, notificationStep } from "./notification-access";

type PreparedPush = { registration: ServiceWorkerRegistration; key: Uint8Array<ArrayBuffer> };
let prepared: PreparedPush | undefined;
let preparing: Promise<PreparedPush> | undefined;

export function pushSupported() {
  return window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function samsungInternet() { return /SamsungBrowser\//i.test(navigator.userAgent); }

export async function pushWorker(): Promise<ServiceWorkerRegistration> {
  await notificationStep(navigator.serviceWorker.register("/push-sw.js", { scope: "/", updateViaCache: "none" }), "알림 서비스 등록이 지연되고 있어요. 새로고침 후 다시 시도해 주세요.");
  return notificationStep(navigator.serviceWorker.ready, "알림 서비스가 시작되지 않았어요. 브라우저를 다시 열고 시도해 주세요.");
}

export function preparePush(): Promise<PreparedPush> {
  if (!preparing) preparing = (async () => {
    const [{ publicKey }, registration] = await Promise.all([
      api<{ publicKey: string }>("/api/web-push/key", { timeoutMs: 15_000 }), pushWorker(),
    ]);
    const key = Uint8Array.from(atob(publicKey.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
    const subscription = await notificationStep(registration.pushManager.getSubscription(), "기존 푸시 구독을 확인하지 못했어요. 브라우저를 다시 열어 주세요.");
    const previousKey = subscription?.options.applicationServerKey;
    if (subscription && previousKey && Array.from(new Uint8Array(previousKey)).join() !== Array.from(key).join())
      await notificationStep(subscription.unsubscribe(), "이전 알림 설정을 해제하지 못했어요. 브라우저를 다시 열어 주세요.");
    return prepared = { registration, key };
  })().catch(error => { preparing = undefined; prepared = undefined; throw error; });
  return preparing;
}

/** subscribe must run in the click's call stack: do not await setup or requestPermission before it.
 * https://codelabs.developers.google.com/codelabs/push-notifications#4 */
export function subscribePreparedPush(): Promise<PushSubscription> {
  if (Notification.permission === "denied") return Promise.reject(new Error(BLOCKED_NOTIFICATION_HELP));
  if (!prepared) {
    void preparePush().catch(() => {});
    return Promise.reject(new Error("알림 서비스를 준비하고 있어요. 잠시 후 스위치를 다시 눌러 주세요."));
  }
  return notificationStep(prepared.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: prepared.key }),
    "브라우저의 푸시 권한 요청이 응답하지 않아요. 삼성 인터넷의 사이트 알림·앱 알림 허용 여부를 확인하고 일반 탭에서 다시 시도해 주세요.")
    .catch(error => {
      if (Notification.permission === "denied" || error?.name === "NotAllowedError") throw new Error(BLOCKED_NOTIFICATION_HELP);
      throw error;
    });
}

export async function requestPreparedPushPermission(): Promise<NotificationPermission> {
  await subscribePreparedPush();
  return "granted";
}
