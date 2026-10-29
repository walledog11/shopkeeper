// Authorized stops: a member's cancel and a closed conversation.

import { db, Prisma } from "@shopkeeper/db";
import { ConflictError, ForbiddenError } from "../errors.js";
import { requireMemberActorKey } from "./member-requests.js";
import { NO_SUSPENSION, supersedeActiveProposal, taskDispatches } from "./shared.js";

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
    const actorKey = await requireMemberActorKey(tx, input);
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
    return recordTaskStop(tx, task, now);
  });
}

type TaskStopTx = Pick<typeof db, "agentTask" | "agentProposal" | "agentAction">;

/**
 * The authorized-stop row of the task table, written once for every stop. The
 * caller holds the task row lock. No new action starts after it; a task with a
 * write whose outcome is still open goes to `reconciling` rather than
 * `cancelled`.
 */
async function recordTaskStop(
  tx: TaskStopTx,
  task: {
    id: string; organizationId: string; status: string;
    activeProposalId: string | null; cancelledAt: Date | null;
  },
  now: Date,
) {
  const { dispatched, unsettled } = await taskDispatches(tx, {
    organizationId: task.organizationId, taskId: task.id,
  });
  const running = task.status === "running";
  const status = running
    ? "running" as const
    : unsettled ? "reconciling" as const : "cancelled" as const;
  // A stop that ends an approval wait ends it for the proposal too. A claimed
  // attempt keeps its wait, so it keeps whatever it is parked on.
  if (!running) {
    await supersedeActiveProposal(tx, {
      organizationId: task.organizationId,
      activeProposalId: task.activeProposalId,
    }, now);
  }
  return tx.agentTask.update({
    where: { id: task.id },
    data: {
      status,
      cancelledAt: task.cancelledAt ?? now,
      failureCode: dispatched ? "cancelled_after_dispatch" : null,
      lastProgressAt: now,
      // A stop that lands while the merchant is being asked to approve or
      // answer ends that wait. A claimed attempt keeps its own, and clears it
      // through settle or fail.
      ...(!running ? {
        ...NO_SUSPENSION,
        claimToken: null, leaseExpiresAt: null, activeCheckpointAt: null,
      } : {}),
    },
  });
}

/**
 * Closing a conversation stops every task on it that is waiting for the merchant
 * (release-owner decision C). Call it in the transaction that closes the threads,
 * so a close never leaves a wait behind with no card to act on.
 *
 * A task whose proposal is already approved is not waiting: its execution owns
 * it, and a plan that closes the ticket as its last step must not stop itself.
 *
 * It also ends a wait on the customer (`Thread.awaitingCustomer`). Every close
 * path calls this, and nothing else clears that wait, so a reopened thread never
 * reads a later message as the answer to a request made before the close.
 */
export async function stopWaitingTasksOnClosedThreads(
  tx: TaskStopTx & Pick<typeof db, "$queryRaw" | "thread">,
  input: { organizationId: string; threadIds: readonly string[]; now?: Date },
): Promise<number> {
  if (input.threadIds.length === 0) return 0;
  const now = input.now ?? new Date();
  await tx.thread.updateMany({
    where: {
      organizationId: input.organizationId,
      id: { in: [...input.threadIds] },
      awaitingCustomer: { not: null },
    },
    data: { awaitingCustomer: null, awaitingCustomerSince: null },
  });
  const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id FROM agent_tasks
    WHERE organization_id = ${input.organizationId}::uuid
      AND thread_id IN (${Prisma.join(input.threadIds.map((id) => Prisma.sql`${id}::uuid`))})
      AND status IN ('waiting_input', 'waiting_approval')
    ORDER BY id
    FOR UPDATE
  `);
  let stopped = 0;
  for (const { id } of locked) {
    const task = await tx.agentTask.findFirst({
      where: {
        id, organizationId: input.organizationId,
        status: { in: ["waiting_input", "waiting_approval"] },
        OR: [{ activeProposalId: null }, { activeProposal: { status: { not: "approved" } } }],
      },
    });
    if (!task) continue;
    await recordTaskStop(tx, task, now);
    stopped += 1;
  }
  return stopped;
}
