import { createHash, randomUUID } from "node:crypto";
import type { Prisma as PrismaTypes } from "@prisma/client";
import { db, Prisma } from "@shopkeeper/db";
import { TOOL_CATEGORIES } from "./tools/registry/index.js";
import type {
  ActionEntry,
  AgentActionMode,
  AgentActionStatus,
} from "./agent-context.js";
import type { AgentPlan } from "./types.js";
import type { ModelUsageMetrics } from "./usage.js";
import { parseReceiptV1, type ReceiptV1 } from "./tools/result.js";
import { ConflictError } from "./errors.js";

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
  executionId?: string | null;
  taskAuthority?: AgentActionTaskAuthority;
}

export type AgentActionTaskAuthority =
  | {
      kind: "claim";
      taskId: string;
      expectedRevision: number;
      claimToken: string;
    }
  | {
      kind: "approved_proposal";
      taskId: string;
      expectedRevision: number;
      proposalId: string;
      executionId: string;
      executionClaimToken: string;
    };

export interface BeginAgentActionAttemptParams extends CommonRecordParams {
  action: Pick<ActionEntry, "tool" | "input" | "category" | "providerOperationKey">;
  actionIndex: number;
  operationId: string;
}

export interface AgentActionAttempt {
  id: string;
  operationId: string;
  taskAuthority?: AgentActionTaskAuthority;
}

export interface RecordAgentActionsBatchParams extends CommonRecordParams {
  actions: ActionEntry[];
}

export interface PersistedAgentAction {
  id: string;
  category: string;
  organizationId: string;
  status: AgentActionStatus;
  tool: string;
}

const EXECUTION_STARTED_MESSAGE = "Execution started; completion has not been recorded.";

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, entry]) => [key, canonicalizeJson(entry)]),
    );
  }
  return value;
}

// The one proposal identity every surface uses: the card, the durable proposal
// row, and each approval and claim check. It covers what an approver actually
// agrees to (instruction + tool calls). Steps are display labels derived from the
// calls, so a label change does not change authority and must not change identity.
export function hashPlan(plan: Pick<AgentPlan, "instruction" | "rawToolCalls">): string {
  return sha256Hex(JSON.stringify(canonicalizeJson({
    instruction: plan.instruction,
    rawToolCalls: plan.rawToolCalls,
  })));
}

export function hashInstruction(instruction: string): string {
  return sha256Hex(instruction);
}

function deriveStatus(entry: ActionEntry): AgentActionStatus {
  return entry.status ?? "success";
}

function deriveErrorDetail(entry: ActionEntry, status: AgentActionStatus): string | null {
  if (entry.errorDetail) return entry.errorDetail;
  if (status === "error" || status === "policy_block" || status === "unknown") return entry.result;
  return null;
}

function deriveCategory(entry: ActionEntry): string {
  return entry.category ?? TOOL_CATEGORIES[entry.tool] ?? "unknown";
}

const RECEIPT_ACTION_STATUS: Record<ReceiptV1["outcome"], AgentActionStatus> = {
  succeeded: "success",
  not_found: "success",
  rejected: "policy_block",
  failed: "error",
  unknown: "unknown",
};

function validatedEntryReceipt(entry: ActionEntry, expectedOperationId?: string): ReceiptV1 | undefined {
  if (entry.receipt === undefined) return undefined;
  const receipt = parseReceiptV1(entry.receipt);
  if (receipt.tool !== entry.tool) {
    throw new Error(`Receipt tool ${receipt.tool} does not match action tool ${entry.tool}`);
  }
  if (entry.providerOperationKey && receipt.operationId !== entry.providerOperationKey) {
    throw new Error("Receipt operationId does not match action provider operation key");
  }
  if (expectedOperationId && receipt.operationId !== expectedOperationId) {
    throw new Error("Receipt operationId does not match the durable action operation ID");
  }
  const status = deriveStatus(entry);
  const expectedStatus = RECEIPT_ACTION_STATUS[receipt.outcome];
  if (status !== expectedStatus) {
    throw new Error(`Receipt outcome ${receipt.outcome} requires action status ${expectedStatus}`);
  }
  return receipt;
}

function toJsonInput(value: unknown): PrismaTypes.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as PrismaTypes.InputJsonValue;
}

