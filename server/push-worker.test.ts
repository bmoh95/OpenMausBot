import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function worker(focused = false) {
  const listeners = new Map<string, (event: any) => void>();
  const showNotification = vi.fn().mockResolvedValue(undefined);
  const openWindow = vi.fn().mockResolvedValue(undefined);
  const windows = focused ? [{ focused: true, visibilityState: "visible", url: "https://maus.test/", focus: vi.fn(), postMessage: vi.fn() }] : [];
  const self = { location: { origin: "https://maus.test" }, skipWaiting: vi.fn(),
    addEventListener: (kind: string, run: (event: any) => void) => listeners.set(kind, run),
    registration: { showNotification, getNotifications: vi.fn().mockResolvedValue([]) },
    clients: { matchAll: vi.fn().mockResolvedValue(windows), openWindow, claim: vi.fn() } };
  runInNewContext(readFileSync(new URL("../public/push-sw.js", import.meta.url), "utf8"), { self, URL });
  return { self, listeners, showNotification, openWindow, windows };
}
describe("PWA push worker", () => {
  it("displays an encrypted-push payload when no page is open and opens the target conversation", async () => {
    const f = worker();
    let waited: Promise<void> = Promise.resolve();
    f.listeners.get("push")!({ data: { json: () => ({ id: "n1", title: "OpenMausBot", body: "done", botId: "b1", threadId: "t1" }) }, waitUntil: (p: Promise<void>) => { waited = p; } });
    await waited;
    expect(f.showNotification).toHaveBeenCalledWith("OpenMausBot", expect.objectContaining({ tag: "omb-push:n1", vibrate: [180, 80, 180], data: { botId: "b1", threadId: "t1" } }));
    f.listeners.get("notificationclick")!({ notification: { close: vi.fn(), data: { botId: "b1", threadId: "t1" } }, waitUntil: (p: Promise<void>) => { waited = p; } });
    await waited;
    const target = f.openWindow.mock.calls[0][0] as string;
    expect(target.startsWith("/#push=")).toBe(true);
    expect(JSON.parse(decodeURIComponent(target.slice(7)))).toEqual({ botId: "b1", threadId: "t1" });
  });
  it("shows a real notice while the app is focused, and still shows the explicit test", async () => {
    const f = worker(true);
    let waited = Promise.resolve();
    const push = (test: boolean) => f.listeners.get("push")!({ data: { json: () => ({ id: test ? "test" : "n1", title: "Test", test }) }, waitUntil: (p: Promise<void>) => { waited = p; } });
    push(false); await waited;
    expect(f.showNotification).toHaveBeenCalledTimes(1);
    push(true); await waited;
    expect(f.showNotification).toHaveBeenCalledTimes(2);
  });

  it("still shows a notice when the installed app delivers no readable payload", async () => {
    const f = worker();
    let waited = Promise.resolve();
    f.listeners.get("push")!({ data: { json: () => { throw new Error("no payload"); } }, waitUntil: (p: Promise<void>) => { waited = p; } });
    await waited;
    expect(f.showNotification).toHaveBeenCalledWith("OpenMausBot", expect.objectContaining({ body: "새 알림이 있어요." }));
  });

  it("does not attach a vibration to a silent notice", async () => {
    const f = worker();
    let waited = Promise.resolve();
    f.listeners.get("push")!({ data: { json: () => ({ id: "quiet", title: "OpenMausBot", silent: true }) }, waitUntil: (p: Promise<void>) => { waited = p; } });
    await waited;
    const options = f.showNotification.mock.calls[0]?.[1] as { silent?: boolean; vibrate?: number[] };
    expect(options.silent).toBe(true);
    expect(options.vibrate).toBeUndefined();
  });
});
