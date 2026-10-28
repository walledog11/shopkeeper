// An inbound customer message accepted as a request on its thread's task.

import { randomUUID } from "node:crypto";
import { db, Prisma } from "@shopkeeper/db";
import { BadRequestError, ConflictError, ForbiddenError } from "../errors.js";
import { hashInstruction } from "../agent-actions.js";
import { isOperatorChannel } from "../thread-constants.js";
import { DISPATCHED_STATES, NO_SUSPENSION, checkpointSourceRequestIds, supersedeActiveProposal, validateTaskBudget, type TaskBudget } from "./shared.js";

/**
 * A support conversation's request boundary. The member path proves its actor
 * from Clerk membership; a customer has no session to prove here, so the inbound
 * `Message` row is the verified identity — an authenticated provider webhook
 * persisted it against a thread this organization owns, and it is also what the
 * dedupe key names, so one inbound message is one request however many times the
 * planning job runs.
 *
 * An operator channel mints no customer actor. The merchant's own thread carries
 * a customer row for storage reasons and its requests belong to the member path;
 * accepting one here would attribute the merchant's instruction to the customer
 * whose thread it is.
 */
async function requireCustomerActor(
  tx: Pick<typeof db, "message">,
  input: { organizationId: string; threadId: string; sourceMessageId: string },
) {
  const message = await tx.message.findFirst({
    where: {
      id: input.sourceMessageId, organizationId: input.organizationId,
      threadId: input.threadId, senderType: "customer", deletedAt: null,
      thread: {
        organizationId: input.organizationId, deletedAt: null, archivedAt: null,
        organization: { lifecycleStatus: "active" },
      },
    },
    select: {
      contentText: true,
      thread: { select: { customerId: true, channelType: true } },
    },
  });
  if (!message) {
    throw new ForbiddenError("This conversation message cannot start agent work.");
  }
  if (isOperatorChannel(message.thread.channelType)) {
    throw new ForbiddenError("An operator conversation's requests belong to its member.");
  }
  return {
    actorKey: `customer:${message.thread.customerId}`,
    channel: message.thread.channelType,
    text: message.contentText?.trim() ?? "",
  };
}

/**
 * The support conversation's task lookup. A thread holds one open support task —
 * the shape the one cached plan it records already has — so a later message
 * advances it rather than opening a second beside it. The revision increment is
 * the supersede: whatever the previous attempt parked stops being the current
 * proposal, which is what the plan cache does by overwriting itself.
 *
 * The message lands on the newest open task. A claimed one belongs to the
 * attempt holding it, and one that reached a provider is never replayed from the
 * top, so either opens a new task; the attempt it sits beside cannot publish over
 * the newer message. Any other open task that is still only a wait is split work
 * from before one task per thread, parked on a card the cache already replaced,
 * and the message ends it. One whose approved proposal is about to run belongs to
 * that run.
 */
