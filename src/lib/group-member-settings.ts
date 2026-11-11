import type { Action } from "@/state/store";

type RoomSelection = {
  activeView: string;
  selectedId: string;
  settingsOpen: boolean;
  settingsBotId?: string | null;
  groups: readonly { id: string }[];
};

/**
 * Opens that bot's settings. From a room the room stays on screen and the panel covers it, the same panel a
 * one-to-one chat opens from the bot's name. A second tap on the same bot closes it. A face on another room
 * opens that room first, then the panel over it. From anywhere else the bot becomes the open chat.
 */
export function openRoomMemberSettings(
  dispatch: (action: Action) => void,
  state: RoomSelection,
  botId: string,
  roomId?: string,
): void {
  const listed = (id: string) => state.groups.some((group) => group.id === id);
  const target = roomId && listed(roomId) ? roomId : null;
  const inTarget = target
    ? state.activeView === "chat" && state.selectedId === target
    : state.activeView === "chat" && listed(state.selectedId);
  if (target && !inTarget) {
    dispatch({ type: "select", id: target });
    dispatch({ type: "toggleSettings", open: true, botId, keepRoom: true });
    return;
  }
  if (!inTarget) {
    dispatch({ type: "toggleSettings", open: true, botId });
    return;
  }
  if (state.settingsOpen && state.settingsBotId === botId) {
    dispatch({ type: "toggleSettings", open: false });
    return;
  }
  dispatch({ type: "toggleSettings", open: true, botId, keepRoom: true });
}
