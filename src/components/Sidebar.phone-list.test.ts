// @vitest-environment happy-dom
import { Children, isValidElement, type EffectCallback, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppState, Bot, Group } from "@/state/store";

const fixture = vi.hoisted(() => ({
  values: [] as unknown[], index: 0, phone: true,
  state: {} as AppState, dispatch: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = fixture.index++;
    if (!(index in fixture.values)) fixture.values[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
    return [fixture.values[index], (next: unknown) => {
      fixture.values[index] = typeof next === "function" ? (next as (value: unknown) => unknown)(fixture.values[index]) : next;
    }];
  },
  useRef: (initial: unknown) => {
    const index = fixture.index++;
    if (!(index in fixture.values)) fixture.values[index] = { current: initial };
    return fixture.values[index];
  },
  useCallback: (callback: unknown) => callback,
  useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(),
  useEffect: (_effect: EffectCallback) => {},
  useLayoutEffect: () => {},
}));
vi.mock("react-dom", () => ({ createPortal: (node: ReactNode) => node }));
vi.mock("./MenuMotion", () => ({
  useMenuMotion: (open: boolean) => ({ shown: open, closing: false, className: "", exitProps: {} }),
  useHeldMenuMotion: (value: unknown) => ({ shown: value !== null, value, closing: false, className: "", exitProps: {} }),
}));
vi.mock("./DesktopCapabilities", async () => {
  const { initialDesktopCapabilities } = await import("@/lib/desktop");
  return { useDesktopCapabilities: () => ({ capabilities: initialDesktopCapabilities() }), windowFramed: () => false };
});
vi.mock("@/lib/thread-preferences", () => ({ useShowThreads: () => false }));
vi.mock("@/lib/interface-mode", () => ({ useAdvancedMode: () => false, setAdvancedMode: () => {} }));
vi.mock("@/lib/use-owner-or-admin", () => ({ useOwnerOrAdmin: () => true }));
vi.mock("@/state/store", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/state/store")>();
  return { ...original, useStore: () => ({ state: fixture.state, dispatch: fixture.dispatch }) };
});

import { initialState } from "@/state/store";
import { PHONE_LAYOUT } from "@/lib/use-media-query";
import { Sidebar } from "./Sidebar";

const bot: Bot = {
  id: "atlas", threadId: "atlas-thread", name: "Atlas", title: "", description: "", notifications: true,
  color: "green", unread: false, modelSelection: { instanceId: "fake", model: "m" }, messages: [],
};
const room: Group = {
  id: "room", threadId: "room-thread", name: "Launch room", memberIds: ["atlas"], messages: [],
  defaultResponder: { kind: "mentions" }, bulletin: "", unread: false, createdAt: 1,
  tasks: [
    { threadId: "room-thread", title: "Launch room", createdAt: 1 },
    { threadId: "other-thread", title: "Follow up", createdAt: 2 },
  ],
};

type Props = { children?: ReactNode; onClick?: (event: { target: EventTarget }) => void; [key: string]: unknown };
function nodes(value: ReactNode): ReactElement<Props>[] {
  return Children.toArray(value).flatMap((child) => {
    if (!isValidElement<Props>(child)) return [];
    return [child, ...nodes(child.props.children)];
  });
}
function aside(open: boolean, onClose: () => void) {
  fixture.index = 0;
  fixture.values = [];
  const root = Sidebar({ open, onClose }) as ReactElement<Props>;
  const found = [root, ...nodes(root.props.children)].find((node) => node.type === "aside");
  if (!found?.props.onClick) throw new Error("sidebar has no dismiss handler");
  return found.props.onClick;
}

function row(attribute: string, id: string) {
  const button = document.createElement("button");
  button.setAttribute(attribute, id);
  const label = document.createElement("span");
  label.textContent = id;
  button.append(label);
  return label;
}

beforeEach(() => {
  fixture.phone = true;
  fixture.dispatch.mockClear();
  fixture.state = { ...initialState, bots: [bot], groups: [room], selectedId: room.id, activeView: "chat" };
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: fixture.phone && query === PHONE_LAYOUT,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("phone chat list", () => {
  it("closes when the group already on screen is chosen again", () => {
    const onClose = vi.fn();
    aside(true, onClose)({ target: row("data-sidebar-group-row", room.id) });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes when the current thread of that group is chosen", () => {
    const onClose = vi.fn();
    aside(true, onClose)({ target: row("data-sidebar-thread-row", room.threadId) });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("still closes for the bot chat already on screen", () => {
    const onClose = vi.fn();
    aside(true, onClose)({ target: row("data-sidebar-bot-row", bot.id) });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("stays open for the expand chevron, a new task, a rename field, and bulk select", () => {
    const onClose = vi.fn();
    const dismiss = aside(true, onClose);
    const chevron = document.createElement("button");
    chevron.textContent = "Expand";
    dismiss({ target: chevron });
    const plus = document.createElement("button");
    plus.textContent = "New task";
    dismiss({ target: plus });
    const field = document.createElement("input");
    const group = document.createElement("div");
    group.setAttribute("data-sidebar-group-row", room.id);
    group.append(field);
    dismiss({ target: field });
    const checkbox = row("data-sidebar-thread-row", room.threadId);
    checkbox.parentElement!.setAttribute("role", "checkbox");
    dismiss({ target: checkbox });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("stays open on a wide screen, and while the list is not covering the chat", () => {
    const onClose = vi.fn();
    fixture.phone = false;
    aside(true, onClose)({ target: row("data-sidebar-group-row", room.id) });
    fixture.phone = true;
    aside(false, onClose)({ target: row("data-sidebar-group-row", room.id) });
    expect(onClose).not.toHaveBeenCalled();
  });
});
