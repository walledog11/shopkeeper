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
import { hashPlan } from "./agent-actions.js";
import {
  ANY_MEMBER_ACTOR_KEY, actorMayEndWait, NO_SUSPENSION, requireMemberActorKey,
} from "./task-ledger.js";
import type { RawToolCall } from "./types.js";

export interface AuthorizedProposal {
  organizationId: string;
  taskId: string;
  proposalId: string;
  taskRevision: number;
  approverKey: string;
}

// Proposal IDs are UUIDs because the column is. A plan parked before durable
// proposals existed can carry any string, and asking Postgres to compare one
// against a uuid column is an error rather than a miss — so a plan ID that
// cannot be a proposal ID names no proposal.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ProposalApprovalInput {
  organizationId: string;
  clerkUserId: string;
  /** The parked plan's ID, which is the durable proposal's ID where one exists. */
  proposalId?: string | undefined;
  instruction: string;
  approvedToolCalls: RawToolCall[];
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
    const actorKey = await requireMemberActorKey(tx, input);
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
 * Closes the task an approved proposal was the last thing waiting on, and names
 * the task and proposal on the actions the approved run wrote. Execution happens
 * in the caller's existing path, so the outcome is only known here; a failed or
 * uncertain run leaves the task waiting rather than reporting success.
 *
 * The run's actions are found by its own turn ID, not by the request ID the
 * planning attempt used. They are a different turn — `AgentTurnUsage.turnId` is
 * unique, and a retried approval sharing the planning turn's ID would collide
 * with it and interleave two action sequences, which is the same reason the
 * failure replan keeps its own.
 */
export async function completeApprovedAgentTask(
  approved: AuthorizedProposal,
  executedTurnId?: string,
): Promise<boolean> {
  const now = new Date();
  return db.$transaction(async (tx) => {
    const closed = await tx.agentTask.updateMany({
      where: {
        id: approved.taskId, organizationId: approved.organizationId,
        revision: approved.taskRevision, status: "waiting_approval",
        activeProposalId: approved.proposalId, cancelledAt: null,
      },
      data: { ...NO_SUSPENSION, status: "completed", completedAt: now, lastProgressAt: now },
    });
    if (closed.count !== 1) return false;
    if (executedTurnId) {
      await tx.agentAction.updateMany({
        where: {
          organizationId: approved.organizationId, turnId: executedTurnId,
          OR: [{ taskId: null }, { taskId: approved.taskId }],
        },
        data: { taskId: approved.taskId, proposalId: approved.proposalId },
      });
    }
    return true;
  });
}
