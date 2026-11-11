import { notificationBanner, type Notification } from "../../shared/notification";
import { plainPreviewText } from "../../shared/plain-preview";
import { finishedNotificationsEnabled, notificationSoundsEnabled } from "./notification-preferences";
import { pushEnabled, pushWorker } from "./web-push";
import { samsungInternet } from "./push-subscription";
import { requestNotificationAccess } from "./notification-access";

export type NotifyFrame = Notification;

export type NotificationTarget = Pick<NotifyFrame, "botId" | "threadId">;

/** On a team's page in the desktop app, its name: notifications then say which place they come from ("Acme · Scout"). */
let placeName: string | null = null;
export function setNotificationPlace(name: string | null) {
  placeName = name;
}

/** Call from the click: browsers may reject a permission request made later from an SSE frame. Resolves to the permission now in force. */
export async function requestNotificationPermission(): Promise<NotificationPermission | null> {
  if (typeof Notification === "undefined") return null;
  try {
    return await requestNotificationAccess();
  } catch {
    return Notification.permission;
  }
}

export interface NotificationBotIdentity {
  id: string;
  avatarUrl?: string | null;
}

export function buildNotificationOptions(bot: NotificationBotIdentity): NotificationOptions {
  return { tag: `openmausbot:${bot.id}`, icon: bot.avatarUrl ?? undefined };
}

function pageBackgrounded(): boolean {
  try { return document.visibilityState === "hidden" || document.hasFocus() === false; } catch { return false; }
}

/** Samsung often never runs the push worker after the app leaves the screen, while this page can still be alive. */
function showSamsungBackgroundNotice(frame: NotifyFrame) {
  const carried = (frame as NotifyFrame & { id?: unknown }).id;
  const id = typeof carried === "string" && carried ? carried : `${frame.kind}:${frame.threadId}`;
  const silent = !notificationSoundsEnabled();
  const banner = notificationBanner(frame);
  void pushWorker().then(registration => registration.showNotification(banner.title, {
    body: banner.body,
    icon: "/app-icon-192.png",
    tag: `omb-push:${id}`,
    ...(silent ? { silent: true } : {}),
    data: { botId: frame.botId, threadId: frame.threadId },
  })).catch(() => {});
}

export function showNotification(
  frame: NotifyFrame,
  onOpen: (target: NotificationTarget) => void,
  avatarUrl?: string | null,
  visibleThreadId?: string | null,
) {
  if (typeof Notification === "undefined") return;
  if (frame.kind === "done" && !finishedNotificationsEnabled()) return;
  const spend = frame.kind === "spend";
  if (!spend && document.hasFocus() && visibleThreadId === frame.threadId) return;
  if (Notification.permission !== "granted") return;
  if (pushEnabled()) {
    if (samsungInternet() && pageBackgrounded()) showSamsungBackgroundNotice(frame);
    return;
  }

  const title = placeName ? `${placeName} · ${frame.title}` : frame.title;
  // Entries saved before the harness spoke plain text still carry Markdown.
  const body = plainPreviewText(frame.body);
  const options: NotificationOptions = {
    body,
    ...buildNotificationOptions({ id: frame.botId, avatarUrl }),
    ...(spend ? { tag: "openmausbot:spend", icon: undefined } : {}),
    ...(notificationSoundsEnabled() ? {} : { silent: true }),
  };
  const shownByPage = () => {
    if ("serviceWorker" in navigator && window.isSecureContext) {
      void pushWorker().then(registration => registration.showNotification(title, {
        ...options, data: { botId: frame.botId, threadId: frame.threadId },
      })).catch(() => {});
      return;
    }
    new Notification(title, options).onclick = () => {
      window.focus();
      onOpen({ botId: frame.botId, threadId: frame.threadId });
    };
  };
  const desktop = window.ogb?.desktopNotifications;
  if (!desktop) return shownByPage();
  void desktop.show({
    title, body, tag: options.tag, silent: options.silent === true, picture: options.icon, botId: frame.botId, threadId: frame.threadId,
  }).then((shown) => { if (!shown) shownByPage(); }, shownByPage);
}
