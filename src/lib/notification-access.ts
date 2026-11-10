export const BLOCKED_NOTIFICATION_HELP = "알림이 차단돼 있어요. 삼성 인터넷의 설정 → 사이트 및 다운로드(또는 사이트 및 알림) → 알림에서 이 사이트를 허용하고, 휴대폰 설정 → 앱 → 삼성 인터넷 → 알림도 허용해 주세요. 다른 브라우저에서는 해당 브라우저의 사이트 알림 권한을 확인해 주세요.";

export function notificationStep<T>(work: PromiseLike<T>, message: string, timeoutMs = 25_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    Promise.resolve(work).then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

export function requestNotificationAccess(): Promise<NotificationPermission> {
  if (Notification.permission !== "default") return Promise.resolve(Notification.permission);
  // Older browser implementations resolve only the callback form of requestPermission.
  const request = new Promise<NotificationPermission>((resolve, reject) => {
    try {
      const result = Notification.requestPermission(resolve);
      if (result?.then) result.then(resolve, reject);
    } catch (error) { reject(error); }
  });
  return notificationStep(request, "브라우저의 알림 권한 응답이 없어요. 주소창 옆 사이트 권한과 브라우저·휴대폰의 알림 차단 여부를 확인한 뒤 다시 눌러 주세요.");
}
