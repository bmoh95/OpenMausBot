import { useEffect, useRef } from "react";
import type { NotificationTarget } from "./notify";

export function usePushNotificationNavigation(ready: boolean, onOpen: (target: NotificationTarget) => void) {
  const openTarget = useRef(onOpen);
  openTarget.current = onOpen;
  useEffect(() => {
    if (!ready || !("serviceWorker" in navigator)) return;
    const open = (target: unknown) => {
      if (!target || typeof target !== "object") return;
      const candidate = target as { botId?: unknown; threadId?: unknown };
      if (typeof candidate.botId === "string" && typeof candidate.threadId === "string")
        openTarget.current({ botId: candidate.botId, threadId: candidate.threadId });
    };
    const message = (event: MessageEvent) => { if (event.data?.type === "OPEN_PUSH_NOTIFICATION") open(event.data.target); };
    navigator.serviceWorker.addEventListener("message", message);
    if (location.hash.startsWith("#push=")) {
      try { open(JSON.parse(decodeURIComponent(location.hash.slice(6)))); } catch { /* Ignore invalid navigation data. */ }
      history.replaceState(null, "", location.pathname + location.search);
    }
    return () => navigator.serviceWorker.removeEventListener("message", message);
  }, [ready]);
}
