import { BotAvatar } from "./Avatar";
import { cn } from "@/lib/cn";
import { t } from "@/lib/i18n";
import { openRoomMemberSettings } from "@/lib/group-member-settings";
import { MAUS_COLOR_NAMES, normalizeState, type MausColor } from "@/lib/mascot";
import { useStore, type Bot } from "@/state/store";

function isPaletteColor(color: string): color is MausColor {
  return (MAUS_COLOR_NAMES as readonly string[]).includes(color);
}

export function ClusterLabel({ bot, name, color }: { bot?: Bot; name: string; color: string }) {
  const { state, dispatch } = useStore();
  const known = isPaletteColor(color);
  const face = (
    <BotAvatar
      bot={bot ?? { name, color: color as Bot["color"] }}
      state={normalizeState(bot?.mascotExpression) ?? "happy"}
      size={16}
      motion="none"
      motionKey={0}
      animated={false}
      readable={known}
    />
  );
  const label = (
    <span
      className={cn("text-[11px] font-medium", known ? "bot-identity" : "text-ink-secondary")}
      data-bot-color={known ? color : undefined}
    >{name}</span>
  );
  if (!bot?.id) {
    return <div className="mt-1 flex items-center gap-1.5 pl-0.5">{face}{label}</div>;
  }
  return (
    <button
      type="button"
      data-room-member={bot.id}
      title={t("chat.openBotPanel")}
      aria-label={t("chat.openProfileAria", { name })}
      onClick={() => openRoomMemberSettings(dispatch, state, bot.id)}
      className="mt-1 flex items-center gap-1.5 rounded-md pl-0.5 text-left hover:bg-raised/60"
    >
      {face}{label}
    </button>
  );
}