async function advanceOrOpenThreadTask(
  tx: Pick<typeof db, "agentTask" | "agentProposal">,
  input: {
    organizationId: string; threadId: string; actorKey: string;
    objective: string; budget: TaskBudget; requestId: string;
  },
) {
  const now = new Date();
  const [newest] = await tx.agentTask.findMany({
    where: {
      organizationId: input.organizationId, threadId: input.threadId,
      initiatingActorKind: "customer",
      status: { in: ["queued", "running", "waiting_input", "waiting_approval"] },
      cancelledAt: null,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true },
    take: 1,
  });
  const idleWait = {
    organizationId: input.organizationId, threadId: input.threadId,
    initiatingActorKind: "customer" as const,
    status: { in: ["queued" as const, "waiting_input" as const, "waiting_approval" as const] },
    cancelledAt: null, claimToken: null,
    actions: { none: { dispatchState: { in: DISPATCHED_STATES } } },
    executions: { none: { status: { in: ["claimed" as const, "committed" as const, "unknown" as const] } } },
  };
  const open = newest
    ? await tx.agentTask.findFirst({
        where: { ...idleWait, id: newest.id },
        select: { id: true, status: true, activeProposalId: true, checkpoint: true },
      })
    : null;
  let task = null;
  if (open) {
    // Conditional on the status it was read at: a concurrent claim, stop, or
    // sweep that moved the task first leaves this request to open its own.
    const advanced = await tx.agentTask.updateMany({
      where: {
        id: open.id, organizationId: input.organizationId,
        status: open.status, claimToken: null, cancelledAt: null,
      },
      data: {
        ...NO_SUSPENSION, status: "queued",
        revision: { increment: 1 }, lastProgressAt: now,
        checkpoint: {
          sourceRequestIds: [...checkpointSourceRequestIds(open.checkpoint), input.requestId],
          nextWork: "investigate",
        },
      },
    });
    if (advanced.count === 1) {
      await supersedeActiveProposal(tx, {
        organizationId: input.organizationId,
        activeProposalId: open.activeProposalId,
      }, now);
      task = await tx.agentTask.findFirstOrThrow({
        where: { id: open.id, organizationId: input.organizationId },
      });
    }
  }
  task ??= await tx.agentTask.create({
    data: {
      organizationId: input.organizationId, threadId: input.threadId,
      initiatingActorKind: "customer", initiatingActorKey: input.actorKey,
      objective: input.objective.slice(0, 4000),
      ...input.budget, checkpointVersion: 1,
      checkpoint: { sourceRequestIds: [input.requestId], nextWork: "investigate" },
    },
  });
  const stale = await tx.agentTask.findMany({
    where: {
      ...idleWait, id: { not: task.id },
      OR: [{ activeProposalId: null }, { activeProposal: { status: { not: "approved" } } }],
    },
    select: { id: true, activeProposalId: true },
  });
  for (const other of stale) {
    await supersedeActiveProposal(tx, {
      organizationId: input.organizationId, activeProposalId: other.activeProposalId,
    }, now);
    await tx.agentTask.update({
      where: { id: other.id, organizationId: input.organizationId },
      data: { ...NO_SUSPENSION, status: "cancelled", cancelledAt: now, lastProgressAt: now },
    });
  }
  return task;
}

/**
 * Whether a conversation's current request is parked on the merchant: the task
 * that took it waits on their approval or their answer, and nothing of it has
 * reached a provider.
 *
 * The request must be that task's own. A later request on another task already
 * replaced the card, so the classifier carrying it forward would only plan it a
 * second time.
 */
export async function requestAwaitsMerchant(
  input: { organizationId: string; threadId: string; sourceMessageId: string },
): Promise<boolean> {
  const waiting = await db.agentTask.findFirst({
    where: {
      organizationId: input.organizationId, threadId: input.threadId,
      initiatingActorKind: "customer", cancelledAt: null, claimToken: null,
      requests: { some: { organizationId: input.organizationId, sourceMessageId: input.sourceMessageId } },
      actions: { none: { dispatchState: { in: DISPATCHED_STATES } } },
      executions: { none: { status: { in: ["claimed", "committed", "unknown"] } } },
      OR: [
        { status: "waiting_approval", activeProposal: { is: { status: "ready" } } },
        { status: "waiting_input", pendingAnswererKind: "member" },
      ],
    },
    select: { id: true },
  });
  return waiting !== null;
}

export interface CustomerRequestInput {
  organizationId: string;
  threadId: string;
  /** The inbound customer message: this request's dedupe key and its payload. */
  sourceMessageId: string;
  /** The task's durable objective — the planner's instruction for this thread. */
  objective: string;
  budget: TaskBudget;
}

/**
 * The task an already-accepted customer message is on, re-run when planning it
 * failed before anything reached a provider. Accepting the message again is a
 * job retry or plan recovery, and leaving the task failed would leave the
 * message unplanned for good.
 *
 * Only planning work re-runs: a task holding the merchant's regenerate or a
 * withheld-message follow-up belongs to that work's own worker. A message that
 * already had a plan executed against it stays failed whatever the outcome, so
 * an unknown one stays escalated rather than replanned. Automatic executions
 * are not linked to their task, so the message is what finds them. The spent
 * budget carries over, and a task with none left stays failed.
 */
