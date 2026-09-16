import { randomUUID } from "node:crypto";
import { db, Prisma } from "@shopkeeper/db";
import { BadRequestError, ConflictError, ForbiddenError } from "./errors.js";
import { hashInstruction } from "./agent-actions.js";

// Customer/system adapters require their own verified identity boundary.
export interface MemberRequestInput {
  organizationId: string;
  clerkUserId: string;
  threadId: string;
  dedupeKey: string;
  instruction: string;
  budget?: TaskBudget;
}

export interface TaskBudget {
  runtimeVersion: number;
  modelCallLimit: number;
  activeTimeMsLimit: number;
  spendNanoUsdLimit: bigint;
}

function validateTaskBudget(budget: TaskBudget): void {
  for (const value of [budget.runtimeVersion, budget.modelCallLimit, budget.activeTimeMsLimit]) {
    if (!Number.isSafeInteger(value) || value <= 0 || value > 2147483647) {
      throw new BadRequestError("Runtime version and task limits must be positive integers.");
    }
  }
  if (budget.spendNanoUsdLimit <= 0n) throw new BadRequestError("Spend limit must be positive.");
}

async function memberThread(tx: Pick<typeof db, "orgMember" | "thread">, input: {
  organizationId: string; clerkUserId: string; threadId?: string;
}) {
  const member = await tx.orgMember.findUnique({
    where: { organizationId_clerkUserId: {
      organizationId: input.organizationId, clerkUserId: input.clerkUserId,
    } },
  });
  if (!member) throw new ForbiddenError("Current organization membership is required.");
  const actorKey = `member:${member.id}`;
  if (input.threadId) {
    const thread = await tx.thread.findFirst({
      where: {
        id: input.threadId, organizationId: input.organizationId,
        operatorKey: actorKey, deletedAt: null, archivedAt: null,
        organization: { lifecycleStatus: "active" },
      },
      select: { id: true },
    });
    if (!thread) throw new ForbiddenError("This conversation is not available to the member.");
  }
  return actorKey;
}

export async function acceptMemberAgentRequest(input: MemberRequestInput) {
  if (input.budget) validateTaskBudget(input.budget);
  const instruction = input.instruction.trim();
  if (!instruction || instruction.length > 16000) {
    throw new BadRequestError("Instruction must contain 1–16000 characters.");
  }
  if (!input.dedupeKey.trim() || input.dedupeKey.length > 255) {
    throw new BadRequestError("A bounded, stable request key is required.");
  }
  // Fixed, server-authored envelope; the client cannot supply a hash.
  const payload = { version: 1, threadId: input.threadId, instruction };
  const payloadHash = hashInstruction(JSON.stringify(payload));
  if (Buffer.byteLength(JSON.stringify(payload)) > 60000) {
    throw new BadRequestError("Request payload is too large.");
  }
  return db.$transaction(async (tx) => {
    const actorKey = await memberThread(tx, input);
    const id = randomUUID();
    await tx.agentRequest.createMany({
      data: {
        id, organizationId: input.organizationId, actorKey, actorKind: "member",
        channel: "dashboard_agent", threadId: input.threadId,
        dedupeKey: input.dedupeKey, payloadVersion: 1, payloadHash, payload,
        normalizedInstruction: instruction,
      },
      skipDuplicates: true,
    });
    let request = await tx.agentRequest.findUniqueOrThrow({
      where: { organizationId_actorKind_actorKey_channel_dedupeKey: {
        organizationId: input.organizationId, actorKind: "member", actorKey,
        channel: "dashboard_agent", dedupeKey: input.dedupeKey,
      } },
    });
    if (request.payloadVersion !== 1 || request.payloadHash !== payloadHash) {
      throw new ConflictError("This request key was already used with a different instruction.");
    }
    let task = null;
    if (input.budget) {
      await tx.$queryRaw(Prisma.sql`
        SELECT id FROM agent_requests WHERE id = ${request.id}::uuid
        AND organization_id = ${input.organizationId}::uuid FOR UPDATE
      `);
      request = await tx.agentRequest.findUniqueOrThrow({ where: { id: request.id } });
      if (request.taskId) {
        task = await tx.agentTask.findFirstOrThrow({
          where: { id: request.taskId, organizationId: input.organizationId },
        });
      } else {
        task = await tx.agentTask.create({
          data: {
            organizationId: input.organizationId, threadId: request.threadId,
            initiatingActorKind: "member", initiatingActorKey: actorKey,
            objective: request.normalizedInstruction.slice(0, 4000),
            ...input.budget, checkpointVersion: 1,
            checkpoint: { sourceRequestIds: [request.id], nextWork: "investigate" },
          },
        });
        request = await tx.agentRequest.update({
          where: { id: request.id, organizationId: input.organizationId },
          data: { state: "attached", taskId: task.id, attachedAt: new Date() },
        });
      }
    }
    return { request, task, deduplicated: request.id !== id };
  });
}

