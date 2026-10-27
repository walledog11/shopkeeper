// Settling or failing a claimed attempt, with the proposal or question it
// parks.

import { randomUUID } from "node:crypto";
import type { AgentActorKind, Prisma as PrismaTypes } from "@prisma/client";
import { db, Prisma } from "@shopkeeper/db";
import { BadRequestError, ConflictError } from "../errors.js";
import { hashPlan } from "../agent-actions.js";
import { communicationColumns } from "../proposal-communication.js";
import type { ProposalCommunication, RawToolCall } from "../types.js";
import { commitThreadPlanCacheIfCurrent, type AgentPlanCacheRecord } from "../plan-cache.js";
import { DISPATCHED_STATES, NO_SUSPENSION, activeTimeDeltaMs, type TaskClaimIdentity } from "./shared.js";
import type { TaskAnswerer } from "./wait-scope.js";

export const AGENT_PROPOSAL_SCHEMA_VERSION = 1;

/** The executable bundle a finished attempt wants the merchant to approve. */
export interface ProposalSnapshot {
  /**
   * The parked plan's own identity, which becomes the proposal's ID. The two are
   * required to be the same value by `plan_executions_proposal_identity_check`,
   * and it is what lets an approval name the exact durable proposal a card was
   * rendered from without the card carrying a second identifier.
   */
  proposalId?: string;
  instruction: string;
  rawToolCalls: RawToolCall[];
  /** The message the card shows with the bundle. Absent on legacy plans. */
  communication?: ProposalCommunication;
  sourceRequestIds: string[];
}

/**
 * What the finished attempt left the merchant waiting on. Status and the record
 * naming the wait are written together under one claim check, so
 * `waiting_approval` can never mean "waiting on something nothing can name".
 */
export type TaskSettlement =
  | { status: "completed" }
  | { status: "reconciling"; failureCode: string }
  | { status: "waiting_input"; question: string; answerer?: TaskAnswerer }
  | { status: "waiting_approval"; proposal: ProposalSnapshot; approver?: TaskAnswerer };

/**
 * Proposals are written `ready` and their status is not maintained here. Which
 * one the merchant is actually being asked about is `AgentTask.activeProposalId`
 * and nothing else, so a superseded snapshot cannot contradict the task it
 * belongs to. Approval owns the later status transitions.
 */
