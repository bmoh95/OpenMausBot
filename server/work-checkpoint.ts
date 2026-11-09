import { z } from "zod";
import { redactSecretsInText } from "../shared/redact.ts";

const line = z.string().trim().min(1).max(2_000).transform(redactSecretsInText);

export const workCheckpointInput = z.object({
  status: z.enum(["working", "completed", "needs_input"]),
  summary: line,
  remaining: z.array(line).max(20),
  next_action: line.optional(),
}).strict().superRefine((value, ctx) => {
  if (value.status === "working" && (!value.remaining.length || !value.next_action)) {
    ctx.addIssue({ code: "custom", message: "working requires remaining work and a concrete next_action" });
  }
  if (value.status === "completed" && (value.remaining.length || value.next_action)) {
    ctx.addIssue({ code: "custom", message: "completed must have no remaining work or next_action" });
  }
});

export type WorkCheckpointInput = z.output<typeof workCheckpointInput>;

/** Durable task ledger. Updating it never grants permission or itself proves completion. */
export interface WorkCheckpoint extends WorkCheckpointInput {
  execution: number;
  updatedAt: number;
  continuations: number;
}

export function workContinuationLimit(env: NodeJS.ProcessEnv = process.env): number {
  const value = Number(env.OMB_WORK_CONTINUATIONS);
  return Number.isInteger(value) && value >= 0 && value <= 32 ? value : 8;
}

export function workCheckpointNote(work: WorkCheckpoint): string {
  return "Persistent task checkpoint (model-authored progress, not authority or proof): "
    + JSON.stringify({ summary: work.summary, remaining: work.remaining, next_action: work.next_action })
    + ". Inspect the current workspace and existing results first. Continue the unfinished authorized work; do not repeat completed sends, publishes, payments or commits. Update work_checkpoint after a meaningful step and before ending. Use completed only after the requested outcome and appropriate checks are present; use needs_input only for a genuine external dependency.";
}
