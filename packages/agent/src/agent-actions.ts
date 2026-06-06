import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@clerk/db";
import { TOOL_CATEGORIES } from "./tools/registry.js";
import type {
  ActionEntry,
  AgentActionMode,
  AgentActionStatus,
} from "./agent-context.js";
import type { AgentPlan } from "./types.js";

export interface AgentActionApproval {
  approverId: string;
  approvedAt: Date;
  approvedPlanHash?: string;
  instructionHash?: string;
}

interface CommonRecordParams {
  orgId: string;
  threadId?: string | null;
  customerId?: string | null;
  mode: AgentActionMode;
  approval?: AgentActionApproval;
  instruction?: string | null;
  summary?: string | null;
  turnId?: string;
}

export interface RecordAgentActionsBatchParams extends CommonRecordParams {
  actions: ActionEntry[];
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// Hashes the executable shape of a plan. Mirrors what an approver actually
// agreed to (instruction + tool calls), so a backend change to readResults
// or warnings between approval and execution does not invalidate the hash.
export function hashPlan(plan: AgentPlan): string {
  return sha256Hex(JSON.stringify({
    instruction: plan.instruction,
    steps: plan.steps,
    rawToolCalls: plan.rawToolCalls,
  }));
}

export function hashInstruction(instruction: string): string {
  return sha256Hex(instruction);
}

function deriveStatus(entry: ActionEntry): AgentActionStatus {
  return entry.status ?? "success";
}

function deriveErrorDetail(entry: ActionEntry, status: AgentActionStatus): string | null {
  if (entry.errorDetail) return entry.errorDetail;
  if (status === "error" || status === "policy_block") return entry.result;
  return null;
}

function deriveCategory(entry: ActionEntry): string {
  return entry.category ?? TOOL_CATEGORIES[entry.tool] ?? "unknown";
}

function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function entryToRow(params: CommonRecordParams & { entry: ActionEntry; turnId: string; executedAt: Date }) {
  const status = deriveStatus(params.entry);
  return {
    turnId: params.turnId,
    organizationId: params.orgId,
    threadId: params.threadId ?? null,
    customerId: params.customerId ?? null,
    tool: params.entry.tool,
    category: deriveCategory(params.entry),
    input: toJsonInput(params.entry.input),
    output: params.entry.result,
    status,
    errorDetail: deriveErrorDetail(params.entry, status),
    mode: params.entry.mode ?? params.mode,
    instruction: params.instruction ?? null,
    summary: params.summary ?? null,
    approverId: params.approval?.approverId ?? null,
    approvedAt: params.approval?.approvedAt ?? null,
    approvedPlanHash: params.approval?.approvedPlanHash ?? null,
    instructionHash: params.approval?.instructionHash ?? null,
    executedAt: params.executedAt,
    durationMs: params.entry.durationMs ?? 0,
  };
}

export async function recordAgentActionsBatch(params: RecordAgentActionsBatchParams): Promise<void> {
  if (params.actions.length === 0) return;
  const turnId = params.turnId ?? randomUUID();
  // PostgreSQL's CURRENT_TIMESTAMP is constant within a single createMany
  // statement, so we set executedAt explicitly with millisecond offsets to
  // preserve the order the agent executed tools in.
  const base = Date.now();
  await db.agentAction.createMany({
    data: params.actions.map((action, idx) => entryToRow({
      ...params,
      entry: action,
      turnId,
      executedAt: new Date(base + idx),
    })),
  });
}
