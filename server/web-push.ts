import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import webpush from "web-push";
import { z } from "zod";
import { writeFileAtomic } from "./atomic.ts";
import { notificationBotIcon, pushFestival, type BotIconFace } from "../shared/bot-icon.ts";
import { notificationBanner, type NotificationLogEntry } from "../shared/notification.ts";
import type { RequestAuth } from "./request-auth.ts";
import { personKey } from "./person-key.ts";
import type { NotificationListed } from "./routes/notifications.ts";
import { PASS, type RouteHandler } from "./routes/table.ts";

const providers = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "push.services.mozilla.com", "web.push.apple.com", "wns.windows.com", "notify.windows.com"];

/** Samsung Internet drops a push that arrives while the page is still open, and the page's own delay did not survive the request. */
export function pushTestDelay(userAgent: string | undefined, asked: unknown): number {
  const samsung = /SamsungBrowser\//i.test(userAgent ?? "") ? 8_000 : 0;
  const fromBody = typeof asked === "number" && Number.isFinite(asked) ? Math.floor(asked)
    : typeof asked === "string" && /^\d+$/.test(asked) ? Number(asked) : 0;
  return Math.min(15_000, Math.max(0, samsung, fromBody));
}
export function allowedPushEndpoint(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.port && !u.username && !u.password && !u.hash &&
      providers.some(host => u.hostname === host || u.hostname.endsWith("." + host));
  } catch { return false; }
}
const subscriptionSchema = z.object({
  endpoint: z.string().max(2048).refine(allowedPushEndpoint, "Unsupported browser push service."),
  keys: z.object({
    p256dh: z.string().regex(/^[\w-]{87}=?$/),
    auth: z.string().regex(/^[\w-]{22}={0,2}$/),
  }).strict(),
}).strict().superRefine((value, ctx) => {
  const key = Buffer.from(value.keys.p256dh, "base64url");
  if (key.length !== 65 || key[0] !== 4 || Buffer.from(value.keys.auth, "base64url").length !== 16)
    ctx.addIssue({ code: "custom", message: "Invalid push encryption keys." });
});
const entrySchema = z.object({
  sessionId: z.string(), subscription: subscriptionSchema, sounds: z.boolean(), finished: z.boolean(),
  festival: z.enum(["halloween", "diwali"]).optional(),
});
const diskSchema = z.object({ version: z.literal(1), keys: z.object({ publicKey: z.string(), privateKey: z.string() }), entries: z.array(entrySchema).max(200) });
type Entry = z.infer<typeof entrySchema>;
type Disk = z.infer<typeof diskSchema>;
type Send = typeof webpush.sendNotification;