async function persistProposal(
  tx: Pick<typeof db, "agentProposal">,
  task: { id: string; organizationId: string; revision: number },
  snapshot: ProposalSnapshot,
  approver: TaskAnswerer,
): Promise<string> {
  if (snapshot.rawToolCalls.length === 0) {
    throw new BadRequestError("A proposal must contain at least one action.");
  }
  const proposalHash = hashPlan(snapshot);
  const identity = {
    organizationId: task.organizationId, taskId: task.id,
    taskRevision: task.revision, proposalHash,
  };
  // A replayed attempt at the same revision re-proposes the same bundle. It is
  // the same thing to approve, so it reuses the row rather than conflicting on
  // the snapshot key. Callers must project this returned identity onto the card;
  // an unmatched cache identity cannot authorize execution.
  const existing = await tx.agentProposal.findUnique({
    where: { organizationId_taskId_taskRevision_proposalHash: identity },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await tx.agentProposal.create({
    data: {
      ...identity,
      ...(snapshot.proposalId ? { id: snapshot.proposalId } : {}),
      schemaVersion: AGENT_PROPOSAL_SCHEMA_VERSION,
      instruction: snapshot.instruction,
      approverScopeKind: approver.kind,
      approverScopeKey: approver.key,
      canonicalActions: snapshot.rawToolCalls as unknown as PrismaTypes.InputJsonValue,
      ...communicationColumns(snapshot.communication),
      dependencies: [],
      sourceRequestIds: snapshot.sourceRequestIds,
    },
    select: { id: true },
  });
  return created.id;
}

async function suspensionWrite(
  tx: Pick<typeof db, "agentProposal">,
  task: {
    id: string; organizationId: string; revision: number;
    initiatingActorKind: AgentActorKind; initiatingActorKey: string;
  },
  settlement: TaskSettlement,
) {
  if (settlement.status === "completed" || settlement.status === "reconciling") {
    return NO_SUSPENSION;
  }
  if (settlement.status === "waiting_input") {
    const question = settlement.question.trim();
    if (!question) throw new BadRequestError("A parked question must have text.");
    return {
      ...NO_SUSPENSION,
      pendingQuestionId: randomUUID(),
      pendingQuestion: question.slice(0, 2000),
      // The merchant who asked for the work is the one who may answer it; an
      // unrelated sender's message is not an answer to this question. A support
      // task is the case that must name its own: the customer initiated it and
      // the question goes to the merchant, so the attempt says who.
      pendingAnswererKind: settlement.answerer?.kind ?? task.initiatingActorKind,
      pendingAnswererKey: settlement.answerer?.key ?? task.initiatingActorKey,
    };
  }
  // Defaulted to the initiator, which is what the approval boundary used to
  // derive, so a member's own task is unchanged. Support overrides it: the
  // customer who initiated the task approves nothing.
  return {
    ...NO_SUSPENSION,
    activeProposalId: await persistProposal(tx, task, settlement.proposal, {
      kind: settlement.approver?.kind ?? task.initiatingActorKind,
      key: settlement.approver?.key ?? task.initiatingActorKey,
    }),
  };
}

export async function settleAgentTaskClaim(input: TaskClaimIdentity & {
  claimToken: string;
  requestId: string;
  settlement: TaskSettlement;
  /** Publish the composer projection together with its durable wait. */
  planCache?: { threadId: string; sourceMessageId: string; cache: AgentPlanCacheRecord };
}) {
  return db.$transaction(async (tx) => {
    if (input.planCache) {
      // Composer acceptance takes these locks in the same order.
      await tx.$queryRaw(Prisma.sql`
        SELECT id FROM threads WHERE id = ${input.planCache.threadId}::uuid
        AND organization_id = ${input.organizationId}::uuid FOR UPDATE
      `);
    }
    await tx.$queryRaw(Prisma.sql`
      SELECT id FROM agent_tasks WHERE id = ${input.taskId}::uuid
      AND organization_id = ${input.organizationId}::uuid FOR UPDATE
    `);
    const now = new Date();
    const ownedTask = await tx.agentTask.findFirst({
      where: {
        id: input.taskId, organizationId: input.organizationId,
        revision: input.expectedRevision, status: "running", claimToken: input.claimToken,
      },
    });
    if (!ownedTask || (input.planCache && (
      ownedTask.cancelledAt || !ownedTask.leaseExpiresAt || ownedTask.leaseExpiresAt <= now
    ))) return false;
    if (input.planCache) {
      const committed = await commitThreadPlanCacheIfCurrent({
        orgId: input.organizationId, ...input.planCache, taskClaim: input,
      }, tx);
      if (!committed) throw new ConflictError("The customer message changed before this draft was published.");
    }
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
            dispatchState: { in: DISPATCHED_STATES },
          },
        })
      : 0;
    const status = ownedTask.cancelledAt
      ? consequential > 0 ? "reconciling" as const : "cancelled" as const
      : input.settlement.status;
    // A stop overrides what the attempt wanted to wait on, so the stopped task
    // is left pointing at no proposal and no question.
    const suspension = ownedTask.cancelledAt
      ? NO_SUSPENSION
      : await suspensionWrite(tx, ownedTask, input.settlement);
    const activeTimeMs = activeTimeDeltaMs(ownedTask.activeCheckpointAt, now);
    const settled = await tx.agentTask.updateMany({
      where: {
        id: input.taskId, organizationId: input.organizationId,
        revision: input.expectedRevision, status: "running", claimToken: input.claimToken,
      },
      data: {
        status,
        ...suspension,
        claimToken: null,
        leaseExpiresAt: null,
        activeCheckpointAt: null,
        lastProgressAt: now,
        ...(status === "completed" ? { completedAt: now } : {}),
        ...(status === "reconciling"
          ? {
              failureCode: ownedTask.cancelledAt
                ? "cancelled_after_dispatch"
                : input.settlement.status === "reconciling"
                  ? input.settlement.failureCode
                  : "reconciliation_required",
            }
          : {}),
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
        dispatchState: { in: DISPATCHED_STATES },
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
        ...NO_SUSPENSION,
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
