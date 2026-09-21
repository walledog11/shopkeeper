/**
 * The one place a persisted proposal becomes authorized to run.
 *
 * Dashboard buttons, the phone keyword fast path, and the `approve_pending_plan`
 * control tool all reach `executeCurrentCachedHomePlan`, and it calls this —
 * one caller, so no surface can approve on terms of its own.
 * Approver identity and decision time come from the caller's authenticated
 * member, never from model arguments, and the bundle about to execute is hashed
 * and compared with the snapshot the merchant was shown — so an approval of one
 * proposal cannot run a revised one.
 *
 * Who may approve is read from the proposal's recorded scope. It used to be
 * derived here as "the member who initiated the task, on their own operator
 * thread", which is right for a member's own work and refuses every support
 * proposal, because a customer initiates those and any bound member approves.
 */

import { db, Prisma } from "@shopkeeper/db";
import { ConflictError, ForbiddenError } from "./errors.js";
import { hashInstruction, hashPlan } from "./agent-actions.js";
import {
  ANY_MEMBER_ACTOR_KEY, actorMayEndWait, NO_SUSPENSION, requireMemberActorKey,
} from "./task-ledger.js";
import type { RawToolCall } from "./types.js";

export interface AuthorizedProposal {
  organizationId: string;
  taskId: string;
  proposalId: string;
  taskRevision: number;
  runtimeVersion: number;
  threadId: string;
  instruction: string;
  canonicalActions: RawToolCall[];
  proposalHash: string;
  approverKey: string;
}

export interface DurableProposalExecutionSource {
  proposalId: string;
  taskId: string;
  taskRevision: number;
  runtimeVersion: number;
  threadId: string;
  instruction: string;
  canonicalActions: RawToolCall[];
  proposalHash: string;
  sourceMessageId: string;
}

function canonicalActions(value: unknown): RawToolCall[] {
  if (!Array.isArray(value) || !value.every((entry) => (
    entry !== null
    && typeof entry === "object"
    && !Array.isArray(entry)
    && typeof (entry as { id?: unknown }).id === "string"
    && typeof (entry as { name?: unknown }).name === "string"
    && Object.hasOwn(entry, "input")
  ))) {
    throw new ConflictError("The durable proposal snapshot is invalid. Regenerate it before approving.");
  }
  return value as unknown as RawToolCall[];
}

// Proposal IDs are UUIDs because the column is. A plan parked before durable
// proposals existed can carry any string, and asking Postgres to compare one
// against a uuid column is an error rather than a miss — so a plan ID that
// cannot be a proposal ID names no proposal.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sourceRequestIds(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((id) => typeof id === "string" && UUID.test(id))) {
    throw new ConflictError("The durable proposal source is invalid. Regenerate it before approving.");
  }
  return value;
}

/** Read the immutable v2 envelope before the locking authorization transaction. */
export async function readDurableProposalExecutionSource(input: {
  organizationId: string;
  threadId: string;
  proposalId?: string | null;
}): Promise<DurableProposalExecutionSource | null> {
  if (!input.proposalId || !UUID.test(input.proposalId)) return null;
  const proposal = await db.agentProposal.findFirst({
    where: {
      id: input.proposalId,
      organizationId: input.organizationId,
      task: { threadId: input.threadId, runtimeVersion: { gte: 2 } },
    },
    include: {
      task: {
        include: {
          requests: {
            select: { id: true, sourceMessageId: true, acceptedAt: true },
            orderBy: { acceptedAt: "desc" },
          },
        },
      },
    },
  });
  if (!proposal) return null;
  const allowedRequestIds = new Set(sourceRequestIds(proposal.sourceRequestIds));
  const source = proposal.task.requests.find((request) => (
    allowedRequestIds.has(request.id) && request.sourceMessageId
  ));
  if (!source?.sourceMessageId) {
    throw new ConflictError("The durable proposal has no customer message source. Regenerate it before approving.");
  }
  return {
    proposalId: proposal.id,
    taskId: proposal.taskId,
    taskRevision: proposal.task.revision,
    runtimeVersion: proposal.task.runtimeVersion,
    threadId: proposal.task.threadId,
    instruction: proposal.instruction,
    canonicalActions: canonicalActions(proposal.canonicalActions),
    proposalHash: proposal.proposalHash,
    sourceMessageId: source.sourceMessageId,
  };
}

export interface ProposalApprovalInput {
  organizationId: string;
  clerkUserId: string;
  /** Execution hosts bind the proposal to the conversation they are about to use. */
  threadId?: string;
  /** The parked plan's ID, which is the durable proposal's ID where one exists. */
  proposalId?: string | undefined;
  instruction: string;
  approvedToolCalls: RawToolCall[];
  /** Durable execution cannot be authorized without an enforce-mode ledger. */
  executionLedgerEnforced?: boolean;
}

