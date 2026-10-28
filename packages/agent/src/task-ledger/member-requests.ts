// A member's request — dashboard chat, the ticket composer, a phone
// instruction — accepted as durable work, and read back for its status.

import { randomUUID } from "node:crypto";
import { db, Prisma } from "@shopkeeper/db";
import { BadRequestError, ConflictError, ForbiddenError } from "../errors.js";
import { hashInstruction } from "../agent-actions.js";
import { DISPATCHED_STATES, NO_SUSPENSION, checkpointSourceRequestIds, supersedeActiveProposal, validateTaskBudget, type TaskBudget } from "./shared.js";
import { ANY_MEMBER_ACTOR_KEY } from "./wait-scope.js";

// Customer/system adapters require their own verified identity boundary.
export interface MemberRequestInput {
  organizationId: string;
  clerkUserId: string;
  threadId: string;
  dedupeKey: string;
  instruction: string;
  budget?: TaskBudget;
  sourceOperatorEventId?: string;
}

export async function requireMemberActorKey(tx: Pick<typeof db, "orgMember" | "thread">, input: {
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

/**
 * A parked question names the one actor scoped to answer it, so that actor's
 * next request continues the waiting task instead of starting a new one.
 *
 * Exactly one match is a continuation. Two parked questions make a terse "yes"
 * ambiguous, and picking one would act on a proposal the merchant may not have
 * meant, so neither is resumed and the request becomes its own task. A task that
 * already dispatched a write is skipped for the same reason `claimAgentTask`
 * refuses it: it cannot be replayed from the top, so attaching an answer would
 * only queue work no worker may claim.
 */
async function resumeAnsweredTask(
  tx: Pick<typeof db, "agentTask">,
  input: { organizationId: string; threadId: string; actorKey: string },
) {
  const waiting = await tx.agentTask.findMany({
    where: {
      organizationId: input.organizationId, threadId: input.threadId,
      status: "waiting_input", cancelledAt: null,
      pendingAnswererKind: "member", pendingAnswererKey: input.actorKey,
      actions: { none: { dispatchState: { in: DISPATCHED_STATES } } },
    },
    select: { id: true },
    take: 2,
  });
  if (waiting.length !== 1) return null;
  // The conditional update is the ordering: a concurrent answer, stop, or sweep
  // that moved the task first leaves this one to open its own task.
  const resumed = await tx.agentTask.updateMany({
    where: { id: waiting[0].id, organizationId: input.organizationId, status: "waiting_input" },
    data: { ...NO_SUSPENSION, status: "queued", revision: { increment: 1 }, lastProgressAt: new Date() },
  });
  if (resumed.count !== 1) return null;
  return tx.agentTask.findFirstOrThrow({
    where: { id: waiting[0].id, organizationId: input.organizationId },
  });
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
  const payload = {
    version: 1, threadId: input.threadId, instruction,
    ...(input.sourceOperatorEventId ? { sourceOperatorEventId: input.sourceOperatorEventId } : {}),
  };
  const payloadHash = hashInstruction(JSON.stringify(payload));
  if (Buffer.byteLength(JSON.stringify(payload)) > 60000) {
    throw new BadRequestError("Request payload is too large.");
  }
  return db.$transaction(async (tx) => {
    const actorKey = await requireMemberActorKey(tx, input);
    if (input.sourceOperatorEventId) {
      const event = await tx.operatorEvent.findFirst({
        where: {
          id: input.sourceOperatorEventId, organizationId: input.organizationId,
          clerkUserId: input.clerkUserId, status: "claimed",
        },
      });
      if (!event || event.body.trim() !== instruction) {
        throw new ForbiddenError("A claimed operator event belonging to the member is required.");
      }
    }
    const id = randomUUID();
    await tx.agentRequest.createMany({
      data: {
        id, organizationId: input.organizationId, actorKey, actorKind: "member",
        channel: "operator", threadId: input.threadId,
        dedupeKey: input.dedupeKey, payloadVersion: 1, payloadHash, payload,
        normalizedInstruction: instruction,
        ...(input.sourceOperatorEventId ? { sourceOperatorEventId: input.sourceOperatorEventId } : {}),
      },
      skipDuplicates: true,
    });
    let request = await tx.agentRequest.findUniqueOrThrow({
      where: { organizationId_actorKind_actorKey_channel_dedupeKey: {
        organizationId: input.organizationId, actorKind: "member", actorKey,
        channel: "operator", dedupeKey: input.dedupeKey,
      } },
    });
    if (request.payloadVersion !== 1 || request.payloadHash !== payloadHash) {
      throw new ConflictError("This request key was already used with a different instruction.");
    }
    if (input.sourceOperatorEventId) {
      const linked = await tx.operatorEvent.updateMany({
        where: {
          id: input.sourceOperatorEventId, organizationId: input.organizationId,
          clerkUserId: input.clerkUserId, status: "claimed",
          OR: [{ agentRequestId: null }, { agentRequestId: request.id }],
        },
        data: { agentRequestId: request.id },
      });
      if (linked.count !== 1) throw new ConflictError("The operator event already belongs to another request.");
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
        task = await resumeAnsweredTask(tx, {
          organizationId: input.organizationId, threadId: request.threadId, actorKey,
        }) ?? await tx.agentTask.create({
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

/** A composer command replaces unexecuted work on its ticket, under the same
 * task lock as approval. The task's runtime and accumulated budget survive a
 * regeneration. Approved, claimed, or uncertain work must finish first. */
export async function acceptTicketAgentRequest(input: MemberRequestInput & {
  force: boolean;
}) {
  if (!input.budget) throw new BadRequestError("A task budget is required.");
  validateTaskBudget(input.budget);
  const instruction = input.instruction.trim();
  if (!instruction || instruction.length > 16000 || !input.dedupeKey.trim() || input.dedupeKey.length > 255) {
    throw new BadRequestError("A bounded instruction and stable request key are required.");
  }
  const payload = { version: 1, kind: "ticket_plan", threadId: input.threadId, instruction, force: input.force };
  const payloadHash = hashInstruction(JSON.stringify(payload));
  return db.$transaction(async (tx) => {
    const actorKey = await requireMemberActorKey(tx, {
      organizationId: input.organizationId, clerkUserId: input.clerkUserId,
    });
    await tx.$queryRaw(Prisma.sql`
      SELECT id FROM threads WHERE id = ${input.threadId}::uuid
      AND organization_id = ${input.organizationId}::uuid FOR UPDATE
    `);
    const thread = await tx.thread.findFirst({
      where: {
        id: input.threadId, organizationId: input.organizationId,
        channelType: { not: "operator" }, deletedAt: null, archivedAt: null,
        organization: { lifecycleStatus: "active" },
      },
      select: { channelType: true, cachedPlan: true },
    });
    if (!thread) throw new ForbiddenError("This ticket is not available to the member.");
    const existing = await tx.agentRequest.findUnique({
      where: { organizationId_actorKind_actorKey_channel_dedupeKey: {
        organizationId: input.organizationId, actorKind: "member", actorKey,
        channel: thread.channelType, dedupeKey: input.dedupeKey,
      } },
    });
    if (existing) {
      if (existing.payloadHash !== payloadHash) throw new ConflictError("This request key was already used with a different instruction.");
      const task = await tx.agentTask.findFirstOrThrow({ where: { id: existing.taskId!, organizationId: input.organizationId } });
      return { request: existing, task, deduplicated: true };
    }
    // The draft follows the conversation as it stands now, whoever spoke last
    // (or nobody yet, on a ticket opened to write to someone); the execution
    // claim refuses it once anything newer is written.
    const source = await tx.message.findFirst({
      where: { organizationId: input.organizationId, threadId: input.threadId, deletedAt: null, senderType: { not: "note" } },
      orderBy: [{ sentAt: "desc" }, { id: "desc" }],
      select: { id: true },
    });
    const candidates = await tx.agentTask.findMany({
      where: {
        organizationId: input.organizationId, threadId: input.threadId,
        status: { in: ["queued", "running", "waiting_input", "waiting_approval", "reconciling"] },
        cancelledAt: null,
      },
      select: { id: true, activeProposalId: true },
    });
    const cachedId = thread.cachedPlan && typeof thread.cachedPlan === "object" && !Array.isArray(thread.cachedPlan)
      ? (thread.cachedPlan as { planId?: unknown }).planId : null;
    const matching = candidates.filter(task => task.activeProposalId === cachedId && cachedId);
    const candidate = matching.length === 1 ? matching[0] : candidates.length === 1 ? candidates[0] : null;
    if (candidates.length && !candidate) throw new ConflictError("Several tasks are open on this ticket. Resolve the pending work before regenerating.");
    let task;
    const requestId = randomUUID();
    if (candidate) {
      await tx.$queryRaw(Prisma.sql`
        SELECT id FROM agent_tasks WHERE id = ${candidate.id}::uuid
        AND organization_id = ${input.organizationId}::uuid FOR UPDATE
      `);
      const resumable = await tx.agentTask.findFirst({
        where: {
          id: candidate.id, organizationId: input.organizationId,
          status: { in: ["queued", "waiting_input", "waiting_approval"] },
          claimToken: null, cancelledAt: null,
          actions: { none: { dispatchState: { in: DISPATCHED_STATES } } },
          executions: { none: { status: { in: ["claimed", "committed", "unknown"] } } },
          OR: [{ activeProposalId: null }, { activeProposal: { is: { status: "ready", approverScopeKind: "member", approverScopeKey: { in: [actorKey, ANY_MEMBER_ACTOR_KEY] } } } }],
        },
      });
      if (!resumable) throw new ConflictError("Work on this ticket is already underway. Review its outcome before regenerating.");
      await supersedeActiveProposal(tx, { organizationId: input.organizationId, activeProposalId: resumable.activeProposalId }, new Date());
      task = await tx.agentTask.update({
        where: { id: resumable.id, organizationId: input.organizationId },
        data: {
          ...NO_SUSPENSION, status: "queued", revision: { increment: 1 },
          objective: instruction.slice(0, 4000), lastProgressAt: new Date(),
          checkpoint: { sourceRequestIds: [...checkpointSourceRequestIds(resumable.checkpoint), requestId], nextWork: "ticket_plan", planRequestId: requestId },
        },
      });
    } else {
      task = await tx.agentTask.create({ data: {
        organizationId: input.organizationId, threadId: input.threadId,
        initiatingActorKind: "member", initiatingActorKey: actorKey,
        objective: instruction.slice(0, 4000), ...input.budget!, checkpointVersion: 1,
        checkpoint: { sourceRequestIds: [requestId], nextWork: "ticket_plan", planRequestId: requestId },
      } });
    }
    const request = await tx.agentRequest.create({ data: {
      id: requestId, organizationId: input.organizationId, actorKey, actorKind: "member",
      channel: thread.channelType, threadId: input.threadId, sourceMessageId: source?.id ?? null,
      dedupeKey: input.dedupeKey, payloadVersion: 1, payloadHash, payload,
      normalizedInstruction: instruction, state: "attached", taskId: task.id, attachedAt: new Date(),
    } });
    await tx.thread.update({
      where: { id: input.threadId, organizationId: input.organizationId },
      data: { cachedPlan: Prisma.DbNull, cachedPlanMessageId: null },
    });
    return { request, task, deduplicated: false };
  });
}

export async function getMemberAgentRequest(input: {
  organizationId: string; clerkUserId: string; requestId: string;
}) {
  return db.$transaction(async (tx) => {
    const actorKey = await requireMemberActorKey(tx, {
      organizationId: input.organizationId, clerkUserId: input.clerkUserId,
    });
    return tx.agentRequest.findFirst({
      where: {
        id: input.requestId, organizationId: input.organizationId,
        actorKind: "member", actorKey,
        thread: { deletedAt: null, archivedAt: null },
        OR: [
          { channel: "operator", thread: { operatorKey: actorKey } },
          { channel: { not: "operator" }, thread: { channelType: { not: "operator" } } },
        ],
      },
      include: {
        thread: { select: { cachedPlan: true } },
        task: {
          include: {
            activeProposal: true,
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
  organizationId: string; clerkUserId: string; limit?: number; threadId?: string;
}) {
  const limit = input.limit ?? 20;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    throw new BadRequestError("Request history limit must be 1–50.");
  }
  return db.$transaction(async (tx) => {
    const actorKey = await requireMemberActorKey(tx, {
      organizationId: input.organizationId, clerkUserId: input.clerkUserId,
    });
    if (input.threadId) {
      // Ticket history belongs to a shared customer thread. Only private
      // operator history requires the thread's operatorKey to match the member.
      const thread = await tx.thread.findFirst({
        where: {
          id: input.threadId, organizationId: input.organizationId,
          channelType: { not: "operator" }, deletedAt: null, archivedAt: null,
          organization: { lifecycleStatus: "active" },
        },
        select: { id: true },
      });
      if (!thread) throw new ForbiddenError("This ticket is not available to the member.");
    }
    return tx.agentRequest.findMany({
      where: {
        organizationId: input.organizationId, actorKind: "member", actorKey,
        ...(input.threadId
          ? { threadId: input.threadId, channel: { not: "operator" as const }, thread: { channelType: { not: "operator" as const }, deletedAt: null, archivedAt: null } }
          : { channel: "operator" as const, thread: { operatorKey: actorKey, deletedAt: null, archivedAt: null } }),
      },
      orderBy: [{ acceptedAt: "desc" }, { id: "desc" }],
      take: limit,
      include: {
        thread: { select: { cachedPlan: true } },
        task: {
          include: {
            activeProposal: true,
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
    const actorKey = await requireMemberActorKey(tx, input);
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
    await requireMemberActorKey(tx, { ...input, threadId: request.threadId });
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
