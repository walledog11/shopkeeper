// The merchant's answer or revision continuing the task that waited on it.

import { requireDurableAgentRuntime } from "../runtime-modes.js";
import { randomUUID } from "node:crypto";
import type { ChannelType, Prisma as PrismaTypes } from "@prisma/client";
import { db, Prisma } from "@shopkeeper/db";
import { BadRequestError, ConflictError } from "../errors.js";
import { hashInstruction } from "../agent-actions.js";
import { requireMemberActorKey } from "./member-requests.js";
import { DISPATCHED_STATES, NO_SUSPENSION, leaseExpiry, supersedeActiveProposal, type ActiveTaskClaim } from "./shared.js";
import { endsWaitScopeKeys } from "./wait-scope.js";

/** A claim on a task that was waiting, plus the request the attempt advances. */
export interface ContinuedTaskClaim extends ActiveTaskClaim {
  requestId: string;
  runtimeVersion: number;
}

/**
 * Which wait the merchant's input ends. They are two waits, not one: an answer
 * is a response to a question and guidance is a response to a card, and a model
 * that reaches for the wrong tool must not silently end the other one.
 */
export type EndedWait = "question" | "proposal";

/**
 * The tasks a member's input may continue, as one predicate. The candidate scan
 * and the re-read under the lock below are both written from it, so what the
 * lookup finds and what the claim checks cannot drift into different answers
 * about which task this input belongs to.
 */
function continuableTaskWhere(
  input: { organizationId: string; threadId: string; endsWait: EndedWait; proposalId?: string },
  actorKey: string,
): PrismaTypes.AgentTaskWhereInput {
  const scopeKeys = endsWaitScopeKeys({ kind: "member", key: actorKey });
  return {
    organizationId: input.organizationId, threadId: input.threadId,
    cancelledAt: null, claimToken: null,
    organization: { lifecycleStatus: "active" },
    thread: { deletedAt: null, archivedAt: null },
    actions: { none: { dispatchState: { in: DISPATCHED_STATES } } },
    executions: { none: { status: { in: ["claimed", "committed", "unknown"] } } },
    ...(input.endsWait === "question"
      ? {
          status: "waiting_input" as const,
          pendingAnswererKind: "member" as const,
          pendingAnswererKey: { in: scopeKeys },
        }
      : {
          status: "waiting_approval" as const,
          // An approval wait records its scope on the proposal the card was
          // rendered from rather than on the task, so that is where who may end
          // it is read from. `ready` is the other half of the rule: an approved
          // proposal belongs to the run it authorized, and revising it would
          // re-draft a decision that has already been made.
          activeProposal: {
            is: {
              ...(input.proposalId ? { id: input.proposalId } : {}),
              status: "ready" as const,
              approverScopeKind: "member" as const,
              approverScopeKey: { in: scopeKeys },
            },
          },
        }),
  };
}

/**
 * The merchant's half of `authorizeAgentProposal`: an authenticated member's
 * answer or revision ends the wait the attempt recorded, and the attempt that
 * re-plans on it takes the task's claim.
 *
 * Ending the wait and claiming are one transition rather than a resume followed
 * by `claimAgentTask`. A support task left `queued` between the two would be
 * picked up by nothing — `findQueuedAgentTasks` hands the worker
 * member-initiated work only — whereas a claim whose process dies expires on its
 * lease and the sweep reconciles it. The revision increment is the supersede:
 * whatever the task was parked on stops being current, exactly as a later
 * customer message supersedes it in `advanceOrOpenThreadTask`.
 *
 * The task row is locked before the decision because approval does not move the
 * task or its revision — it writes the proposal and leaves the task
 * `waiting_approval` until the run completes — so the revision check alone would
 * let guidance claim a task whose card was approved a moment ago. The re-read
 * under the lock is what sees that, and the lock is what keeps the two from
 * interleaving at all.
 *
 * Null means this input is not the task's to continue: nothing is waiting on
 * this thread, the member is outside the recorded scope, two parked waits make
 * the input ambiguous, another attempt already owns the task, or it reached a
 * provider and so cannot be replayed from the top. Callers must distinguish the
 * missing wait from authority to start new work; historical questions require
 * regeneration through the normal durable entry point.
 */
