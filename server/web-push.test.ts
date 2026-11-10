import { createServer } from "node:http";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createECDH, randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import webpush from "web-push";
import { z } from "zod";
import { allowedPushEndpoint, createWebPush } from "./web-push.ts";
import { notificationListedFor } from "./routes/notifications.ts";
import { dispatchRoutes } from "./routes/table.ts";
import { json, readBody } from "./harness/http.ts";
import type { RequestAuth } from "./request-auth.ts";
import type { NotificationLogEntry } from "../shared/notification.ts";
import { removeTempDir } from "./testing/cleanup.ts";

const cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const clean of cleanups.splice(0).reverse()) await clean(); });
function auth(id = "s1"): RequestAuth {
  return { kind: "session", via: "cookie", scopes: ["client"], session: { id, tokenHash: "0".repeat(64), label: id,
    scopes: ["client"], createdAt: Date.now(), lastSeenAt: Date.now(), expiresAt: Date.now() + 3600000 } };
}
function sub(endpoint = "https://fcm.googleapis.com/fcm/send/fixture") {
  const ecdh = createECDH("prime256v1"); ecdh.generateKeys();
  return { endpoint, keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") } };
}
const notice: NotificationLogEntry = { id: "n1", at: 1, read: false, kind: "done", botId: "b1", botName: "Scout", threadId: "t1", title: "private title", body: "private conversation" };
async function fixture() {
  const dataDir = mkdtempSync(join(tmpdir(), "omb-push-test-"));
  cleanups.push(() => removeTempDir(dataDir));
  let viewer: RequestAuth = auth();
  const live = new Map([["s1", auth()], ["s2", auth("s2")]]);
  let visible = true;
  const send = vi.fn<typeof webpush.sendNotification>().mockResolvedValue({ statusCode: 201, body: "", headers: {} });
  const deps = { dataDir, subject: "https://example.com", sessionAuth: (id: string) => live.get(id) ?? null,
    listed: notificationListedFor(() => () => visible), send };
  const push = createWebPush(deps);
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url!, "http://localhost");
      if (!await dispatchRoutes([push.routes], { req, res, url, path: url.pathname, method: req.method!, auth: viewer, json, readBody })) json(res, 404, {});
    } catch { json(res, 500, { error: "fixture error" }); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/web-push`;
  const request = (path: string, method = "GET", body?: object) => fetch(base + path, {
    method, headers: { "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { push, deps, send, request, dataDir, live, viewer: (a: RequestAuth) => { viewer = a; }, visible: (v: boolean) => { visible = v; } };
}
describe("paired browser push", () => {
  it("rejects arbitrary URLs and private destinations", () => {
    for (const url of ["http://fcm.googleapis.com/x", "https://127.0.0.1/x", "https://fcm.googleapis.com.evil.test/x", "https://fcm.googleapis.com:8443/x", "https://user@fcm.googleapis.com/x"]) expect(allowedPushEndpoint(url)).toBe(false);
    for (const url of ["https://fcm.googleapis.com/x", "https://updates.push.services.mozilla.com/wpush/v2/x", "https://web.push.apple.com/Q/x", "https://a.notify.windows.com/x"]) expect(allowedPushEndpoint(url)).toBe(true);
  });
  it("persists keys and private subscription records and encrypts deliveries", async () => {
    const f = await fixture(), subscription = sub();
    const key = z.object({ publicKey: z.string() }).parse(await (await f.request("/key")).json());
    expect((await f.request("/subscription", "POST", { subscription })).status).toBe(200);
    const saved = JSON.parse(readFileSync(join(f.dataDir, "web-push.json"), "utf8"));
    expect(saved.keys.publicKey).toBe(key.publicKey);
    expect(statSync(join(f.dataDir, "web-push.json")).mode & 0o777).toBe(0o600);
    const reloaded = createWebPush(f.deps);
    reloaded.publish(notice);
    await vi.waitFor(() => expect(f.send).toHaveBeenCalledTimes(1));
    const [target, payload, options] = f.send.mock.calls[0];
    if (typeof payload !== "string") throw new Error("Expected a JSON push payload");
    expect(target).toEqual(subscription);
    expect(payload).not.toContain("private conversation");
    expect(payload).not.toContain("private title");
    const encrypted = webpush.generateRequestDetails(target, payload, options);
    expect(encrypted.headers["Content-Encoding"]).toBe("aes128gcm");
    expect(Buffer.isBuffer(encrypted.body)).toBe(true);
    expect(encrypted.headers.Authorization).toBeTruthy();
  });
  it("enforces session ownership, live revocation, visibility and completion preference", async () => {
    const f = await fixture(), subscription = sub();
    expect((await f.request("/subscription", "POST", { subscription, finished: false })).status).toBe(200);
    f.push.publish(notice);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(f.send).not.toHaveBeenCalled();
    f.viewer(auth("s2"));
    expect((await f.request("/subscription", "POST", { subscription })).status).toBe(409);
    expect((await f.request("/test", "POST", { subscription })).status).toBe(404);
    f.viewer({ kind: "loopback", scopes: ["admin"] });
    expect((await f.request("/key")).status).toBe(403);
    f.viewer(auth());
    f.visible(false);
    f.push.publish({ ...notice, id: "n2", kind: "question" });
    expect(f.send).not.toHaveBeenCalled();
    f.visible(true);
    f.live.delete("s1");
    f.push.publish({ ...notice, id: "n3", kind: "question" });
    expect(f.send).not.toHaveBeenCalled();
    expect(JSON.parse(readFileSync(join(f.dataDir, "web-push.json"), "utf8")).entries).toHaveLength(0);
  });
  it("deletes expired subscriptions and does not repeatedly send the same notice", async () => {
    const f = await fixture(), subscription = sub();
    await f.request("/subscription", "POST", { subscription });
    f.send.mockRejectedValueOnce({ statusCode: 410 });
    f.push.publish(notice); f.push.publish(notice);
    await vi.waitFor(() => expect(f.send).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(JSON.parse(readFileSync(join(f.dataDir, "web-push.json"), "utf8")).entries).toHaveLength(0));
  });
});
