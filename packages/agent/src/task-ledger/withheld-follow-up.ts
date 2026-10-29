// The one follow-up attempt queued when an approved message was withheld.

import { randomUUID } from "node:crypto";
import type { Prisma as PrismaTypes } from "@prisma/client";
import { db, Prisma } from "@shopkeeper/db";
import { ConflictError } from "../errors.js";
import type { ApprovedMessageWithheld } from "../agent-context.js";
import { NO_SUSPENSION, UNSETTLED_DISPATCH_STATES, activeTimeDeltaMs, checkpointSourceRequestIds, leaseExpiry, type TaskClaimIdentity } from "./shared.js";

// A support task whose approved message was withheld is queued for one attempt
// that tells the customer what actually happened. The marker names the
// execution it follows; a later customer message rewrites the checkpoint, which
// is what supersedes it.
export const WITHHELD_MESSAGE_FOLLOW_UP = "withheld_message_follow_up";

export interface WithheldMessageFollowUp {
  executionId: string;
  reason: ApprovedMessageWithheld;
}

export function withheldMessageFollowUp(checkpoint: unknown): WithheldMessageFollowUp | null {
  if (!checkpoint || typeof checkpoint !== "object" || Array.isArray(checkpoint)) return null;
  const source = checkpoint as Record<string, unknown>;
  if (source.nextWork !== WITHHELD_MESSAGE_FOLLOW_UP) return null;
  const followUp = source.followUp;
  if (!followUp || typeof followUp !== "object" || Array.isArray(followUp)) return null;
  const { executionId, reason } = followUp as Record<string, unknown>;
  if (typeof executionId !== "string") return null;
  if (reason !== "approved_action_failed" && reason !== "placeholder_unfilled") return null;
  return { executionId, reason };
}

/** The checkpoint of a task queued for a follow-up, keeping what it already records. */
export function withheldMessageFollowUpCheckpoint(
  checkpoint: unknown,
  followUp: WithheldMessageFollowUp,
): PrismaTypes.InputJsonObject {
  return {
    sourceRequestIds: checkpointSourceRequestIds(checkpoint),
    nextWork: WITHHELD_MESSAGE_FOLLOW_UP,
    followUp: { executionId: followUp.executionId, reason: followUp.reason },
  };
}

/**
 * Claims a support task queued for a withheld-message follow-up. Not
 * `claimAgentTask`, which refuses any task that reached a provider so nothing is
 * replayed from the top: this attempt runs *because* the approved writes ran,
 * and it may only read and draft. What it may not run beside is uncertainty — an
 * unsettled write, or an execution still claimed or unknown.
 */
export async function claimWithheldMessageFollowUp(
  input: TaskClaimIdentity & { now?: Date; leaseMs?: number },
) {
  const now = input.now ?? new Date();
  const claimToken = randomUUID();
  const leaseExpiresAt = leaseExpiry(now, input.leaseMs ?? 60000);
  return db.$transaction(async (tx) => {
    const won = await tx.agentTask.updateMany({
      where: {
        id: input.taskId, organizationId: input.organizationId, revision: input.expectedRevision,
        status: "queued", claimToken: null, cancelledAt: null,
        initiatingActorKind: "customer",
        checkpoint: { path: ["nextWork"], equals: WITHHELD_MESSAGE_FOLLOW_UP },
        organization: { lifecycleStatus: "active" },
        actions: { none: { dispatchState: { in: UNSETTLED_DISPATCH_STATES } } },
        executions: { none: { status: { in: ["claimed", "unknown"] } } },
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
    const followUp = withheldMessageFollowUp(task.checkpoint);
    if (!followUp) throw new ConflictError("The follow-up marker changed while it was claimed.");
    return { task, claimToken, followUp };
  });
}

/**
 * Ends a follow-up that parked nothing, in the outcome the approved execution
 * had: its writes committed or they failed, and the attempt that only drafted
 * changes neither. A stop that arrived meanwhile still wins, as `cancelled`.
 */
export async function finishWithheldMessageFollowUp(input: TaskClaimIdentity & {
  claimToken: string;
  outcome: "completed" | "failed";
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
    const status = ownedTask.cancelledAt ? "cancelled" as const : input.outcome;
    const finished = await tx.agentTask.updateMany({
      where: {
        id: input.taskId, organizationId: input.organizationId,
        revision: input.expectedRevision, status: "running", claimToken: input.claimToken,
      },
      data: {
        status,
        ...NO_SUSPENSION,
        failureCode: status === "failed" ? "approved_execution_failed" : null,
        ...(status === "completed" ? { completedAt: now } : {}),
        claimToken: null, leaseExpiresAt: null, activeCheckpointAt: null,
        activeTimeMsUsed: { increment: activeTimeDeltaMs(ownedTask.activeCheckpointAt, now) },
        lastProgressAt: now,
      },
    });
    return finished.count === 1;
  });
}
