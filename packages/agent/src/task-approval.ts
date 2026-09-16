/**
 * The one place a persisted proposal becomes authorized to run.
 *
 * Dashboard buttons, the phone keyword fast path, and the `approve_pending_plan`
 * control tool all approve through `runApprovedPendingPlan`, and it calls this.
 * Approver identity and decision time come from the caller's authenticated
 * member, never from model arguments, and the bundle about to execute is hashed
 * and compared with the snapshot the merchant was shown — so an approval of one
 * proposal cannot run a revised one.
 */

import { db, Prisma } from "@shopkeeper/db";
import { ConflictError, ForbiddenError } from "./errors.js";
import { hashPlan } from "./agent-actions.js";
import { NO_SUSPENSION, requireMemberActorKey } from "./task-ledger.js";
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
    const proposal = await tx.agentProposal.findFirst({
      where: { id: input.proposalId, organizationId: input.organizationId },
    });
    if (!proposal) return null;
    // The task row is the ordering point action dispatch and stops already
    // serialize on, so two devices approving at once cannot both win.
    await tx.$queryRaw(Prisma.sql`
      SELECT id FROM agent_tasks WHERE id = ${proposal.taskId}::uuid
      AND organization_id = ${input.organizationId}::uuid FOR UPDATE
    `);
    const actorKey = await requireMemberActorKey(tx, input);
    const task = await tx.agentTask.findFirst({
      where: {
        id: proposal.taskId, organizationId: input.organizationId,
        initiatingActorKind: "member", initiatingActorKey: actorKey,
        thread: { operatorKey: actorKey, deletedAt: null, archivedAt: null },
      },
    });
    if (!task) throw new ForbiddenError("This proposal is not available to the member.");
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
 * Closes the task an approved proposal was the last thing waiting on. Execution
 * happens in the caller's existing path, so the outcome is only known here; a
 * failed or uncertain run leaves the task waiting rather than reporting success.
 */
export async function completeApprovedAgentTask(
  approved: AuthorizedProposal,
): Promise<boolean> {
  const now = new Date();
  const closed = await db.agentTask.updateMany({
    where: {
      id: approved.taskId, organizationId: approved.organizationId,
      revision: approved.taskRevision, status: "waiting_approval",
      activeProposalId: approved.proposalId, cancelledAt: null,
    },
    data: { ...NO_SUSPENSION, status: "completed", completedAt: now, lastProgressAt: now },
  });
  return closed.count === 1;
}