export async function getMemberAgentRequest(input: {
  organizationId: string; clerkUserId: string; requestId: string;
}) {
  return db.$transaction(async (tx) => {
    const actorKey = await memberThread(tx, {
      organizationId: input.organizationId, clerkUserId: input.clerkUserId,
    });
    return tx.agentRequest.findFirst({
      where: {
        id: input.requestId, organizationId: input.organizationId,
        actorKind: "member", actorKey,
        thread: { operatorKey: actorKey, deletedAt: null, archivedAt: null },
      },
      include: {
        task: {
          include: {
            messages: {
              where: { senderType: "agent", deletedAt: null },
              orderBy: [{ sentAt: "desc" }, { id: "desc" }],
              take: 1,
            },
            actions: { where: { turnId: input.requestId }, orderBy: [{ actionIndex: "asc" }, { createdAt: "asc" }] },
          },
        },
      },
    });
  });
}

export async function listMemberAgentRequests(input: {
  organizationId: string; clerkUserId: string; limit?: number;
}) {
  const limit = input.limit ?? 20;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    throw new BadRequestError("Request history limit must be 1–50.");
  }
  return db.$transaction(async (tx) => {
    const actorKey = await memberThread(tx, input);
    return tx.agentRequest.findMany({
      where: {
        organizationId: input.organizationId, actorKind: "member", actorKey,
        thread: { operatorKey: actorKey, deletedAt: null, archivedAt: null },
      },
      orderBy: [{ acceptedAt: "desc" }, { id: "desc" }],
      take: limit,
      include: {
        task: {
          include: {
            messages: {
              where: { senderType: "agent", deletedAt: null },
              orderBy: [{ sentAt: "desc" }, { id: "desc" }],
              take: 1,
            },
            actions: { orderBy: [{ actionIndex: "asc" }, { createdAt: "asc" }] },
          },
        },
      },
    });
  });
}

export async function attachMemberAgentTask(input: {
  organizationId: string; clerkUserId: string; requestId: string; budget: TaskBudget;
}) {
  validateTaskBudget(input.budget);
  return db.$transaction(async (tx) => {
    const actorKey = await memberThread(tx, input);
    // Serialize initial attachment using the accepted request's durable row.
    await tx.$queryRaw(Prisma.sql`
      SELECT id FROM agent_requests WHERE id = ${input.requestId}::uuid
      AND organization_id = ${input.organizationId}::uuid
      AND actor_kind = 'member' AND actor_key = ${actorKey} FOR UPDATE
    `);
    const request = await tx.agentRequest.findFirst({
      where: { id: input.requestId, organizationId: input.organizationId, actorKind: "member", actorKey },
    });
    if (!request) throw new ForbiddenError("Request is not available to this member.");
    await memberThread(tx, { ...input, threadId: request.threadId });
    if (request.taskId) {
      return tx.agentTask.findFirstOrThrow({
        where: { id: request.taskId, organizationId: input.organizationId },
      });
    }
    const task = await tx.agentTask.create({
      data: {
        organizationId: input.organizationId, threadId: request.threadId,
        initiatingActorKind: "member", initiatingActorKey: actorKey,
        objective: request.normalizedInstruction.slice(0, 4000),
        ...input.budget, checkpointVersion: 1,
        checkpoint: { sourceRequestIds: [request.id], nextWork: "investigate" },
      },
    });
    await tx.agentRequest.update({
      where: { id: request.id, organizationId: input.organizationId },
      data: { state: "attached", taskId: task.id, attachedAt: new Date() },
    });
    return task;
  });
}