async function requeueFailedAttempt(
  tx: Pick<typeof db, "agentTask" | "planExecution">,
  input: { organizationId: string; taskId: string; threadId: string; sourceMessageId: string },
) {
  const executed = await tx.planExecution.count({
    where: {
      organizationId: input.organizationId,
      threadId: input.threadId, sourceMessageId: input.sourceMessageId,
    },
  });
  if (executed === 0) {
    await tx.agentTask.updateMany({
      where: {
        id: input.taskId, organizationId: input.organizationId,
        status: "failed", claimToken: null, cancelledAt: null,
        checkpoint: { path: ["nextWork"], equals: "investigate" },
        modelCallsUsed: { lt: db.agentTask.fields.modelCallLimit },
        activeTimeMsUsed: { lt: db.agentTask.fields.activeTimeMsLimit },
        spentNanoUsd: { lt: db.agentTask.fields.spendNanoUsdLimit },
        actions: { none: { dispatchState: { in: DISPATCHED_STATES } } },
        executions: { none: {} },
      },
      data: {
        ...NO_SUSPENSION, status: "queued", failureCode: null,
        revision: { increment: 1 }, lastProgressAt: new Date(),
      },
    });
  }
  return tx.agentTask.findFirstOrThrow({
    where: { id: input.taskId, organizationId: input.organizationId },
  });
}

/**
 * Accepts one inbound customer message as a request and puts it on the thread's
 * task, in one transaction, exactly as the member submission path does.
 *
 * The payload hashed here is the message, not the objective. The objective comes
 * from `Thread.requestSummary`, which the summary job fills in after the message
 * lands, so hashing it would make a legitimate re-plan of the same message
 * conflict with its own first attempt. What the customer said cannot change, so
 * the request is immutable by construction and re-accepting it is idempotent.
 */
export async function acceptCustomerAgentRequest(input: CustomerRequestInput) {
  validateTaskBudget(input.budget);
  const objective = input.objective.trim();
  if (!objective) throw new BadRequestError("A task needs an objective.");
  return db.$transaction(async (tx) => {
    const actor = await requireCustomerActor(tx, input);
    // Two messages on one thread pick its open task one at a time, so they
    // cannot each open one. Composer acceptance and settlement take the thread
    // before its tasks too.
    await tx.$queryRaw(Prisma.sql`
      SELECT id FROM threads WHERE id = ${input.threadId}::uuid
      AND organization_id = ${input.organizationId}::uuid FOR UPDATE
    `);
    const payload = {
      version: 1, threadId: input.threadId,
      sourceMessageId: input.sourceMessageId,
      text: actor.text.slice(0, 16000),
    };
    const payloadHash = hashInstruction(JSON.stringify(payload));
    const id = randomUUID();
    await tx.agentRequest.createMany({
      data: {
        id, organizationId: input.organizationId,
        actorKind: "customer", actorKey: actor.actorKey,
        channel: actor.channel, threadId: input.threadId,
        dedupeKey: input.sourceMessageId, sourceMessageId: input.sourceMessageId,
        payloadVersion: 1, payloadHash, payload,
        normalizedInstruction: payload.text,
      },
      skipDuplicates: true,
    });
    let request = await tx.agentRequest.findUniqueOrThrow({
      where: { organizationId_actorKind_actorKey_channel_dedupeKey: {
        organizationId: input.organizationId, actorKind: "customer",
        actorKey: actor.actorKey, channel: actor.channel,
        dedupeKey: input.sourceMessageId,
      } },
    });
    if (request.payloadVersion !== 1 || request.payloadHash !== payloadHash) {
      throw new ConflictError("This message was already accepted with different content.");
    }
    // Serialize attachment on the accepted request's own row, so concurrent
    // planning jobs for one message put it on one task.
    await tx.$queryRaw(Prisma.sql`
      SELECT id FROM agent_requests WHERE id = ${request.id}::uuid
      AND organization_id = ${input.organizationId}::uuid FOR UPDATE
    `);
    request = await tx.agentRequest.findUniqueOrThrow({ where: { id: request.id } });
    if (request.taskId) {
      return {
        request,
        task: await requeueFailedAttempt(tx, {
          organizationId: input.organizationId, taskId: request.taskId,
          threadId: input.threadId, sourceMessageId: input.sourceMessageId,
        }),
        deduplicated: true,
      };
    }
    const task = await advanceOrOpenThreadTask(tx, {
      organizationId: input.organizationId, threadId: input.threadId,
      actorKey: actor.actorKey, objective, budget: input.budget, requestId: request.id,
    });
    request = await tx.agentRequest.update({
      where: { id: request.id, organizationId: input.organizationId },
      data: { state: "attached", taskId: task.id, attachedAt: new Date() },
    });
    return { request, task, deduplicated: request.id !== id };
  });
}
