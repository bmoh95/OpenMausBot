import { plainPreviewText } from "./plain-preview.ts";
import { redactSecretsInText } from "./redact.ts";
import type { Notification } from "../packages/phone-protocol/src/notification.ts";

export * from "../packages/phone-protocol/src/notification.ts";

/** Lock-screen copy: the bot's name, and a short plain line of what it said. */
export function notificationBanner(notification: Pick<Notification, "kind" | "botName" | "body">): { title: string; body: string } {
  const title = notification.botName.replace(/\s+/g, " ").trim().slice(0, 80);
  const reply = redactSecretsInText(plainPreviewText(notification.body)).replace(/\s+/g, " ").trim().slice(0, 240);
  return {
    title: title || "OpenMausBot",
    body: reply || (notification.kind === "done" ? "작업이 완료됐어요." : "확인이 필요한 새 알림이 있어요."),
  };
}