export interface TaskClaimIdentity {
  organizationId: string; taskId: string; expectedRevision: number;
}

export interface ActiveTaskClaim extends TaskClaimIdentity {
  claimToken: string;
}

export type TaskClaimControlState = "active" | "cancelled" | "budget_exhausted" | "claim_lost";

export interface TaskModelUsageDelta {
  inputTokens: number;
  outputTokens: number;
  spentNanoUsd: bigint;
}

function validateUsageDelta(usage: TaskModelUsageDelta): void {
  if (
    !Number.isSafeInteger(usage.inputTokens) || usage.inputTokens < 0
    || !Number.isSafeInteger(usage.outputTokens) || usage.outputTokens < 0
    || usage.spentNanoUsd < 0n
  ) {
    throw new BadRequestError("Task usage deltas must be non-negative integers.");
  }
}

function activeTimeDeltaMs(checkpoint: Date | null, now: Date): number {
  if (!checkpoint) return 0;
  return Math.max(0, Math.min(2147483647, now.getTime() - checkpoint.getTime()));
}

function leaseExpiry(now: Date, leaseMs: number): Date {
  if (!Number.isFinite(now.getTime()) || !Number.isInteger(leaseMs) || leaseMs <= 0 || leaseMs > 300000) {
    throw new BadRequestError("Lease duration must be 1–300000 ms.");
  }
  return new Date(now.getTime() + leaseMs);
}

// Only fresh queued work is claimable here. Recovery must inspect dispatched
// operations and any interrupted legacy attempt before requeuing running work.
export async function claimAgentTask(input: TaskClaimIdentity & { now?: Date; leaseMs?: number }) {
  const now = input.now ?? new Date();
  const claimToken = randomUUID();
  const leaseExpiresAt = leaseExpiry(now, input.leaseMs ?? 60000);
  return db.$transaction(async (tx) => {
    const won = await tx.agentTask.updateMany({
      where: {
        id: input.taskId, organizationId: input.organizationId, revision: input.expectedRevision,
        status: "queued", claimToken: null, cancelledAt: null,
        organization: { lifecycleStatus: "active" },
        actions: { none: { dispatchState: { in: ["dispatch_authorized", "submitted", "unknown", "settled"] } } },
        executions: { none: { status: { in: ["claimed", "committed", "unknown"] } } },
      },
      data: {
        status: "running", claimToken, leaseExpiresAt,
        activeCheckpointAt: now, lastProgressAt: now,
      },
    });
    if (won.count !== 1) return null;
    const task = await tx.agentTask.findFirstOrThrow({
      where: { id: input.taskId, organizationId: input.organizationId, claimToken },
    });
    return { task, claimToken };
  });
}

