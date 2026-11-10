import { AsyncLocalStorage } from "node:async_hooks";
import type { IncomingMessage, ServerResponse } from "node:http";
import { adminAuditPlan, type AuditPlan } from "../admin-audit-plan.ts";
import { appendAdminAction, BOT_AUDIT_FIELDS, TEAM_BOT_AUDIT_FIELDS, botAuditSnapshot, botChangeRows, configChangeRows, sharedSignIn, signInListsOf, type AdminActor, type AdminActionRow } from "../admin-activity.ts";
import { onConfigSaved } from "../config.ts";
import { onJsonBody, parsedBodyOf } from "../harness/http.ts";
import type { RequestAuth } from "../request-auth.ts";
import type { SessionRegistry } from "../sessions.ts";
import type { Store } from "../store.ts";
import type { WebhookTrigger } from "../webhooks.ts";
import type { DecisionActor } from "../decision-log.ts";

export function createAdminAuditHost(deps: {
  DESKTOP_MANAGED: boolean; HOSTED_WORKSPACE: boolean; CLOUD_TEAM: boolean; DATA_DIR: string;
  sessions: SessionRegistry; store: Pick<Store, "bot" | "group">; webhooks: { list(): WebhookTrigger[] };
  signInAllowList(): ReturnType<typeof signInListsOf>;
  decisionActorFor(auth: RequestAuth): DecisionActor;
  lendingEnabled(): boolean;
}) {
  const { DESKTOP_MANAGED, HOSTED_WORKSPACE, CLOUD_TEAM, DATA_DIR, sessions, store, webhooks, signInAllowList, decisionActorFor, lendingEnabled } = deps;
function adminActivityRecording(): boolean {
  if (DESKTOP_MANAGED) return false;
  if (HOSTED_WORKSPACE || CLOUD_TEAM) return true;
  const chatOnly = (scopes: readonly string[]) => !scopes.includes("admin");
  return sharedSignIn(signInAllowList()) || sessions.list().some((session) => chatOnly(session.scopes)) ||
    sessions.openPairings().some((pairing) => chatOnly(pairing.scopes));
}

function adminActorFor(auth: RequestAuth, req: IncomingMessage): AdminActor {
  if (auth.kind === "loopback" && auth.trust !== "service" &&
    (req.headers["x-openmausbot-cli"] === "1" || req.headers["x-openmausbot-cli-owner"] !== undefined)) return { kind: "cli" };
  return decisionActorFor(auth);
}

const adminActorScope = new AsyncLocalStorage<{ actor: AdminActor; sharedAtStart: boolean } | null>();
onConfigSaved((before, after) => {
  const scope = adminActorScope.getStore();
  if (!scope || DESKTOP_MANAGED) return;
  if (!scope.sharedAtStart && !adminActivityRecording() && !sharedSignIn(signInListsOf(before)) && !sharedSignIn(signInListsOf(after))) return;
  for (const row of configChangeRows(before, after)) appendAdminAction(DATA_DIR, { ...row, actor: scope.actor });
});

const WEBHOOK_AUDIT_FIELDS = ["name", "prompt", "botId", "runOn", "enabled", "eventTypes"] as const;
const BOT_AUDITED = CLOUD_TEAM ? TEAM_BOT_AUDIT_FIELDS : BOT_AUDIT_FIELDS;
const auditBot = (id: string | undefined) => (id ? botAuditSnapshot(store.bot(id) as unknown as Record<string, unknown> | null, BOT_AUDITED) : null);
const auditHook = (id: string | undefined) => (id ? webhooks.list().find((hook) => hook.id === id) : undefined);
const hookFields = (hook: WebhookTrigger, fields: readonly string[] = WEBHOOK_AUDIT_FIELDS) =>
  Object.fromEntries(fields.map((field) => [field, (hook as unknown as Record<string, unknown>)[field] ?? null]));

function requestedBotFields(req: IncomingMessage, path: string): string[] {
  if (path.endsWith("/always-allow")) return ["alwaysAllow"];
  if (path.endsWith("/model")) return ["modelSelection"];
  const body = parsedBodyOf(req);
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  const fields = new Set(Object.keys(body));
  if (fields.has("autoApprove") || fields.has("approvalMode")) fields.add("autoApprove").add("approvalMode");
  if (fields.has("chiefOfStaff")) fields.add("managedSections");
  return [...fields];
}

/** Each row compares only what this request named or created, so another admin's concurrent change is not attributed here. */
function beginAdminAudit(req: IncomingMessage, res: ServerResponse, method: string, path: string, auth: RequestAuth): void {
  const plan = DESKTOP_MANAGED ? null : adminAuditPlan(method, path, lendingEnabled());
  const actor = plan ? adminActorFor(auth, req) : null;
  const sharedAtStart = plan ? adminActivityRecording() : false;
  // Set for every request, so a kept-alive connection never inherits one.
  adminActorScope.enterWith(plan?.config && actor ? { actor, sharedAtStart } : null);
  if (!plan || !actor) return;
  const before = {
    bot: auditBot(plan.botId ?? plan.deletesBot),
    botName: store.bot(plan.botId ?? plan.deletesBot ?? "")?.name,
    hook: auditHook(plan.webhookId),
    session: plan.sessionId ? sessions.list().find((session) => session.id === plan.sessionId) : undefined,
    roomFloor: plan.roomId ? store.group(plan.roomId)?.audienceFloor ?? "everyone" : undefined,
  };
  let answered: unknown;
  if (plan.createsBots || plan.createsWebhook || plan.pairing) onJsonBody(res, (body) => (answered = body));
  res.once("finish", () => {
    if (res.statusCode >= 400 || (!sharedAtStart && !adminActivityRecording())) return;
    try {
      for (const row of adminAuditRows(plan, req, path, before, answered)) appendAdminAction(DATA_DIR, { ...row, actor });
    } catch (error) {
      console.warn(`admin activity: could not record ${method} ${path}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

function adminAuditRows(
  plan: AuditPlan,
  req: IncomingMessage,
  path: string,
  before: { bot: Record<string, unknown> | null; botName?: string; hook?: WebhookTrigger; session?: ReturnType<typeof sessions.list>[number]; roomFloor?: unknown },
  answered: unknown,
): Array<Omit<AdminActionRow, "at" | "actor">> {
  const rows: Array<Omit<AdminActionRow, "at" | "actor">> = [];
  const reply = answered && typeof answered === "object" ? answered as Record<string, unknown> : {};
  const idOf = (value: unknown) => (value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string" ? (value as { id: string }).id : undefined);
  if (plan.botId) {
    rows.push(...botChangeRows({ id: plan.botId, name: store.bot(plan.botId)?.name }, before.bot, auditBot(plan.botId), requestedBotFields(req, path), BOT_AUDITED));
  }
  if (plan.createsBots) {
    const created = [idOf(reply.bot), ...(Array.isArray(reply.bots) ? reply.bots.map(idOf) : [])].filter((id): id is string => Boolean(id));
    for (const id of new Set(created)) {
      const fields = auditBot(id);
      if (fields) rows.push({ category: "bot", action: "bot.create", target: { kind: "bot", id, name: store.bot(id)!.name }, after: fields });
    }
  }
  if (plan.deletesBot && before.bot && !store.bot(plan.deletesBot)) {
    rows.push({ category: "bot", action: "bot.delete", target: { kind: "bot", id: plan.deletesBot, ...(before.botName ? { name: before.botName } : {}) }, before: before.bot });
  }
  const hookTarget = (hook: WebhookTrigger) => ({ kind: "webhook", id: hook.id, name: hook.name });
  if (plan.createsWebhook) {
    const hook = auditHook(idOf(reply.webhook));
    if (hook) rows.push({ category: "webhook", action: "webhook.create", target: hookTarget(hook), after: hookFields(hook) });
  }
  if (plan.webhookId && before.hook) {
    const after = auditHook(plan.webhookId);
    if (!after) rows.push({ category: "webhook", action: "webhook.delete", target: hookTarget(before.hook), before: hookFields(before.hook) });
    else if (path.endsWith("/rotate")) rows.push({ category: "webhook", action: "webhook.rotate-secret", target: hookTarget(after) });
    else {
      const body = parsedBodyOf(req);
      const named = body && typeof body === "object" ? Object.keys(body) : [];
      const changed = WEBHOOK_AUDIT_FIELDS.filter((field) => named.includes(field) &&
        JSON.stringify(hookFields(before.hook!, [field])) !== JSON.stringify(hookFields(after, [field])));
      if (changed.length) {
        rows.push({ category: "webhook", action: "webhook.update", target: hookTarget(after), changed: [...changed], before: hookFields(before.hook, changed), after: hookFields(after, changed) });
      }
    }
  }
  if (before.session && !sessions.list().some((session) => session.id === before.session!.id)) {
    const session = before.session;
    rows.push({ category: "session", action: "session.revoke", target: { kind: "session", id: session.id, name: session.email ?? session.label },
      before: { label: session.label, ...(session.email ? { email: session.email } : {}), scopes: session.scopes } });
  }
  if (plan.pairing) {
    const pairing = sessions.openPairings().find((candidate) => candidate.id === reply.id);
    if (pairing) rows.push({ category: "session", action: "pairing.create", target: { kind: "pairing", name: pairing.label }, after: { label: pairing.label, scopes: pairing.scopes } });
  }
  if (plan.engineAction) rows.push({ category: "engine", action: `engine.${plan.engineAction.action}`, target: { kind: "engine", id: plan.engineAction.id } });
  const roomBody = plan.roomId ? parsedBodyOf(req) : undefined;
  const room = plan.roomId ? store.group(plan.roomId) : undefined;
  if (room && roomBody && typeof roomBody === "object" && (roomBody as { resetAudience?: unknown }).resetAudience === true) {
    rows.push({ category: "visibility", action: "room.audience-reset", target: { kind: "room", id: room.id, name: room.name },
      changed: ["audienceFloor"], before: { audienceFloor: before.roomFloor ?? "everyone" }, after: { audienceFloor: room.audienceFloor ?? "everyone" } });
  }
  return rows;
}


return { adminActivityRecording, adminActorScope, beginAdminAudit };
}
