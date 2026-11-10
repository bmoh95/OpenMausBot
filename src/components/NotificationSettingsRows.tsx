import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import {
  setFinishedNotifications,
  setNotificationFeed,
  setNotificationSounds,
  useFinishedNotifications,
  useNotificationFeed,
  useNotificationSounds,
} from "@/lib/notification-preferences";
import { SettingRow, Switch } from "./SettingsPrimitives";
import { WebPushSettings } from "./WebPushSettings";
import { BLOCKED_NOTIFICATION_HELP, requestNotificationAccess } from "@/lib/notification-access";
import { pushSupported } from "@/lib/push-subscription";

export function NotificationRows({ simple = false }: { simple?: boolean }) {
  return (
    <>
      <DeviceNotificationsRow simple={simple} />
      <WebPushSettings />
      <NotificationSoundsRow simple={simple} />
      <NotificationFeedRow simple={simple} />
    </>
  );
}

const currentPermission = (): NotificationPermission => (typeof Notification !== "undefined" ? Notification.permission : "default");

/** A browser shows nothing until it is asked from a click; the person may also change the site permission elsewhere. */
export function DeviceNotificationsRow({ simple = false }: { simple?: boolean }) {
  const [permission, setPermission] = useState(currentPermission);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const enabled = useFinishedNotifications();
  const pushHint = () => pushSupported() && !window.ogb?.desktopNotifications
    ? "앱을 닫아도 받으려면 아래 백그라운드 푸시 알림을 켜 주세요." : "";
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") setPermission(currentPermission());
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  if (typeof Notification === "undefined") return null;

  const blocked = permission === "denied";
  const toggle = async () => {
    const live = currentPermission();
    if (live !== permission) setPermission(live);
    if (live === "denied") return setNotice(BLOCKED_NOTIFICATION_HELP);
    if (live === "granted") {
      const nextEnabled = !enabled;
      setFinishedNotifications(nextEnabled);
      setNotice(nextEnabled ? pushHint() : "");
      return;
    }
    setBusy(true);
    setNotice("브라우저에 알림 권한을 요청하고 있어요…");
    try {
      const next = await requestNotificationAccess();
      setPermission(next);
      if (next === "granted") { setFinishedNotifications(true); setNotice(pushHint()); }
      else setNotice(next === "denied" ? BLOCKED_NOTIFICATION_HELP : "알림 요청이 닫혔어요. 다시 눌러 허용해 주세요.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "알림 권한을 확인하지 못했어요."); }
    finally { setBusy(false); }
  };

  return (
    <SettingRow
      title={t("settings.deviceNotifications.title")}
      subtitle={t(blocked ? "settings.deviceNotifications.blocked" : simple ? "settings.simple.deviceNotifications" : "settings.deviceNotifications.subtitle")}
      message={notice ? <span role="status">{notice}</span> : undefined}
    >
      <Switch
        checked={permission === "granted" && enabled}
        disabled={busy}
        aria-label={t("settings.deviceNotifications.show")}
        onClick={() => void toggle()}
      />
    </SettingRow>
  );
}

export function NotificationSoundsRow({ simple = false }: { simple?: boolean }) {
  const enabled = useNotificationSounds();
  return (
    <SettingRow title={t("settings.notificationSounds.title")} subtitle={t(simple ? "settings.simple.notificationSounds" : "settings.notificationSounds.subtitle")}>
      <Switch
        checked={enabled}
        aria-label={t("settings.notificationSounds.play")}
        onClick={() => setNotificationSounds(!enabled)}
      />
    </SettingRow>
  );
}

export function NotificationFeedRow({ simple = false }: { simple?: boolean }) {
  const enabled = useNotificationFeed();
  return (
    <SettingRow title={t("settings.notificationFeed.title")} subtitle={t(simple ? "settings.simple.notificationFeed" : "settings.notificationFeed.subtitle")}>
      <Switch
        checked={enabled}
        aria-label={t("settings.notificationFeed.show")}
        onClick={() => setNotificationFeed(!enabled)}
      />
    </SettingRow>
  );
}