export async function renewAgentTaskLease(input: TaskClaimIdentity & {
  claimToken: string; now?: Date; leaseMs?: number;
}) {
  const now = input.now ?? new Date();
  const leaseExpiresAt = leaseExpiry(now, input.leaseMs ?? 60000);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT id FROM agent_tasks WHERE id = ${input.taskId}::uuid
      AND organization_id = ${input.organizationId}::uuid FOR UPDATE
    `);
    const task = await tx.agentTask.findFirst({
      where: {
        id: input.taskId, organizationId: input.organizationId,
        revision: input.expectedRevision, status: "running",
        claimToken: input.claimToken, leaseExpiresAt: { gt: now }, cancelledAt: null,
      },
    });
    if (!task) return false;
    const activeTimeMs = activeTimeDeltaMs(task.activeCheckpointAt, now);
    const updated = await tx.agentTask.updateMany({
      where: {
        id: input.taskId, organizationId: input.organizationId,
        revision: input.expectedRevision, status: "running",
        claimToken: input.claimToken, cancelledAt: null,
      },
      data: {
        activeTimeMsUsed: { increment: activeTimeMs },
        activeCheckpointAt: now, leaseExpiresAt, lastProgressAt: now,
      },
    });
    return updated.count === 1;
  });
}

/**
 * Reserves one model-call slot before contacting the provider. The reservation
 * is deliberately durable before the network call: a process death may waste a
 * slot, but it cannot reset the cumulative call budget and retry indefinitely.
 */
export async function reserveAgentTaskModelCall(
  input: ActiveTaskClaim & { now?: Date },
): Promise<TaskClaimControlState> {
  const now = input.now ?? new Date();
  return db.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`
      SELECT id FROM agent_tasks WHERE id = ${input.taskId}::uuid
      AND organization_id = ${input.organizationId}::uuid FOR UPDATE
    `);
    const task = await tx.agentTask.findFirst({
      where: { id: input.taskId, organizationId: input.organizationId },
    });
    if (
      !task || task.status !== "running" || task.revision !== input.expectedRevision
      || task.claimToken !== input.claimToken || !task.leaseExpiresAt
      || task.leaseExpiresAt <= now
    ) return "claim_lost";

    const activeTimeMs = activeTimeDeltaMs(task.activeCheckpointAt, now);
    const nextActiveTime = Math.min(2147483647, task.activeTimeMsUsed + activeTimeMs);
    if (task.cancelledAt) {
      await tx.agentTask.update({
        where: { id: task.id },
        data: { activeTimeMsUsed: nextActiveTime, activeCheckpointAt: now, lastProgressAt: now },
      });
      return "cancelled";
    }
    if (
      task.modelCallsUsed >= task.modelCallLimit
      || nextActiveTime >= task.activeTimeMsLimit
      || task.spentNanoUsd >= task.spendNanoUsdLimit
    ) {
      await tx.agentTask.update({
        where: { id: task.id },
        data: { activeTimeMsUsed: nextActiveTime, activeCheckpointAt: now, lastProgressAt: now },
      });
      return "budget_exhausted";
    }
    await tx.agentTask.update({
      where: { id: task.id },
      data: {
        modelCallsUsed: { increment: 1 },
        activeTimeMsUsed: nextActiveTime,
        activeCheckpointAt: now,
        lastProgressAt: now,
      },
    });
    return "active";
  });
}

/** Persist the measured response cost immediately, before any resulting tool runs. */
export async function recordAgentTaskModelUsage(
  input: ActiveTaskClaim & { usage: TaskModelUsageDelta; now?: Date },
): Promise<boolean> {
  validateUsageDelta(input.usage);
  const now = input.now ?? new Date();
  const updated = await db.agentTask.updateMany({
    where: {
      id: input.taskId, organizationId: input.organizationId,
      revision: input.expectedRevision, status: "running", claimToken: input.claimToken,
    },
    data: {
      inputTokensUsed: { increment: input.usage.inputTokens },
      outputTokensUsed: { increment: input.usage.outputTokens },
      spentNanoUsd: { increment: input.usage.spentNanoUsd },
      lastProgressAt: now,
    },
  });
  return updated.count === 1;
}

export async function settleAgentTaskClaim(input: TaskClaimIdentity & {
  claimToken: string;
  requestId: string;
  status: "completed" | "waiting_input" | "waiting_approval";
}) {
  return db.$transaction(async (tx) => {
    const now = new Date();
    await tx.$queryRaw(Prisma.sql`
      SELECT id FROM agent_tasks WHERE id = ${input.taskId}::uuid
      AND organization_id = ${input.organizationId}::uuid FOR UPDATE
    `);
    const ownedTask = await tx.agentTask.findFirst({
      where: {
        id: input.taskId, organizationId: input.organizationId,
        revision: input.expectedRevision, status: "running", claimToken: input.claimToken,
      },
    });
    if (!ownedTask) return false;
    await tx.agentAction.updateMany({
      where: {
        organizationId: input.organizationId, turnId: input.requestId,
        OR: [{ taskId: null }, { taskId: input.taskId }],
      },
      data: { taskId: input.taskId },
    });
    const consequential = ownedTask.cancelledAt
      ? await tx.agentAction.count({
          where: {
            organizationId: input.organizationId, taskId: input.taskId,
            dispatchState: { in: ["dispatch_authorized", "submitted", "unknown", "settled"] },
          },
        })
      : 0;
    const status = ownedTask.cancelledAt
      ? consequential > 0 ? "reconciling" as const : "cancelled" as const
      : input.status;
    const activeTimeMs = activeTimeDeltaMs(ownedTask.activeCheckpointAt, now);
    const settled = await tx.agentTask.updateMany({
      where: {
        id: input.taskId, organizationId: input.organizationId,
        revision: input.expectedRevision, status: "running", claimToken: input.claimToken,
      },
      data: {
        status,
        claimToken: null,
        leaseExpiresAt: null,
        activeCheckpointAt: null,
        lastProgressAt: now,
        ...(status === "completed" ? { completedAt: now } : {}),
        ...(status === "reconciling" ? { failureCode: "cancelled_after_dispatch" } : {}),
        activeTimeMsUsed: { increment: activeTimeMs },
      },
    });
    return settled.count === 1;
  });
}

export async function failAgentTaskClaim(input: TaskClaimIdentity & {
  claimToken: string; requestId: string; failureCode: string;
}) {
  return db.$transaction(async (tx) => {
    const now = new Date();
    await tx.$queryRaw(Prisma.sql`
      SELECT id FROM agent_tasks WHERE id = ${input.taskId}::uuid
      AND organization_id = ${input.organizationId}::uuid FOR UPDATE
    `);
    const ownedTask = await tx.agentTask.findFirst({
      where: {
        id: input.taskId, organizationId: input.organizationId,
        revision: input.expectedRevision, status: "running", claimToken: input.claimToken,
      },
    });
    if (!ownedTask) return null;
    await tx.agentAction.updateMany({
      where: {
        organizationId: input.organizationId, turnId: input.requestId,
        OR: [{ taskId: null }, { taskId: input.taskId }],
      },
      data: { taskId: input.taskId },
    });
    const consequential = await tx.agentAction.count({
      where: {
        organizationId: input.organizationId, taskId: input.taskId,
        dispatchState: { in: ["dispatch_authorized", "submitted", "unknown", "settled"] },
      },
    });
    const status = consequential > 0
      ? "reconciling"
      : ownedTask.cancelledAt ? "cancelled" : "failed";
    const activeTimeMs = activeTimeDeltaMs(ownedTask.activeCheckpointAt, now);
    const failed = await tx.agentTask.updateMany({
      where: {
        id: input.taskId, organizationId: input.organizationId,
        revision: input.expectedRevision, status: "running", claimToken: input.claimToken,
      },
      data: {
        status,
        failureCode: (ownedTask.cancelledAt
          ? consequential > 0 ? "cancelled_after_dispatch" : null
          : input.failureCode.slice(0, 64)),
        claimToken: null, leaseExpiresAt: null, activeCheckpointAt: null,
        activeTimeMsUsed: { increment: activeTimeMs }, lastProgressAt: now,
      },
    });
    return failed.count === 1 ? status : null;
  });
}

export async function findQueuedAgentTasks(limit = 100) {
  return db.agentTask.findMany({
    where: { status: "queued", claimToken: null, cancelledAt: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit,
    select: { id: true, organizationId: true, revision: true },
  });
}

// A cancelled attempt is only definitely over when nothing reached the
// provider. Anything dispatched still owes reconciliation, exactly as the
// worker-side settle and fail paths decide it.
export async function reconcileExpiredAgentTaskClaims(now = new Date()) {
  const dispatched = Prisma.sql`EXISTS (
    SELECT 1 FROM agent_actions a
    WHERE a.task_id = agent_tasks.id AND a.organization_id = agent_tasks.organization_id
    AND a.dispatch_state IN ('dispatch_authorized', 'submitted', 'unknown', 'settled')
  )`;
  return db.$executeRaw(Prisma.sql`
    UPDATE agent_tasks
    SET status = CASE WHEN cancelled_at IS NOT NULL AND NOT ${dispatched}
                      THEN 'cancelled'::"AgentTaskStatus"
                      ELSE 'reconciling'::"AgentTaskStatus" END,
        failure_code = CASE
          WHEN cancelled_at IS NULL THEN 'interrupted_attempt'
          WHEN ${dispatched} THEN 'cancelled_after_dispatch'
          ELSE NULL END,
        active_time_ms_used = LEAST(2147483647,
          active_time_ms_used + GREATEST(0, FLOOR(EXTRACT(EPOCH FROM
            (${now}::timestamptz - active_checkpoint_at)) * 1000)::integer)),
        claim_token = NULL,
        lease_expires_at = NULL,
        active_checkpoint_at = NULL,
        last_progress_at = ${now}
    WHERE status = 'running' AND lease_expires_at <= ${now}
  `);
}

/**
 * Records a member stop request at the task-row ordering point shared with
 * action dispatch. Running work keeps its claim long enough to record an
 * in-flight model response, while every later dispatch observes cancelledAt.
 */
export async function cancelMemberAgentTask(input: {
  organizationId: string;
  clerkUserId: string;
  taskId: string;
  expectedRevision: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return db.$transaction(async (tx) => {
    const actorKey = await memberThread(tx, input);
    await tx.$queryRaw(Prisma.sql`
      SELECT id FROM agent_tasks WHERE id = ${input.taskId}::uuid
      AND organization_id = ${input.organizationId}::uuid FOR UPDATE
    `);
    const task = await tx.agentTask.findFirst({
      where: {
        id: input.taskId, organizationId: input.organizationId,
        initiatingActorKind: "member", initiatingActorKey: actorKey,
        thread: { operatorKey: actorKey, deletedAt: null, archivedAt: null },
      },
    });
    if (!task) throw new ForbiddenError("Task is not available to this member.");
    if (task.revision !== input.expectedRevision) {
      throw new ConflictError("The task changed before cancellation was recorded.");
    }
    if (["completed", "failed", "cancelled"].includes(task.status)) return task;

    const consequential = await tx.agentAction.count({
      where: {
        organizationId: input.organizationId, taskId: input.taskId,
        dispatchState: { in: ["dispatch_authorized", "submitted", "unknown", "settled"] },
      },
    });
    const running = task.status === "running";
    const status = running
      ? "running" as const
      : consequential > 0 ? "reconciling" as const : "cancelled" as const;
    return tx.agentTask.update({
      where: { id: task.id },
      data: {
        status,
        cancelledAt: task.cancelledAt ?? now,
        failureCode: consequential > 0 ? "cancelled_after_dispatch" : null,
        lastProgressAt: now,
        ...(!running ? {
          claimToken: null, leaseExpiresAt: null, activeCheckpointAt: null,
        } : {}),
      },
    });
  });
}
