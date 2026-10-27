// Claiming a queued task, renewing its lease, and charging its budget.

import { requireDurableAgentRuntime } from "../runtime-modes.js";
import { randomUUID } from "node:crypto";
import { db, Prisma } from "@shopkeeper/db";
import { BadRequestError } from "../errors.js";
import { DISPATCHED_STATES, activeTimeDeltaMs, leaseExpiry, type ActiveTaskClaim, type TaskClaimIdentity } from "./shared.js";

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
        actions: { none: { dispatchState: { in: DISPATCHED_STATES } } },
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
    requireDurableAgentRuntime(task.runtimeVersion);
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