/**
 * Returns null when the approval names no durable proposal — every plan parked
 * before this boundary existed, and any card whose task was never created. Those
 * approvals proceed exactly as they did before. A named proposal is verified or
 * refused; it is never silently skipped.
 */
export async function authorizeAgentProposal(
  input: ProposalApprovalInput,
): Promise<AuthorizedProposal | null> {
  if (!input.proposalId || !UUID.test(input.proposalId)) return null;
  const approvedHash = hashPlan({
    instruction: input.instruction, steps: [], rawToolCalls: input.approvedToolCalls,
  });
  return db.$transaction(async (tx) => {
    const named = await tx.agentProposal.findFirst({
      where: { id: input.proposalId, organizationId: input.organizationId },
      select: { taskId: true },
    });
    if (!named) return null;
    // The task row is the ordering point action dispatch and stops already
    // serialize on, so two devices approving at once cannot both win.
    await tx.$queryRaw(Prisma.sql`
      SELECT id FROM agent_tasks WHERE id = ${named.taskId}::uuid
      AND organization_id = ${input.organizationId}::uuid FOR UPDATE
    `);
    // Re-read inside the lock. The first read only resolves which task to
    // serialize on; deciding from it would decide from a row fetched before the
    // ordering point, which under READ COMMITTED still says `ready` after the
    // other device committed its approval. Two *different* members approving one
    // support card is what makes that visible — the same member racing itself
    // writes the same approver either way.
    const proposal = await tx.agentProposal.findFirst({
      where: { id: input.proposalId, organizationId: input.organizationId },
    });
    if (!proposal) return null;
    // Check before writing the approval. Otherwise a temporary ledger-mode
    // misconfiguration parks the task behind an approved proposal that no
    // execution owns and no later approval can safely retry.
    if (input.executionLedgerEnforced === false) {
      throw new ConflictError("Durable proposals require the execution ledger.");
    }
    const actorKey = await requireMemberActorKey(tx, {
      organizationId: input.organizationId,
      clerkUserId: input.clerkUserId,
    });
    // Who may approve is read from the proposal, never re-derived from who
    // initiated the task. A support task is initiated by the customer and
    // approved by any bound member; deriving refused every one of them.
    const scope = { kind: proposal.approverScopeKind, key: proposal.approverScopeKey };
    // A member-scoped proposal additionally requires the thread still be that
    // member's own operator thread, which is the condition it was created under.
    // A shared support thread has no operator key and is scoped by tenant, which
    // `requireMemberActorKey` has already established for this actor.
    const task = await tx.agentTask.findFirst({
      where: {
        id: proposal.taskId, organizationId: input.organizationId,
        ...(input.threadId ? { threadId: input.threadId } : {}),
        thread: {
          deletedAt: null, archivedAt: null,
          ...(scope.key === ANY_MEMBER_ACTOR_KEY ? {} : { operatorKey: actorKey }),
        },
      },
    });
    if (!task || !actorMayEndWait(scope, { kind: "member", key: actorKey })) {
      throw new ForbiddenError("This proposal is not available to the member.");
    }
    // Checked before anything else about the task: what is about to run has to
    // be what was shown, whatever state the task reached since.
    if (proposal.proposalHash !== approvedHash) {
      throw new ConflictError("This is not the proposal that was approved. Review the current one.");
    }
    const authorized = {
      organizationId: input.organizationId, taskId: task.id,
      proposalId: proposal.id, taskRevision: task.revision,
      runtimeVersion: task.runtimeVersion, threadId: task.threadId,
      instruction: proposal.instruction,
      canonicalActions: canonicalActions(proposal.canonicalActions),
      proposalHash: proposal.proposalHash,
    };
    // The same decision arriving twice — a retry, or the other device — reports
    // the outcome that already stands rather than a conflict.
    if (proposal.status === "approved" && proposal.approverKey) {
      return { ...authorized, approverKey: proposal.approverKey };
    }
    if (
      proposal.status !== "ready"
      || task.status !== "waiting_approval"
      || task.activeProposalId !== proposal.id
      || task.cancelledAt !== null
    ) {
      throw new ConflictError("This proposal is no longer the one waiting for approval.");
    }
    const now = new Date();
    await tx.agentProposal.update({
      where: { id: proposal.id },
      data: {
        status: "approved", approverKey: actorKey, approvedAt: now,
        approvedHash: proposal.proposalHash, decidedAt: now,
      },
    });
    await tx.agentTask.update({
      where: { id: task.id, organizationId: input.organizationId },
      data: { lastProgressAt: now },
    });
    return { ...authorized, approverKey: actorKey };
  });
}

/**
 * Everything `rejectAgentProposal` reads and writes, which is the caller's own
 * transaction: dismissing a card is one decision with two records — the thread's
 * cached plan and the durable proposal — and they cannot be allowed to disagree
 * about whether it happened.
 */
