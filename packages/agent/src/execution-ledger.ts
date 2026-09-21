import { randomUUID } from "node:crypto";
import type { PlanExecution, PlanExecutionStatus } from "@prisma/client";
import { Prisma, db } from "@shopkeeper/db";
import { BadRequestError, ConflictError } from "./errors.js";
import { hashInstruction, hashPlan } from "./agent-actions.js";
import { readAgentPlanCache } from "./plan-cache.js";
import { SENDER_TYPE } from "./thread-constants.js";

export interface PlanExecutionIdentity {
  orgId: string;
  planId: string;
  threadId?: string | null;
  sourceMessageId?: string | null;
  planHash: string;
  instructionHash: string;
  mode?: string | null;
  approverId?: string | null;
  approvedAt?: Date | null;
  taskId?: string | null;
  proposalId?: string | null;
}

export interface PlanExecutionClaim {
  claimed: boolean;
  claimToken: string | null;
  execution: PlanExecution;
}

type TerminalPlanExecutionStatus = Extract<PlanExecutionStatus, "committed" | "failed" | "unknown">;

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function assertSameIdentity(existing: PlanExecution, identity: PlanExecutionIdentity): void {
  const mismatch = existing.organizationId !== identity.orgId
    || existing.planId !== identity.planId
    || existing.threadId !== (identity.threadId ?? null)
    || existing.sourceMessageId !== (identity.sourceMessageId ?? null)
    || existing.planHash !== identity.planHash
    || existing.instructionHash !== identity.instructionHash
    || existing.taskId !== (identity.taskId ?? null)
    || existing.proposalId !== (identity.proposalId ?? null);
  if (mismatch) {
    throw new ConflictError("Plan execution identity does not match the existing ledger record.");
  }
}

