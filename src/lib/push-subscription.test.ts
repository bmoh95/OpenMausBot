import { afterEach, beforeEach, expect, it, vi } from "vitest";

const request = vi.hoisted(() => vi.fn());
vi.mock("../state/api", () => ({ api: request }));
const key = Uint8Array.from({ length: 65 }, (_, i) => i);
let subscribe: ReturnType<typeof vi.fn>;
let permission: NotificationPermission;
let getSubscription: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  request.mockReset().mockResolvedValue({ publicKey: Buffer.from(key).toString("base64url") });
  permission = "default";
  subscribe = vi.fn(async () => ({ endpoint: "https://fcm.googleapis.com/fixture" }));
  getSubscription = vi.fn(async () => null);
  const worker = { pushManager: { subscribe, getSubscription } };
  vi.stubGlobal("window", { isSecureContext: true, PushManager: class {}, Notification: {} });
  vi.stubGlobal("navigator", { userAgent: "SamsungBrowser/29.0", serviceWorker: {
    register: vi.fn(async () => worker), ready: Promise.resolve(worker),
  } });
  vi.stubGlobal("Notification", { get permission() { return permission; }, requestPermission: vi.fn(() => new Promise(() => {})) });
});

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it("prepares the worker and key without prompting, then subscribes synchronously from the tap", async () => {
  const push = await import("./push-subscription");
  await push.preparePush();
  expect(subscribe).not.toHaveBeenCalled();
  permission = "granted";
  const result = push.subscribePreparedPush();
  expect(subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: key });
  expect(Notification.requestPermission).not.toHaveBeenCalled();
  expect((await result).endpoint).toContain("/fixture");
});

it("does not use push subscription to request a permission that is still undecided", async () => {
  const push = await import("./push-subscription");
  expect(push.samsungInternet()).toBe(true);
  await push.preparePush();
  await expect(push.subscribePreparedPush()).rejects.toThrow("따로 진행");
  expect(subscribe).not.toHaveBeenCalled();
  expect(Notification.requestPermission).not.toHaveBeenCalled();
});

it("requires a new tap after preparation instead of losing user activation across an await", async () => {
  const push = await import("./push-subscription");
  permission = "granted";
  await expect(push.subscribePreparedPush()).rejects.toThrow("다시 눌러");
  expect(subscribe).not.toHaveBeenCalled();
  await push.preparePush();
  await push.subscribePreparedPush();
  expect(subscribe).toHaveBeenCalledOnce();
});

it("reuses a matching subscription without asking the push service again", async () => {
  const current = { endpoint: "https://fcm.googleapis.com/existing", options: { applicationServerKey: key.buffer } };
  getSubscription.mockResolvedValue(current);
  permission = "granted";
  const push = await import("./push-subscription");
  await push.preparePush();
  await expect(push.subscribePreparedPush()).resolves.toBe(current);
  expect(subscribe).not.toHaveBeenCalled();
});

it("shows blocked permission help without trying to override a browser denial", async () => {
  permission = "denied";
  const push = await import("./push-subscription");
  await expect(push.subscribePreparedPush()).rejects.toThrow("차단");
  expect(subscribe).not.toHaveBeenCalled();
});

it("clears a failed preparation so a later retry can succeed", async () => {
  request.mockRejectedValueOnce(new Error("key unavailable"));
  const push = await import("./push-subscription");
  await expect(push.preparePush()).rejects.toThrow("key unavailable");
  await push.preparePush();
  permission = "granted";
  await push.subscribePreparedPush();
  expect(subscribe).toHaveBeenCalledOnce();
});

it("replaces a mismatched VAPID subscription before the permission tap", async () => {
  const unsubscribe = vi.fn(async () => true);
  getSubscription.mockResolvedValue({ options: { applicationServerKey: new Uint8Array([1, 2]).buffer }, unsubscribe });
  const push = await import("./push-subscription");
  await push.preparePush();
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(subscribe).not.toHaveBeenCalled();
});

it("times out an unresponsive push service and preserves browser denial errors", async () => {
  vi.useFakeTimers();
  const push = await import("./push-subscription");
  await push.preparePush();
  permission = "granted";
  subscribe.mockImplementationOnce(() => new Promise(() => {}));
  const pending = expect(push.subscribePreparedPush()).rejects.toThrow("푸시 구독 연결이 응답하지");
  await vi.advanceTimersByTimeAsync(25_000);
  await pending;
  subscribe.mockRejectedValueOnce(new DOMException("blocked", "NotAllowedError"));
  await expect(push.subscribePreparedPush()).rejects.toThrow("차단");
});
