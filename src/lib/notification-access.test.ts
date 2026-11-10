import { afterEach, expect, it, vi } from "vitest";
import { notificationStep, requestNotificationAccess } from "./notification-access";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it("requests permission synchronously in the click's call stack", async () => {
  const order: string[] = [];
  vi.stubGlobal("Notification", { permission: "default", requestPermission: () => {
    order.push("permission"); return Promise.resolve("granted");
  } });
  const result = requestNotificationAccess();
  order.push("after click handler");
  expect(order).toEqual(["permission", "after click handler"]);
  expect(await result).toBe("granted");
});

it("supports browsers that only complete the permission callback", async () => {
  vi.stubGlobal("Notification", { permission: "default", requestPermission: (done: (permission: string) => void) => { done("granted"); } });
  expect(await requestNotificationAccess()).toBe("granted");
});

it("does not prompt again when the browser has blocked notifications", async () => {
  const requestPermission = vi.fn();
  vi.stubGlobal("Notification", { permission: "denied", requestPermission });
  expect(await requestNotificationAccess()).toBe("denied");
  expect(requestPermission).not.toHaveBeenCalled();
});

it("times out a silent permission prompt rather than leaving the switch busy forever", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("Notification", { permission: "default", requestPermission: () => new Promise(() => {}) });
  const result = expect(requestNotificationAccess()).rejects.toThrow("응답이 없어요");
  await vi.advanceTimersByTimeAsync(25_000);
  await result;
});

it("bounds service worker and push service waits and preserves failures", async () => {
  vi.useFakeTimers();
  const pending = expect(notificationStep(new Promise(() => {}), "service unavailable", 50)).rejects.toThrow("service unavailable");
  await vi.advanceTimersByTimeAsync(50);
  await pending;
  await expect(notificationStep(Promise.reject(new Error("original")), "timeout")).rejects.toThrow("original");
  expect(vi.getTimerCount()).toBe(0);
});