function entryToRow(params: CommonRecordParams & {
  entry: ActionEntry;
  executedAt: Date;
  id: string;
  turnId: string;
}) {
  const status = deriveStatus(params.entry);
  const receipt = validatedEntryReceipt(params.entry);
  return {
    id: params.id,
    turnId: params.turnId,
    organizationId: params.orgId,
    threadId: params.threadId ?? null,
    customerId: params.customerId ?? null,
    executionId: params.executionId ?? null,
    providerOperationKey: params.entry.providerOperationKey ?? null,
    receiptVersion: receipt?.version ?? null,
    receipt: receipt ? toJsonInput(receipt) : Prisma.DbNull,
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

export async function recordAgentActionsBatch(
  params: RecordAgentActionsBatchParams,
): Promise<PersistedAgentAction[]> {
  if (params.actions.length === 0) return [];
  const turnId = params.turnId ?? randomUUID();
  // PostgreSQL's CURRENT_TIMESTAMP is constant within a single createMany
  // statement, so we set executedAt explicitly with millisecond offsets to
  // preserve the order the agent executed tools in.
  const base = Date.now();
  const rows = params.actions.map((action, idx) => entryToRow({
      ...params,
      entry: action,
      id: randomUUID(),
      turnId,
      executedAt: new Date(base + idx),
    }));
  await db.agentAction.createMany({
    data: rows,
  });
  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    organizationId: row.organizationId,
    status: row.status,
    tool: row.tool,
  }));
}

/**
 * Creates the durable operation before a mutative adapter can run. New lifecycle
 * rows intentionally have no execution timestamp or duration until they reach a
 * terminal known/unknown outcome.
 */
export async function beginAgentActionAttempt(
  params: BeginAgentActionAttemptParams,
): Promise<AgentActionAttempt> {
  const id = randomUUID();
  const operationId = params.operationId;
  await db.agentAction.create({
    data: {
      id,
      turnId: params.turnId ?? randomUUID(),
      organizationId: params.orgId,
      threadId: params.threadId ?? null,
      customerId: params.customerId ?? null,
      executionId: params.executionId ?? null,
      taskId: params.taskAuthority?.taskId ?? null,
      proposalId: params.taskAuthority?.kind === "approved_proposal"
        ? params.taskAuthority.proposalId
        : null,
      operationId,
      actionIndex: params.actionIndex,
      providerOperationKey: params.action.providerOperationKey ?? null,
      dispatchState: "prepared",
      tool: params.action.tool,
      category: params.action.category ?? TOOL_CATEGORIES[params.action.tool] ?? "unknown",
      input: toJsonInput(params.action.input),
      output: EXECUTION_STARTED_MESSAGE,
      status: "unknown",
      errorDetail: EXECUTION_STARTED_MESSAGE,
      mode: params.mode,
      instruction: params.instruction ?? null,
      summary: params.summary ?? null,
      approverId: params.approval?.approverId ?? null,
      approvedAt: params.approval?.approvedAt ?? null,
      approvedPlanHash: params.approval?.approvedPlanHash ?? null,
      instructionHash: params.approval?.instructionHash ?? null,
      executedAt: null,
      durationMs: null,
    },
  });
  return { id, operationId, ...(params.taskAuthority ? { taskAuthority: params.taskAuthority } : {}) };
}

async function transitionAgentActionDispatch(
  attempt: AgentActionAttempt,
  from: "prepared" | "dispatch_authorized",
  to: "dispatch_authorized" | "submitted",
): Promise<void> {
  const result = await db.agentAction.updateMany({
    where: { id: attempt.id, operationId: attempt.operationId, dispatchState: from },
    data: {
      dispatchState: to,
      ...(to === "submitted" ? { submittedAt: new Date() } : {}),
    },
  });
  if (result.count !== 1) {
    throw new Error(`Agent action ${attempt.id} could not transition from ${from} to ${to}`);
  }
}