async function assertParentOwnership(identity: PlanExecutionIdentity): Promise<void> {
  const [thread, sourceMessage] = await Promise.all([
    identity.threadId
      ? db.thread.findFirst({
          where: { id: identity.threadId, organizationId: identity.orgId },
          select: { id: true },
        })
      : Promise.resolve(null),
    identity.sourceMessageId
      ? db.message.findFirst({
          where: {
            id: identity.sourceMessageId,
            organizationId: identity.orgId,
            ...(identity.threadId ? { threadId: identity.threadId } : {}),
          },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);
  if (identity.threadId && !thread) {
    throw new BadRequestError("Plan execution thread does not belong to the organization.");
  }
  if (identity.sourceMessageId && !sourceMessage) {
    throw new BadRequestError("Plan execution source message does not belong to the organization.");
  }
}

async function createOrLoadPending(identity: PlanExecutionIdentity): Promise<PlanExecution> {
  await assertParentOwnership(identity);
  try {
    return await db.planExecution.create({
      data: {
        planId: identity.planId,
        organizationId: identity.orgId,
        threadId: identity.threadId ?? null,
        sourceMessageId: identity.sourceMessageId ?? null,
        planHash: identity.planHash,
        instructionHash: identity.instructionHash,
        mode: identity.mode ?? null,
        approverId: identity.approverId ?? null,
        approvedAt: identity.approvedAt ?? null,
        taskId: identity.taskId ?? null,
        proposalId: identity.proposalId ?? null,
      },
    });
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
    const existing = await db.planExecution.findUniqueOrThrow({
      where: {
        organizationId_planId: {
          organizationId: identity.orgId,
          planId: identity.planId,
        },
      },
    });
    assertSameIdentity(existing, identity);
    return existing;
  }
}

// Shadow-only observation for rollout diagnostics. It deliberately does not
// claim or change status, so callers can compare repeated observations before
// P1-02 turns enforcement on.
export async function observePlanExecution(identity: PlanExecutionIdentity): Promise<PlanExecution> {
  const execution = await createOrLoadPending(identity);
  assertSameIdentity(execution, identity);
  return db.planExecution.update({
    where: { id: execution.id },
    data: {
      observationCount: { increment: 1 },
      lastObservedAt: new Date(),
    },
  });
}

// Atomic across dashboard/gateway processes because the state transition is a
// single conditional PostgreSQL update. Redis locks remain latency guards.
export async function claimPlanExecution(
  identity: PlanExecutionIdentity,
  claimToken: string = randomUUID(),
): Promise<PlanExecutionClaim> {
  const execution = await createOrLoadPending(identity);
  assertSameIdentity(execution, identity);
  const claimedAt = new Date();
  const claimed = await db.planExecution.updateMany({
    where: {
      id: execution.id,
      status: "pending",
      claimToken: null,
    },
    data: {
      status: "claimed",
      claimToken,
      claimedAt,
      mode: identity.mode ?? execution.mode,
      approverId: identity.approverId ?? execution.approverId,
      approvedAt: identity.approvedAt ?? execution.approvedAt,
    },
  });
  const current = await db.planExecution.findUniqueOrThrow({ where: { id: execution.id } });
  const wonClaim = claimed.count === 1;
  return { claimed: wonClaim, claimToken: wonClaim ? claimToken : null, execution: current };
}

// Claim a cached thread plan and revalidate its mutable source state under a
// row lock. Inbound message persistence also updates this thread row, so the
// lock gives those two workflows one database ordering point instead of a
// check-then-claim window across processes.
export async function claimCurrentPlanExecution(
  identity: PlanExecutionIdentity,
  claimToken: string = randomUUID(),
): Promise<PlanExecutionClaim> {
  if (!identity.threadId || !identity.sourceMessageId) {
    throw new BadRequestError("Current plan claims require a thread and source message.");
  }
  const execution = await createOrLoadPending(identity);
  assertSameIdentity(execution, identity);

  const outcome = await db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "threads"
      WHERE "id" = ${identity.threadId}::uuid
        AND "organization_id" = ${identity.orgId}::uuid
        AND "archived_at" IS NULL
        AND "deleted_at" IS NULL
      FOR UPDATE
    `);
    if (locked.length !== 1) {
      throw new BadRequestError("Plan execution thread is no longer available.");
    }

    const [thread, latestConversation] = await Promise.all([
      tx.thread.findUniqueOrThrow({
        where: { id: identity.threadId! },
        select: { cachedPlan: true, cachedPlanMessageId: true },
      }),
      tx.message.findFirst({
        where: {
          threadId: identity.threadId!,
          deletedAt: null,
          senderType: { not: SENDER_TYPE.NOTE },
        },
        orderBy: [{ sentAt: "desc" }, { id: "desc" }],
        select: { id: true, senderType: true },
      }),
    ]);
    let durableCurrent = false;
    if (identity.taskId && identity.proposalId) {
      const lockedTask = await tx.$queryRaw<Array<{ runtimeVersion: number }>>(Prisma.sql`
        SELECT "runtime_version" AS "runtimeVersion"
        FROM "agent_tasks"
        WHERE "id" = ${identity.taskId}::uuid
          AND "organization_id" = ${identity.orgId}::uuid
          AND "thread_id" = ${identity.threadId}::uuid
        FOR UPDATE
      `);
      if ((lockedTask[0]?.runtimeVersion ?? 0) >= 2) {
        const proposal = await tx.agentProposal.findFirst({
          where: {
            id: identity.proposalId,
            organizationId: identity.orgId,
            taskId: identity.taskId,
          },
          include: { task: true },
        });
        durableCurrent = Boolean(
          proposal
          && proposal.id === identity.planId
          && proposal.status === "approved"
          && proposal.approvedHash === proposal.proposalHash
          && proposal.proposalHash === identity.planHash
          && hashInstruction(proposal.instruction) === identity.instructionHash
          && proposal.taskRevision === proposal.task.revision
          && proposal.task.status === "waiting_approval"
          && proposal.task.activeProposalId === proposal.id
          && proposal.task.cancelledAt === null
          && latestConversation?.senderType === SENDER_TYPE.CUSTOMER
          && latestConversation.id === identity.sourceMessageId
        );
      }
    }
    const cached = readAgentPlanCache(thread.cachedPlan);
    const cachedCurrent = latestConversation?.senderType === SENDER_TYPE.CUSTOMER
      && latestConversation.id === identity.sourceMessageId
      && thread.cachedPlanMessageId === identity.sourceMessageId
      && cached?.planId === identity.planId
      && cached.lastCustomerMessageId === identity.sourceMessageId
      && hashPlan(cached.plan) === identity.planHash
      && hashInstruction(cached.instruction) === identity.instructionHash;
    const current = durableCurrent || cachedCurrent;
    if (!current) {
      await tx.planExecution.updateMany({
        where: { id: execution.id, status: "pending", claimToken: null },
        data: {
          status: "failed",
          claimToken,
          claimedAt: new Date(),
          completedAt: new Date(),
          lastError: "stale_plan",
        },
      });
      return { stale: true as const };
    }

    const claimedAt = new Date();
    const claimed = await tx.planExecution.updateMany({
      where: {
        id: execution.id,
        status: "pending",
        claimToken: null,
      },
      data: {
        status: "claimed",
        claimToken,
        claimedAt,
        mode: identity.mode ?? execution.mode,
        approverId: identity.approverId ?? execution.approverId,
        approvedAt: identity.approvedAt ?? execution.approvedAt,
      },
    });
    const result = await tx.planExecution.findUniqueOrThrow({ where: { id: execution.id } });
    const wonClaim = claimed.count === 1;
    return {
      stale: false as const,
      claim: { claimed: wonClaim, claimToken: wonClaim ? claimToken : null, execution: result },
    };
  });
  if (outcome.stale) {
    throw new ConflictError("This plan is no longer current. Review the latest plan before approving it.");
  }
  return outcome.claim;
}

function readStoredPlanIdentity(value: unknown): {
  planId: string;
  instruction: string;
  plan: Parameters<typeof hashPlan>[0];
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const stored = value as Record<string, unknown>;
  if (
    typeof stored.planId !== "string"
    || typeof stored.instruction !== "string"
    || !stored.plan
    || typeof stored.plan !== "object"
    || Array.isArray(stored.plan)
  ) {
    return null;
  }
  return {
    planId: stored.planId,
    instruction: stored.instruction,
    plan: stored.plan as Parameters<typeof hashPlan>[0],
  };
}

// Claim a reviewed plan stored in a host-specific thread cache. This covers
// operator surfaces such as dashboard Concierge whose pending-plan envelope is
// not the support planner's AgentPlanCacheRecord. The thread row lock orders
// approval against replacement/dismissal; the hashes prevent a matching planId
// from authorizing changed instructions or tool calls.
export async function claimStoredPlanExecution(
  identity: PlanExecutionIdentity,
  claimToken: string = randomUUID(),
): Promise<PlanExecutionClaim> {
  if (!identity.threadId) {
    throw new BadRequestError("Stored plan claims require a thread.");
  }
  const execution = await createOrLoadPending(identity);
  assertSameIdentity(execution, identity);

  const outcome = await db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ cachedPlan: unknown }>>(Prisma.sql`
      SELECT "cached_plan" AS "cachedPlan"
      FROM "threads"
      WHERE "id" = ${identity.threadId}::uuid
        AND "organization_id" = ${identity.orgId}::uuid
        AND "archived_at" IS NULL
        AND "deleted_at" IS NULL
      FOR UPDATE
    `);
    if (locked.length !== 1) {
      throw new BadRequestError("Plan execution thread is no longer available.");
    }

    const stored = readStoredPlanIdentity(locked[0]?.cachedPlan);
    const current = stored?.planId === identity.planId
      && hashInstruction(stored.instruction) === identity.instructionHash
      && hashPlan(stored.plan) === identity.planHash;
    if (!current) {
      await tx.planExecution.updateMany({
        where: { id: execution.id, status: "pending", claimToken: null },
        data: {
          status: "failed",
          claimToken,
          claimedAt: new Date(),
          completedAt: new Date(),
          lastError: "stale_plan",
        },
      });
      return { stale: true as const };
    }

    const claimed = await tx.planExecution.updateMany({
      where: { id: execution.id, status: "pending", claimToken: null },
      data: {
        status: "claimed",
        claimToken,
        claimedAt: new Date(),
        mode: identity.mode ?? execution.mode,
        approverId: identity.approverId ?? execution.approverId,
        approvedAt: identity.approvedAt ?? execution.approvedAt,
      },
    });
    const result = await tx.planExecution.findUniqueOrThrow({ where: { id: execution.id } });
    const wonClaim = claimed.count === 1;
    return {
      stale: false as const,
      claim: { claimed: wonClaim, claimToken: wonClaim ? claimToken : null, execution: result },
    };
  });
  if (outcome.stale) {
    throw new ConflictError("This plan is no longer current. Review the latest plan before approving it.");
  }
  return outcome.claim;
}

export async function completePlanExecution(params: {
  executionId: string;
  claimToken: string;
  status: TerminalPlanExecutionStatus;
  error?: string | null;
}): Promise<PlanExecution> {
  return db.$transaction(async (tx) => {
    const now = new Date();
    const completed = await tx.planExecution.updateMany({
      where: {
        id: params.executionId,
        status: "claimed",
        claimToken: params.claimToken,
      },
      data: {
        status: params.status,
        completedAt: now,
        lastError: params.error ?? null,
      },
    });
    if (completed.count !== 1) {
      throw new ConflictError("Plan execution claim is no longer active.");
    }
    const execution = await tx.planExecution.findUniqueOrThrow({ where: { id: params.executionId } });
    await settleLinkedTask(tx, execution, params.status, now);
    return execution;
  });
}

type ExecutionTaskTx = Pick<typeof db, "agentTask" | "agentProposal">;

async function settleLinkedTask(
  tx: ExecutionTaskTx,
  execution: Pick<PlanExecution, "organizationId" | "taskId" | "proposalId">,
  status: TerminalPlanExecutionStatus,
  now: Date,
): Promise<void> {
  if (!execution.taskId || !execution.proposalId) return;
  const taskStatus = status === "committed"
    ? "completed" as const
    : status === "unknown" ? "reconciling" as const : "failed" as const;
  let updated = await tx.agentTask.updateMany({
    where: {
      id: execution.taskId,
      organizationId: execution.organizationId,
      status: "waiting_approval",
      activeProposalId: execution.proposalId,
    },
    data: {
      status: taskStatus,
      activeProposalId: null,
      pendingQuestionId: null,
      pendingQuestion: null,
      pendingAnswererKind: null,
      pendingAnswererKey: null,
      lastProgressAt: now,
      ...(status === "committed"
        ? { completedAt: now, failureCode: null }
        : { failureCode: status === "unknown" ? "approved_execution_unknown" : "approved_execution_failed" }),
    },
  });
  // A stop can win the task-row lock after dispatch authorization but before
  // the provider result is recorded. It moves the task to reconciliation and
  // clears the wait, but it cannot undo the already-dispatched effect. Once the
  // exact linked execution has a known outcome, resolve that reconciliation
  // while preserving cancelledAt as the audit record of the stop.
  if (updated.count === 0 && status !== "unknown") {
    updated = await tx.agentTask.updateMany({
      where: {
        id: execution.taskId,
        organizationId: execution.organizationId,
        status: "reconciling",
        cancelledAt: { not: null },
      },
      data: {
        status: status === "committed" ? "completed" : "failed",
        completedAt: status === "committed" ? now : null,
        failureCode: status === "committed" ? null : "approved_execution_failed",
        lastProgressAt: now,
      },
    });
  }
  if (updated.count !== 1) return;
  if (status === "committed") {
    const proposal = await tx.agentProposal.updateMany({
      where: { id: execution.proposalId, taskId: execution.taskId, status: "approved" },
      data: { status: "completed", decidedAt: now },
    });
    if (proposal.count !== 1) {
      throw new ConflictError("The approved proposal changed before execution could be settled.");
    }
  }
}

export async function getPlanExecution(
  organizationId: string,
  planId: string,
): Promise<PlanExecution | null> {
  return db.planExecution.findUnique({
    where: { organizationId_planId: { organizationId, planId } },
  });
}

// A worker that dies after claiming but before completePlanExecution leaves a
// stuck `claimed` row. Reconcile it to `unknown` so operators can review it
// without ever replaying the approved plan.
export async function reconcileStaleClaimedPlanExecutions(
  staleBefore: Date,
  reason: string,
): Promise<number> {
  return db.$transaction(async (tx) => {
    const stale = await tx.planExecution.findMany({
      where: { status: "claimed", claimedAt: { lt: staleBefore } },
      select: { id: true, organizationId: true, taskId: true, proposalId: true },
    });
    if (stale.length === 0) return 0;
    const now = new Date();
    let updatedCount = 0;
    for (const execution of stale) {
      const updated = await tx.planExecution.updateMany({
        where: { id: execution.id, status: "claimed" },
        data: { status: "unknown", completedAt: now, lastError: reason },
      });
      if (updated.count !== 1) continue;
      updatedCount += 1;
      // The execution must become reviewable even if its task was independently
      // cancelled or otherwise settled. In the normal waiting state this still
      // moves the linked task to reconciling in the same transaction.
      await settleLinkedTask(tx, execution, "unknown", now);
    }
    return updatedCount;
  });
}

export async function finalizeReconciledPlanExecution(executionId: string): Promise<"committed" | "failed" | "unknown" | null> {
  return db.$transaction(async (tx) => {
    const actions = await tx.agentAction.findMany({
      where: { executionId }, select: { status: true },
    });
    if (actions.length === 0) return null;
    if (actions.some((action) => action.status === "unknown")) return "unknown";
    const status = actions.some((action) => (
      action.status === "error" || action.status === "policy_block"
    )) ? "failed" as const : "committed" as const;
    const updated = await tx.planExecution.updateMany({
      where: { id: executionId, status: "unknown" },
      data: { status, lastError: status === "committed" ? null : "reconciled_with_failures" },
    });
    if (updated.count === 1) {
      const execution = await tx.planExecution.findUniqueOrThrow({ where: { id: executionId } });
      // A task already moved to reconciling when uncertainty was recorded. The
      // exact execution remains its authority, so resolve that terminal state.
      if (execution.taskId && execution.proposalId) {
        await tx.agentTask.updateMany({
          where: {
            id: execution.taskId, organizationId: execution.organizationId,
            status: "reconciling", cancelledAt: null,
          },
          data: {
            status: status === "committed" ? "completed" : "failed",
            completedAt: status === "committed" ? new Date() : null,
            failureCode: status === "committed" ? null : "approved_execution_failed",
            lastProgressAt: new Date(),
          },
        });
        if (status === "committed") {
          await tx.agentProposal.updateMany({
            where: { id: execution.proposalId, taskId: execution.taskId, status: "approved" },
            data: { status: "completed", decidedAt: new Date() },
          });
        }
      }
    }
    return status;
  });
}