export async function claimContinuedAgentTask(input: {
  organizationId: string;
  clerkUserId: string;
  threadId: string;
  endsWait: EndedWait;
  /**
   * The card the merchant is revising. A revision of a card that has since been
   * replaced must not land on its replacement, which they have not read.
   */
  proposalId?: string;
  /** The merchant input that ends the wait; persisted before the claim moves. */
  continuationInstruction?: string;
  continuationChannel?: ChannelType;
  now?: Date;
  leaseMs?: number;
}): Promise<ContinuedTaskClaim | null> {
  const now = input.now ?? new Date();
  const claimToken = randomUUID();
  const leaseExpiresAt = leaseExpiry(now, input.leaseMs ?? 60000);
  return db.$transaction(async (tx) => {
    // Tenant membership only. The thread a support wait was recorded on is the
    // customer's, not this member's own operator thread, which is why the
    // threadId is deliberately not passed to the membership check and the
    // thread is scoped by organization in the predicate instead.
    const actorKey = await requireMemberActorKey(tx, {
      organizationId: input.organizationId, clerkUserId: input.clerkUserId,
    });
    const continuable = continuableTaskWhere(input, actorKey);
    const waiting = await tx.agentTask.findMany({
      where: continuable, select: { id: true }, take: 2,
    });
    if (waiting.length !== 1) return null;
    const candidateId = waiting[0]!.id;
    // The ordering point action dispatch, stops and approval already serialize
    // on, so whichever of them is in flight is wholly before or wholly after
    // this claim.
    await tx.$queryRaw(Prisma.sql`
      SELECT id FROM agent_tasks WHERE id = ${candidateId}::uuid
      AND organization_id = ${input.organizationId}::uuid FOR UPDATE
    `);
    const target = await tx.agentTask.findFirst({
      where: { ...continuable, id: candidateId },
      select: {
        id: true, threadId: true, revision: true, status: true, runtimeVersion: true,
        activeProposalId: true, pendingQuestionId: true,
      },
    });
    if (!target) return null;
    requireDurableAgentRuntime(target.runtimeVersion);
    let request: { id: string } | null;
    const instruction = input.continuationInstruction?.trim() ?? "";
    if (instruction) {
      if (instruction.length > 16000) throw new BadRequestError("Instruction must contain 1–16000 characters.");
      const waitIdentity = input.endsWait === "question"
        ? target.pendingQuestionId
        : target.activeProposalId;
      if (!waitIdentity) return null;
      const channel = input.continuationChannel ?? "operator";
      const payload = {
        version: 1,
        threadId: target.threadId,
        taskId: target.id,
        waitKind: input.endsWait,
        waitIdentity,
        instruction,
      };
      const payloadHash = hashInstruction(JSON.stringify(payload));
      const dedupeKey = `continuation:${input.endsWait}:${waitIdentity}:${hashInstruction(instruction)}`;
      const requestId = randomUUID();
      // The answer belongs to the same customer message as the work it resumes.
      // Approval reads this reference from the proposal's source requests.
      const source = await tx.agentRequest.findFirst({
        where: {
          organizationId: input.organizationId, taskId: target.id,
          sourceMessageId: { not: null },
        },
        orderBy: [{ acceptedAt: "desc" }, { id: "desc" }],
        select: { sourceMessageId: true },
      });
      await tx.agentRequest.createMany({
        data: {
          id: requestId,
          organizationId: input.organizationId,
          actorKind: "member",
          actorKey,
          channel,
          threadId: target.threadId,
          sourceMessageId: source?.sourceMessageId ?? null,
          dedupeKey,
          payloadVersion: 1,
          payloadHash,
          payload,
          normalizedInstruction: instruction,
          state: "attached",
          taskId: target.id,
          attachedAt: now,
        },
        skipDuplicates: true,
      });
      const accepted = await tx.agentRequest.findUniqueOrThrow({
        where: { organizationId_actorKind_actorKey_channel_dedupeKey: {
          organizationId: input.organizationId,
          actorKind: "member",
          actorKey,
          channel,
          dedupeKey,
        } },
        select: { id: true, payloadHash: true, taskId: true },
      });
      if (accepted.payloadHash !== payloadHash || accepted.taskId !== target.id) {
        throw new ConflictError("This continuation was already recorded for different work.");
      }
      request = accepted;
    } else {
      // Compatibility callers advance the newest request already attached to
      // the task. Migrated answer/revision surfaces always take the branch above.
      request = await tx.agentRequest.findFirst({
        where: { organizationId: input.organizationId, taskId: target.id },
        orderBy: [{ acceptedAt: "desc" }, { id: "desc" }],
        select: { id: true },
      });
    }
    if (!request) return null;
    const claimed = await tx.agentTask.updateMany({
      where: {
        id: target.id, organizationId: input.organizationId, revision: target.revision,
        status: target.status, claimToken: null, cancelledAt: null,
      },
      data: {
        ...NO_SUSPENSION, status: "running", revision: { increment: 1 },
        claimToken, leaseExpiresAt, activeCheckpointAt: now, lastProgressAt: now,
      },
    });
    if (claimed.count !== 1) return null;
    await supersedeActiveProposal(tx, {
      organizationId: input.organizationId,
      activeProposalId: target.activeProposalId,
    }, now);
    const task = await tx.agentTask.findFirstOrThrow({
      where: { id: target.id, organizationId: input.organizationId, claimToken },
    });
    return {
      organizationId: input.organizationId, taskId: task.id,
      expectedRevision: task.revision, claimToken, requestId: request.id,
      runtimeVersion: task.runtimeVersion,
    };
  });
}