export async function authorizeAgentActionDispatch(attempt: AgentActionAttempt): Promise<void> {
  if (!attempt.taskAuthority) {
    await transitionAgentActionDispatch(attempt, "prepared", "dispatch_authorized");
    return;
  }
  const authority = attempt.taskAuthority;
  await db.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT id FROM agent_tasks WHERE id = ${authority.taskId}::uuid FOR UPDATE
    `);
    const task = await tx.agentTask.findUnique({ where: { id: authority.taskId } });
    const now = new Date();
    const claimIsCurrent = authority.kind === "claim"
      && task?.status === "running"
      && task.revision === authority.expectedRevision
      && task.claimToken === authority.claimToken
      && task.leaseExpiresAt !== null
      && task.leaseExpiresAt > now;
    const proposalIsCurrent = authority.kind === "approved_proposal"
      && task?.status === "waiting_approval"
      && task.revision === authority.expectedRevision
      && task.activeProposalId === authority.proposalId
      && await tx.agentProposal.count({ where: {
        id: authority.proposalId, taskId: authority.taskId, status: "approved",
      } }) === 1
      && await tx.planExecution.count({ where: {
        id: authority.executionId, taskId: authority.taskId,
        proposalId: authority.proposalId, status: "claimed",
        claimToken: authority.executionClaimToken,
      } }) === 1;
    if (!task || task.cancelledAt || (!claimIsCurrent && !proposalIsCurrent)) {
      throw new ConflictError("Durable task authority was lost before action dispatch.");
    }
    const updated = await tx.agentAction.updateMany({
      where: {
        id: attempt.id, organizationId: task.organizationId,
        operationId: attempt.operationId, taskId: authority.taskId,
        dispatchState: "prepared",
      },
      data: { dispatchState: "dispatch_authorized" },
    });
    if (updated.count !== 1) {
      throw new Error(`Agent action ${attempt.id} could not transition from prepared to dispatch_authorized`);
    }
  });
}

export async function markAgentActionSubmitted(attempt: AgentActionAttempt): Promise<void> {
  await transitionAgentActionDispatch(attempt, "dispatch_authorized", "submitted");
}

export async function failAgentActionBeforeDispatch(
  attempt: AgentActionAttempt,
  entry: ActionEntry,
): Promise<void> {
  const status = deriveStatus(entry);
  if (status === "unknown" || status === "success") {
    throw new Error("An action that was not dispatched requires a definite failure result");
  }
  const result = await db.agentAction.updateMany({
    where: { id: attempt.id, operationId: attempt.operationId, dispatchState: "prepared" },
    data: {
      output: entry.result,
      status,
      errorDetail: deriveErrorDetail(entry, status),
      durationMs: entry.durationMs ?? 0,
      executedAt: new Date(),
      dispatchState: "settled",
    },
  });
  if (result.count !== 1) {
    throw new Error(`Prepared agent action ${attempt.id} could not be failed before dispatch`);
  }
}

export interface RecordAgentTurnUsageParams {
  turnId: string;
  orgId: string;
  threadId?: string | null;
  purpose: string;
  channelType?: string | null;
  outcome: string;
  durationMs: number;
  usage: ModelUsageMetrics;
}

/**
 * The per-turn counterpart to the daily `llm_daily_spend` roll-up.
 *
 * A turn that stops on `token_budget` before executing anything writes no
 * `AgentAction` row, so the turns most worth reading were the ones that left no
 * trace. Rows are keyed by the same `turnId` the action batch uses, so the two
 * join.
 */
export async function recordAgentTurnUsage(
  params: RecordAgentTurnUsageParams,
): Promise<void> {
  const { usage } = params;
  await db.agentTurnUsage.create({
    data: {
      turnId: params.turnId,
      organizationId: params.orgId,
      threadId: params.threadId ?? null,
      purpose: params.purpose,
      channelType: params.channelType ?? null,
      outcome: params.outcome,
      modelCalls: usage.modelCalls,
      budgetTokens: usage.budgetTokens,
      firstCallBudgetTokens: usage.firstCallBudgetTokens,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheCreationInputTokens: usage.cacheCreationInputTokens,
      cacheCreation1hInputTokens: usage.cacheCreation1hInputTokens,
      cacheReadInputTokens: usage.cacheReadInputTokens,
      totalTokens: usage.totalTokens,
      durationMs: params.durationMs,
    },
  });
}

// Update the attempt written before a mutative tool runs. If the process dies
// before this write, the durable row remains unknown and must be reconciled.
export async function completeAgentActionAttempt(
  attempt: AgentActionAttempt,
  entry: ActionEntry,
): Promise<void> {
  const status = deriveStatus(entry);
  const receipt = validatedEntryReceipt(entry, attempt.operationId);
  const dispatchState = status === "unknown" ? "unknown" : "settled";
  const result = await db.agentAction.updateMany({
    where: {
      id: attempt.id,
      operationId: attempt.operationId,
      dispatchState: "submitted",
    },
    data: {
      output: entry.result,
      status,
      errorDetail: deriveErrorDetail(entry, status),
      durationMs: entry.durationMs ?? 0,
      executedAt: new Date(),
      dispatchState,
      receiptVersion: receipt?.version ?? null,
      receipt: receipt ? toJsonInput(receipt) : Prisma.DbNull,
    },
  });
  if (result.count !== 1) {
    throw new Error(`Submitted agent action ${attempt.id} could not be completed`);
  }
}

export async function summarizeJournaledActions(orgId: string, turnId: string, summary: string): Promise<void> {
  await db.agentAction.updateMany({
    where: { organizationId: orgId, turnId },
    data: { summary },
  });
}
