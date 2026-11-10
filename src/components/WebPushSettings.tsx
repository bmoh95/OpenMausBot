import { useEffect, useState } from "react";
import { disablePush, enablePush, pushEnabled, pushSupported, savePushPreferences, testPush } from "@/lib/web-push";
import { useFinishedNotifications, useNotificationSounds } from "@/lib/notification-preferences";
import { SettingRow, Switch } from "./SettingsPrimitives";

export function WebPushSettings() {
  const [enabled, setEnabled] = useState(pushEnabled);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const sounds = useNotificationSounds();
  const finished = useFinishedNotifications();
  useEffect(() => {
    if (enabled && pushSupported()) void savePushPreferences().catch(error => setNotice(error.message));
  }, [enabled, sounds, finished]);
  if (!pushSupported() || window.ogb?.desktopNotifications) return null;
  const run = async (work: () => Promise<void>) => {
    setBusy(true); setNotice("");
    try { await work(); } catch (error) { setNotice(error instanceof Error ? error.message : "푸시 설정을 저장하지 못했어요."); }
    finally { setBusy(false); }
  };
  return <>
    <SettingRow title="백그라운드 푸시 알림" subtitle="앱을 닫거나 화면을 꺼도 작업 완료·승인·질문 알림을 받아요. 이 기기의 알림 권한이 필요해요.">
      <Switch checked={enabled} disabled={busy} aria-label="백그라운드 푸시 알림" onClick={() => void run(async () => {
        if (enabled) await disablePush(); else await enablePush(setNotice);
        setEnabled(pushEnabled());
      })} />
    </SettingRow>
    {enabled && <button type="button" disabled={busy} onClick={() => void run(async () => {
      await testPush(); setNotice("테스트 알림을 전송했어요. 기기의 알림을 확인해 주세요.");
    })} className="rounded-lg bg-control px-3 py-2 text-[13px] disabled:opacity-40">테스트 알림 보내기</button>}
    {notice && <p role="status" className="mt-2 text-[12px] text-ink-secondary">{notice}</p>}
  </>;
}