export type ProposalDecisionTx = Pick<
  typeof db,
  "$queryRaw" | "orgMember" | "thread" | "agentRequest" | "agentTask" | "agentProposal"
>;

/**
 * The refusal half of `authorizeAgentProposal`. Declining a card ends the same
 * wait approving it ends, so it asks the same question about who may end it and
 * reads the answer from the same recorded scope.
 *
 * It runs inside the caller's transaction so that a member the proposal refuses
 * cannot have destroyed the draft on the way to being refused, and so a
 * dismissal recorded here is never left without the cached plan being cleared.
 *
 * Returns whether the wait was ended here. A proposal that had already stopped
 * being the current one returns false and leaves the caller to clear the stale
 * card it was shown. An approved one throws: the decision was already made, and
 * dismissing the card it ran from cannot take it back.
 */
export async function rejectAgentProposal(
  tx: ProposalDecisionTx,
  input: {
    organizationId: string;
    clerkUserId: string;
    /** The parked plan's ID, which is the durable proposal's ID where one exists. */
    proposalId: string;
    now?: Date;
  },
): Promise<boolean> {
  if (!UUID.test(input.proposalId)) return false;
  const named = await tx.agentProposal.findFirst({
    where: { id: input.proposalId, organizationId: input.organizationId },
    select: { taskId: true },
  });
  if (!named) return false;
  // Same ordering point as approval, for the same reason: two devices deciding
  // one card at once cannot both win.
  await tx.$queryRaw(Prisma.sql`
    SELECT id FROM agent_tasks WHERE id = ${named.taskId}::uuid
    AND organization_id = ${input.organizationId}::uuid FOR UPDATE
  `);
  const proposal = await tx.agentProposal.findFirst({
    where: { id: input.proposalId, organizationId: input.organizationId },
  });
  if (!proposal) return false;
  // Tenant membership only, named field by field: which thread the actor must
  // still own is this boundary's decision, read from the proposal's scope below,
  // never something a caller can smuggle in through `requireMemberActorKey`.
  const actorKey = await requireMemberActorKey(tx, {
    organizationId: input.organizationId, clerkUserId: input.clerkUserId,
  });
  const scope = { kind: proposal.approverScopeKind, key: proposal.approverScopeKey };
  const task = await tx.agentTask.findFirst({
    where: {
      id: proposal.taskId, organizationId: input.organizationId,
      thread: {
        deletedAt: null, archivedAt: null,
        ...(scope.key === ANY_MEMBER_ACTOR_KEY ? {} : { operatorKey: actorKey }),
      },
    },
  });
  if (!task || !actorMayEndWait(scope, { kind: "member", key: actorKey })) {
    throw new ForbiddenError("This proposal is not available to the member.");
  }
  const decisionPayload = {
    version: 1,
    decision: "reject",
    proposalId: proposal.id,
    taskId: task.id,
  };
  await tx.agentRequest.createMany({
    data: {
      organizationId: input.organizationId,
      actorKind: "member",
      actorKey,
      channel: "operator",
      threadId: task.threadId,
      dedupeKey: `proposal-reject:${proposal.id}`,
      payloadVersion: 1,
      payloadHash: hashInstruction(JSON.stringify(decisionPayload)),
      payload: decisionPayload,
      normalizedInstruction: "Reject the proposed work",
      state: "attached",
      taskId: task.id,
      attachedAt: input.now ?? new Date(),
    },
    skipDuplicates: true,
  });
  // The same dismissal arriving twice reports the outcome that already stands.
  if (proposal.status === "rejected") return true;
  if (proposal.status === "approved") {
    // The execution row this dismissal already checked is still `pending`
    // between authorization and the run claiming it, so this is the only thing
    // standing between a second device's "no" and a plan that is about to run.
    throw new ConflictError("This plan has already been approved or is currently running.");
  }
  if (
    proposal.status !== "ready"
    || task.status !== "waiting_approval"
    || task.activeProposalId !== proposal.id
    || task.cancelledAt !== null
  ) {
    return false;
  }
  const now = input.now ?? new Date();
  await tx.agentProposal.update({
    where: { id: proposal.id },
    data: { status: "rejected", decidedAt: now },
  });
  // Declining the proposed work ends the task, not just the wait: there is
  // nothing further for the agent to do on this request, and `cancelledAt` is
  // what every later claim and dispatch reads to stay stopped.
  await tx.agentTask.update({
    where: { id: task.id, organizationId: input.organizationId },
    data: {
      ...NO_SUSPENSION, status: "cancelled", cancelledAt: now, lastProgressAt: now,
      claimToken: null, leaseExpiresAt: null, activeCheckpointAt: null,
    },
  });
  return true;
}
