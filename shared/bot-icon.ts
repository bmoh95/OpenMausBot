import { botAvatarProfile } from "./bot-avatar.ts";
import { botBodyId, isFestival, wornBody, type FestivalId } from "./bot-body.ts";
import type { MausColor } from "./wire.ts";

export interface BotIconFace {
  color: string;
  mascotBody?: string | null;
  avatarUrl?: string | null;
  avatarCrop?: string | null;
}

const COLORS = new Set(["green", "blue", "red", "orange", "purple", "cyan", "pink", "yellow", "teal", "coral", "silver", "chrome"]);

function colorOf(value: string): MausColor {
  return COLORS.has(value) ? value as MausColor : "green";
}

/** The picture a lock-screen banner should use for this bot: its photo, or the face it wears right now. */
export function notificationBotIcon(face: BotIconFace, festival: FestivalId | null): string {
  const profile = botAvatarProfile(face);
  if (profile.avatarCrop !== "mascot" && profile.avatarUrl) return profile.avatarUrl;
  const color = colorOf(face.color);
  const own = botBodyId(face.mascotBody);
  const body = wornBody(own, color, festival) ?? own;
  return `/bot-icons/${body}-${color}.png`;
}

export function pushFestival(value: unknown): FestivalId | null {
  return isFestival(value) ? value : null;
}