export function createWebPush(deps: {
  dataDir: string;
  subject: string;
  sessionAuth(id: string): RequestAuth | null;
  listed: NotificationListed;
  send?: Send;
  botFace?(botId: string): BotIconFace | null;
}) {
  const file = join(deps.dataDir, "web-push.json");
  let disk: Disk | undefined;
  let active = 0;
  const pending: Array<() => Promise<void>> = [];
  const recent = new Set<string>();
  const busy = new Set<string>();
  const testedAt = new Map<string, number>();
  function load(): Disk {
    if (!disk) {
      mkdirSync(deps.dataDir, { recursive: true, mode: 0o700 });
      disk = existsSync(file) ? diskSchema.parse(JSON.parse(readFileSync(file, "utf8"))) :
        { version: 1, keys: webpush.generateVAPIDKeys(), entries: [] };
      save();
    }
    return disk;
  }
  function save() { writeFileAtomic(file, JSON.stringify(disk), { mode: 0o600 }); }
  function prune() {
    const data = load();
    const entries = data.entries.filter(e => deps.sessionAuth(e.sessionId));
    if (entries.length !== data.entries.length) { data.entries = entries; save(); }
  }
  const identifier = (e: Entry) => createHash("sha256").update(e.subscription.endpoint).digest("hex");
  function enqueue(work: () => Promise<void>) {
    if (pending.length >= 500) return;
    pending.push(work);
    pump();
  }
  function pump() {
    while (active < 4 && pending.length) {
      const work = pending.shift()!;
      active++;
      void work().catch(() => console.warn("Web Push delivery failed; no credentials were logged.")).finally(() => { active--; pump(); });
    }
  }
  async function deliver(entry: Entry, payload: object) {
    const current = load().entries.find(e => identifier(e) === identifier(entry) && e.sessionId === entry.sessionId);
    if (!current || !deps.sessionAuth(entry.sessionId)) return;
    try {
      await (deps.send ?? webpush.sendNotification)(entry.subscription, JSON.stringify(payload), {
        // high asks FCM to wake a backgrounded browser. normal waits until Samsung Internet is open again.
        TTL: 3600, urgency: "high", timeout: 10_000,
        vapidDetails: { subject: deps.subject, ...load().keys },
      });
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        const data = load();
        data.entries = data.entries.filter(e => !(identifier(e) === identifier(entry) && e.sessionId === entry.sessionId));
        save();
      } else throw new Error(`Push service failure${status ? ` (${status})` : ""}`);
    }
  }
  function publish(notification: NotificationLogEntry, options: { adminOnly?: boolean; person?: string } = {}) {
    if (!existsSync(file) && !disk) return;
    try {
      prune();
      if (recent.has(notification.id)) return;
      recent.add(notification.id);
      if (recent.size > 500) recent.delete(recent.values().next().value!);
      for (const entry of load().entries) {
        const auth = deps.sessionAuth(entry.sessionId);
        if (!auth || !deps.listed(auth)(notification) || (notification.kind === "done" && !entry.finished)) continue;
        if (options.adminOnly && !auth.scopes.includes("admin")) continue;
        if (options.person && (auth.kind !== "session" || personKey(auth.session) !== options.person)) continue;
        const banner = notificationBanner(notification);
        const face = deps.botFace?.(notification.botId) ?? null;
        const payload = {
          id: notification.id, botId: notification.botId, threadId: notification.threadId,
          title: banner.title, body: banner.body,
          icon: face ? notificationBotIcon(face, entry.festival ?? null) : "/app-icon-192.png",
          silent: !entry.sounds,
        };
        enqueue(async () => {
          const currentAuth = deps.sessionAuth(entry.sessionId);
          if (currentAuth && deps.listed(currentAuth)(notification)) await deliver(entry, payload);
        });
      }
    } catch { console.warn("Web Push configuration could not be loaded; live notifications remain available."); }
  }
  const routes: RouteHandler = async ({ req, path, method, auth, res, json, readBody }) => {
    if (!path.startsWith("/api/web-push/")) return PASS;
    if (auth.kind !== "session" || auth.via === "ticket" || auth.session.token)
      return json(res, 403, { error: "Pair this browser before enabling push notifications." });
    res.setHeader("cache-control", "no-store");
    if (path === "/api/web-push/key" && method === "GET") return json(res, 200, { publicKey: load().keys.publicKey });
    if (path !== "/api/web-push/subscription" && path !== "/api/web-push/test") return PASS;
    if (!["POST", "DELETE"].includes(method)) return PASS;
    if (busy.has(auth.session.id)) return json(res, 409, { error: "Push settings are being saved. Try again." });
    busy.add(auth.session.id);
    try {
      const raw = await readBody(req);
      const parsed = subscriptionSchema.safeParse(raw?.subscription);
      if (!parsed.success) return json(res, 400, { error: "Invalid browser push subscription." });
      prune();
      const data = load();
      const found = data.entries.find(e => e.subscription.endpoint === parsed.data.endpoint);
      if (found && found.sessionId !== auth.session.id && method !== "DELETE" && path === "/api/web-push/subscription")
        return json(res, 409, { error: "This browser push subscription belongs to another paired session. Reset push on this browser first." });
      if (method === "DELETE") {
        data.entries = data.entries.filter(e => !(e.sessionId === auth.session.id && e.subscription.endpoint === parsed.data.endpoint));
        save();
        return json(res, 200, { ok: true });
      }
      if (path === "/api/web-push/test") {
        if (!found || found.sessionId !== auth.session.id) return json(res, 404, { error: "Enable push on this browser first." });
        if (Date.now() - (testedAt.get(auth.session.id) ?? 0) < 10_000) return json(res, 429, { error: "Wait a few seconds before another test." });
        if (testedAt.size >= 200) testedAt.clear();
        testedAt.set(auth.session.id, Date.now());
        const ua = Array.isArray(req.headers["user-agent"]) ? req.headers["user-agent"].join(" ") : req.headers["user-agent"];
        const delayMs = pushTestDelay(ua, raw?.delayMs);
        const id = typeof raw?.id === "string" && /^test-\d{10,16}$/.test(raw.id) ? raw.id : `test-${Date.now()}`;
        const payload = { id, title: "OpenMausBot", body: "테스트 알림이 도착했어요.", test: true, silent: !found.sounds };
        if (delayMs > 0) {
          const scheduled = found;
          setTimeout(() => { void deliver(scheduled, payload).catch(() => console.warn("Web Push delivery failed; no credentials were logged.")); }, delayMs);
          return json(res, 200, { ok: true, deliversInMs: delayMs });
        }
        await deliver(found, payload);
        return json(res, 200, { ok: true });
      }
      if (!found && data.entries.filter(e => e.sessionId === auth.session.id).length >= 5)
        return json(res, 429, { error: "Too many push subscriptions for this paired session." });
      if (!found && data.entries.length >= 200) return json(res, 429, { error: "Push subscription limit reached." });
      const festival = pushFestival(raw?.festival);
      const entry: Entry = {
        sessionId: auth.session.id, subscription: parsed.data, sounds: raw.sounds !== false, finished: raw.finished !== false,
        ...(festival ? { festival } : {}),
      };
      data.entries = data.entries.filter(e => e.subscription.endpoint !== entry.subscription.endpoint);
      data.entries.push(entry);
      save();
      return json(res, 200, { ok: true });
    } finally { busy.delete(auth.session.id); }
  };
  return { routes, publish };
}
