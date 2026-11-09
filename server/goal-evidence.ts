import type { Message } from "./store.ts";

export interface GoalEvidence {
  id: string;
  tool: string;
  ok: boolean;
  output: string;
}

export function goalEvidence(rows: readonly Message[], turnId: string | undefined): GoalEvidence[] {
  if (!turnId) return [];
  return rows.filter(row => row.turnId === turnId && row.kind === "activity" && row.tool?.itemId && typeof row.tool.ok === "boolean")
    .map(row => ({ id: row.id, tool: row.tool!.name, ok: row.tool!.ok === true && !failedOutput(row.tool!.output ?? ""), output: (row.tool!.output ?? "").slice(0, 1000) }));
}

export function failedOutput(output: string): boolean {
  for (const match of output.matchAll(/(?:exit[ _-]?code|process exited with code|exited with (?:status|code))["'\s:=]+(-?\d+)/gi)) if (Number(match[1]) !== 0) return true;
  try {
    const check = (v: unknown, depth: number): boolean => !!v && typeof v === "object" && depth < 5 && Object.entries(v).some(([k, x]) =>
      ((k === "exit_code" || k === "exitCode" || k === "returncode") && typeof x === "number" && x !== 0) || ((k === "ok" || k === "success") && x === false) || check(x, depth + 1));
    return check(JSON.parse(output), 0);
  } catch { return false; }
}

export function verifiedEvidence(evidence: readonly GoalEvidence[]): boolean {
  return evidence.some(e => e.ok && e.output.trim().length > 0 && !/(?:^|__|agents_)(?:work_checkpoint|coordinate_bots|assignment_status|list_bots|list_room_targets|find_tool|memory_update)$/i.test(e.tool));
}
