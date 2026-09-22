import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@shopkeeper/db";
import {
  createTestOrg, createTestCustomer, createTestThread, createTestMessage, cleanupTestData,
} from "@shopkeeper/db/test-helpers";
import { ConflictError, ForbiddenError } from "./errors.js";
import { authorizeAgentProposal } from "./task-approval.js";
import {
  ANY_MEMBER_ACTOR_KEY,
  acceptCustomerAgentRequest,
  acceptMemberAgentRequest, attachMemberAgentTask, getMemberAgentRequest,
  cancelMemberAgentTask, claimAgentTask, claimContinuedAgentTask,
  failAgentTaskClaim, findQueuedAgentTasks,
  recordAgentTaskModelUsage, reconcileExpiredAgentTaskClaims, renewAgentTaskLease,
  reserveAgentTaskModelCall, settleAgentTaskClaim,
} from "./task-ledger.js";

const orgIds: string[] = [];
const budget = { runtimeVersion: 1, modelCallLimit: 20, activeTimeMsLimit: 120000, spendNanoUsdLimit: 1000000000n };
async function seed() {
  const org = await createTestOrg();
  orgIds.push(org.id);
  const member = await db.orgMember.create({ data: { organizationId: org.id, clerkUserId: randomUUID() } });
  const customer = await createTestCustomer(org.id, randomUUID());
  const thread = await createTestThread(org.id, customer.id, "operator");
  await db.thread.update({ where: { id: thread.id }, data: { operatorKey: `member:${member.id}` } });
  return {
    organizationId: org.id, clerkUserId: member.clerkUserId, threadId: thread.id,
    dedupeKey: randomUUID(), instruction: "Find the order and check its status", member,
  };
}
async function seedTask() {
  const input = await seed();
  const { request } = await acceptMemberAgentRequest(input);
  const task = await attachMemberAgentTask({ ...input, requestId: request.id, budget });
  return { input, request, task };
}
function proposalData(task: { id: string; organizationId: string; revision: number }) {
  return {
    organizationId: task.organizationId, taskId: task.id, taskRevision: task.revision,
    schemaVersion: 1, instruction: "Find the order and check its status",
    canonicalActions: [], dependencies: [], proposalHash: "a".repeat(64),
    sourceRequestIds: [],
    approverScopeKind: "member" as const, approverScopeKey: `member:${task.id}`,
  };
}
afterEach(async () => {
  for (const id of orgIds.splice(0)) await cleanupTestData(id);
});

describe("durable dashboard persistence foundation", () => {
  it("accepts concurrent retries once and atomically attaches one task", async () => {
    const input = await seed();
    const results = await Promise.all(Array.from({ length: 6 }, () => acceptMemberAgentRequest(input)));
    expect(new Set(results.map(r => r.request.id)).size).toBe(1);
    expect(results.filter(r => !r.deduplicated)).toHaveLength(1);
    const requestId = results[0].request.id;
    expect(results[0].request.state).toBe("accepted");
    const tasks = await Promise.all(Array.from({ length: 6 }, () =>
      attachMemberAgentTask({ ...input, requestId, budget })));
    expect(new Set(tasks.map(t => t.id)).size).toBe(1);
    expect(await db.agentTask.count({ where: { organizationId: input.organizationId } })).toBe(1);
    expect((await getMemberAgentRequest({ ...input, requestId }))?.state).toBe("attached");
  });

  it("accepts and attaches in one transaction for the submission boundary", async () => {
    const input = await seed();
    const results = await Promise.all(Array.from({ length: 6 }, () =>
      acceptMemberAgentRequest({ ...input, budget })));
    expect(new Set(results.map(result => result.request.id)).size).toBe(1);
    expect(new Set(results.map(result => result.task?.id)).size).toBe(1);
    expect(results.every(result => result.request.state === "attached")).toBe(true);
    expect(await db.agentTask.count({ where: { organizationId: input.organizationId } })).toBe(1);
  });

  it("conflicts on changed payload while preserving the original request", async () => {
    const input = await seed();
    const original = await acceptMemberAgentRequest(input);
    await expect(acceptMemberAgentRequest({ ...input, instruction: "Refund it instead" }))
      .rejects.toBeInstanceOf(ConflictError);
    expect((await acceptMemberAgentRequest({ ...input, instruction: "  " + input.instruction + "  " })).request.id)
      .toBe(original.request.id);
  });

  it("isolates tenants and members and rechecks revoked membership", async () => {
    const { input, request } = await seedTask();
    const other = await seed();
    expect(await getMemberAgentRequest({ ...other, requestId: request.id })).toBeNull();
    const secondMember = await db.orgMember.create({
      data: { organizationId: input.organizationId, clerkUserId: randomUUID() },
    });
    const otherMember = { ...input, clerkUserId: secondMember.clerkUserId };
    expect(await getMemberAgentRequest({ ...otherMember, requestId: request.id })).toBeNull();
    await expect(acceptMemberAgentRequest(otherMember)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(attachMemberAgentTask({ ...otherMember, requestId: request.id, budget }))
      .rejects.toBeInstanceOf(ForbiddenError);
    await db.orgMember.delete({ where: { id: input.member.id } });
    await expect(getMemberAgentRequest({ ...input, requestId: request.id })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("has one claim winner and rejects stale revisions, tokens, and expired leases", async () => {
    const { task } = await seedTask();
    const now = new Date("2026-09-15T12:00:00Z");
    const identity = { organizationId: task.organizationId, taskId: task.id, expectedRevision: 0, now };
    const claims = await Promise.all(Array.from({ length: 6 }, () => claimAgentTask(identity)));
    expect(claims.filter(Boolean)).toHaveLength(1);
    const winner = claims.find(c => c !== null)!;
    expect(await renewAgentTaskLease({ ...identity, claimToken: randomUUID() })).toBe(false);
    expect(await renewAgentTaskLease({ ...identity, expectedRevision: 1, claimToken: winner.claimToken })).toBe(false);
    expect(await renewAgentTaskLease({ ...identity, claimToken: winner.claimToken })).toBe(true);
    const expired = new Date(now.getTime() + 60001);
    expect(await renewAgentTaskLease({ ...identity, now: expired, claimToken: winner.claimToken })).toBe(false);
    expect(await claimAgentTask({ ...identity, now: expired })).toBeNull();
  });

  it("settles only the winning claim and carries durable response links", async () => {
    const { input, request, task } = await seedTask();
    const claim = await claimAgentTask({ organizationId: task.organizationId, taskId: task.id, expectedRevision: 0 });
    expect(claim).not.toBeNull();
    await db.message.create({ data: {
      organizationId: input.organizationId, threadId: input.threadId,
      senderType: "agent", contentText: "Done", agentRequestId: request.id, agentTaskId: task.id,
    } });
    await db.agentAction.create({ data: {
      organizationId: input.organizationId, threadId: input.threadId,
      turnId: request.id, tool: "get_order", category: "order", input: {},
      output: "Found it", status: "success", mode: "human_approved",
    } });
    const identity = {
      organizationId: input.organizationId, taskId: task.id, expectedRevision: 0,
      claimToken: claim!.claimToken,
    };
    expect(await reserveAgentTaskModelCall(identity)).toBe("active");
    expect(await recordAgentTaskModelUsage({
      ...identity, usage: { inputTokens: 10, outputTokens: 5, spentNanoUsd: 99n },
    })).toBe(true);
    await expect(settleAgentTaskClaim({
      ...identity, requestId: request.id, settlement: { status: "completed" },
    })).resolves.toBe(true);
    const stored = await db.agentTask.findUniqueOrThrow({ where: { id: task.id }, include: { actions: true, messages: true } });
    expect(stored).toMatchObject({
      status: "completed", claimToken: null, activeCheckpointAt: null,
      modelCallsUsed: 1, inputTokensUsed: 10, outputTokensUsed: 5,
    });
    // Active time is measured from the claim interval alone, so nothing can
    // report the same milliseconds twice.
    expect(stored.activeTimeMsUsed).toBeLessThan(120000);
    expect(stored.spentNanoUsd).toBe(99n);
    expect(stored.actions[0]?.taskId).toBe(task.id);
    expect(stored.messages[0]?.agentRequestId).toBe(request.id);
  });

  it("preserves the cumulative budget across a crashed attempt", async () => {
    const { input, request, task } = await seedTask();
    const identity = { organizationId: input.organizationId, taskId: task.id, expectedRevision: 0 };
    const start = new Date("2026-09-15T12:00:00Z");
    const first = await claimAgentTask({ ...identity, leaseMs: 1000, now: start });
    for (let call = 0; call < 3; call += 1) {
      expect(await reserveAgentTaskModelCall({ ...identity, claimToken: first!.claimToken, now: start }))
        .toBe("active");
      await recordAgentTaskModelUsage({
        ...identity, claimToken: first!.claimToken, now: start,
        usage: { inputTokens: 100, outputTokens: 50, spentNanoUsd: 10n },
      });
    }
    // The worker dies here: nothing settles, and the sweep releases the claim.
    await reconcileExpiredAgentTaskClaims(new Date(start.getTime() + 2000));
    await db.agentTask.update({ where: { id: task.id }, data: { status: "queued", failureCode: null } });

    const second = await claimAgentTask(identity);
    const resumed = await db.agentTask.findUniqueOrThrow({ where: { id: task.id } });
    expect(resumed).toMatchObject({ modelCallsUsed: 3, inputTokensUsed: 300, outputTokensUsed: 150 });
    expect(resumed.spentNanoUsd).toBe(30n);
    expect(resumed.activeTimeMsUsed).toBeGreaterThanOrEqual(2000);

    await db.agentTask.update({ where: { id: task.id }, data: { modelCallsUsed: resumed.modelCallLimit } });
    expect(await reserveAgentTaskModelCall({ ...identity, claimToken: second!.claimToken }))
      .toBe("budget_exhausted");
    expect(await failAgentTaskClaim({
      ...identity, claimToken: second!.claimToken, requestId: request.id,
      failureCode: "task_budget_exhausted",
    })).toBe("failed");
  });

  it("stops a claimed attempt before dispatch and cancels it", async () => {
    const { input, request, task } = await seedTask();
    const identity = { organizationId: input.organizationId, taskId: task.id, expectedRevision: 0 };
    const claim = await claimAgentTask(identity);
    const stopped = await cancelMemberAgentTask({
      organizationId: input.organizationId, clerkUserId: input.clerkUserId,
      taskId: task.id, expectedRevision: 0,
    });
    // The running attempt keeps its claim until it observes the stop.
    expect(stopped.status).toBe("running");
    expect(stopped.cancelledAt).not.toBeNull();
    expect(await reserveAgentTaskModelCall({ ...identity, claimToken: claim!.claimToken })).toBe("cancelled");
    expect(await renewAgentTaskLease({ ...identity, claimToken: claim!.claimToken })).toBe(false);
    expect(await failAgentTaskClaim({
      ...identity, claimToken: claim!.claimToken, requestId: request.id, failureCode: "turn_failed",
    })).toBe("cancelled");
    const stored = await db.agentTask.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored).toMatchObject({ status: "cancelled", failureCode: null, claimToken: null });
  });

  it("supersedes the card a stop arrives on", async () => {
    const { input, request, task } = await seedTask();
    const claim = await claimAgentTask({
      organizationId: input.organizationId, taskId: task.id, expectedRevision: 0,
    });
    const proposalId = randomUUID();
    await settleAgentTaskClaim({
      organizationId: input.organizationId, taskId: task.id, expectedRevision: 0,
      claimToken: claim!.claimToken, requestId: request.id,
      settlement: {
        status: "waiting_approval",
        proposal: {
          proposalId, instruction: input.instruction,
          rawToolCalls: [{ id: "tc1", name: "create_refund", input: { order_id: "1" } }],
          sourceRequestIds: [request.id],
        },
      },
    });

    const parked = await db.agentTask.findUniqueOrThrow({ where: { id: task.id } });
    await cancelMemberAgentTask({
      organizationId: input.organizationId, clerkUserId: input.clerkUserId,
      taskId: task.id, expectedRevision: parked.revision,
    });

    // The stop ends the wait, so the card it was parked on stops being a card.
    expect((await db.agentProposal.findUniqueOrThrow({ where: { id: proposalId } })).status)
      .toBe("superseded");
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: task.id } }))
      .toMatchObject({ status: "cancelled", activeProposalId: null });
  });

  it("reconciles rather than cancels once an action reached dispatch", async () => {
    const { input, request, task } = await seedTask();
    const identity = { organizationId: input.organizationId, taskId: task.id, expectedRevision: 0 };
    const claim = await claimAgentTask(identity);
    await db.agentAction.create({ data: {
      organizationId: input.organizationId, threadId: input.threadId, taskId: task.id,
      turnId: request.id, tool: "create_refund", category: "order", input: {},
      status: "unknown", mode: "human_approved", dispatchState: "submitted",
      submittedAt: new Date(), operationId: randomUUID(), actionIndex: 0,
    } });
    await cancelMemberAgentTask({
      organizationId: input.organizationId, clerkUserId: input.clerkUserId,
      taskId: task.id, expectedRevision: 0,
    });
    expect(await settleAgentTaskClaim({
      ...identity, claimToken: claim!.claimToken, requestId: request.id, settlement: { status: "completed" },
    })).toBe(true);
    const stored = await db.agentTask.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored).toMatchObject({ status: "reconciling", failureCode: "cancelled_after_dispatch" });
  });

  it("refuses a stop from another member or against a stale revision", async () => {
    const { input, task } = await seedTask();
    const other = await seed();
    await expect(cancelMemberAgentTask({
      organizationId: input.organizationId, clerkUserId: other.clerkUserId,
      taskId: task.id, expectedRevision: 0,
    })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(cancelMemberAgentTask({
      organizationId: input.organizationId, clerkUserId: input.clerkUserId,
      taskId: task.id, expectedRevision: 1,
    })).rejects.toBeInstanceOf(ConflictError);
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: task.id } })).cancelledAt).toBeNull();
  });

  it("fails clean attempts but reconciles interrupted consequential work", async () => {
    const clean = await seedTask();
    const cleanClaim = await claimAgentTask({ organizationId: clean.task.organizationId, taskId: clean.task.id, expectedRevision: 0 });
    expect(await failAgentTaskClaim({
      organizationId: clean.task.organizationId, taskId: clean.task.id, expectedRevision: 0,
      claimToken: cleanClaim!.claimToken, requestId: clean.request.id, failureCode: "model_failed",
    })).toBe("failed");

    const uncertain = await seedTask();
    const uncertainClaim = await claimAgentTask({ organizationId: uncertain.task.organizationId, taskId: uncertain.task.id, expectedRevision: 0 });
    await db.agentAction.create({ data: {
      organizationId: uncertain.task.organizationId, threadId: uncertain.task.threadId,
      turnId: uncertain.request.id, tool: "create_refund", category: "order", input: {},
      status: "unknown", mode: "human_approved", dispatchState: "submitted",
      submittedAt: new Date(),
      operationId: randomUUID(), actionIndex: 0,
    } });
    expect(await failAgentTaskClaim({
      organizationId: uncertain.task.organizationId, taskId: uncertain.task.id, expectedRevision: 0,
      claimToken: uncertainClaim!.claimToken, requestId: uncertain.request.id, failureCode: "worker_lost",
    })).toBe("reconciling");
  });

  it("finds accepted queue gaps and marks expired running claims for reconciliation", async () => {
    const queued = await seedTask();
    expect((await findQueuedAgentTasks()).map(task => task.id)).toContain(queued.task.id);
    const now = new Date("2026-09-15T12:00:00Z");
    await claimAgentTask({
      organizationId: queued.task.organizationId, taskId: queued.task.id,
      expectedRevision: 0, now, leaseMs: 1000,
    });
    expect(await reconcileExpiredAgentTaskClaims(new Date(now.getTime() + 1001))).toBeGreaterThanOrEqual(1);
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: queued.task.id } })).status).toBe("reconciling");
  });

  it("closes an expired stopped attempt by what it dispatched", async () => {
    const now = new Date("2026-09-15T12:00:00Z");
    const expiry = new Date(now.getTime() + 1001);
    const clean = await seedTask();
    await claimAgentTask({
      organizationId: clean.task.organizationId, taskId: clean.task.id,
      expectedRevision: 0, now, leaseMs: 1000,
    });
    await cancelMemberAgentTask({
      organizationId: clean.input.organizationId, clerkUserId: clean.input.clerkUserId,
      taskId: clean.task.id, expectedRevision: 0,
    });

    const dispatched = await seedTask();
    await claimAgentTask({
      organizationId: dispatched.task.organizationId, taskId: dispatched.task.id,
      expectedRevision: 0, now, leaseMs: 1000,
    });
    await db.agentAction.create({ data: {
      organizationId: dispatched.input.organizationId, threadId: dispatched.input.threadId,
      taskId: dispatched.task.id, turnId: dispatched.request.id, tool: "create_refund",
      category: "order", input: {}, status: "unknown", mode: "human_approved",
      dispatchState: "submitted", submittedAt: now, operationId: randomUUID(), actionIndex: 0,
    } });
    await cancelMemberAgentTask({
      organizationId: dispatched.input.organizationId, clerkUserId: dispatched.input.clerkUserId,
      taskId: dispatched.task.id, expectedRevision: 0,
    });

    await reconcileExpiredAgentTaskClaims(expiry);
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: clean.task.id } }))
      .toMatchObject({ status: "cancelled", failureCode: null, activeCheckpointAt: null });
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: dispatched.task.id } }))
      .toMatchObject({ status: "reconciling", failureCode: "cancelled_after_dispatch" });
  });

  it("never reopens a terminal task on request redelivery", async () => {
    const { input, task, request } = await seedTask();
    await db.agentTask.update({ where: { id: task.id }, data: { status: "completed", completedAt: new Date() } });
    expect((await attachMemberAgentTask({ ...input, requestId: request.id, budget })).status).toBe("completed");
    expect((await acceptMemberAgentRequest(input)).request.id).toBe(request.id);
    expect(await claimAgentTask({ organizationId: task.organizationId, taskId: task.id, expectedRevision: 0 })).toBeNull();
  });

  it("refuses queued work with a potentially submitted write", async () => {
    const { task } = await seedTask();
    await db.agentAction.create({ data: {
      organizationId: task.organizationId, threadId: task.threadId, taskId: task.id,
      turnId: randomUUID(), tool: "create_refund", category: "order", input: {},
      status: "unknown", mode: "auto_executed", dispatchState: "unknown",
      executedAt: new Date(), durationMs: 1,
      operationId: randomUUID(), actionIndex: 0,
    } });
    expect(await claimAgentTask({ organizationId: task.organizationId, taskId: task.id, expectedRevision: 0 })).toBeNull();
  });

  it("rejects cross-tenant parents even when helpers are bypassed", async () => {
    const { task } = await seedTask();
    const other = await seedTask();
    await expect(db.agentProposal.create({
      data: { ...proposalData(task), organizationId: other.task.organizationId },
    })).rejects.toThrow();
    await expect(db.message.create({
      data: { organizationId: other.task.organizationId, threadId: other.task.threadId, senderType: "agent", agentTaskId: task.id },
    })).rejects.toThrow();
  });

  it("binds active proposals and execution bundles to the exact task", async () => {
    const { task, input } = await seedTask();
    const secondRequest = await acceptMemberAgentRequest({ ...input, dedupeKey: randomUUID() });
    const second = await attachMemberAgentTask({ ...input, requestId: secondRequest.request.id, budget });
    const proposal = await db.agentProposal.create({ data: proposalData(task) });
    await expect(db.agentTask.update({ where: { id: second.id }, data: { activeProposalId: proposal.id } })).rejects.toThrow();
    await expect(db.planExecution.create({
      data: { organizationId: task.organizationId, planId: proposal.id, proposalId: proposal.id, taskId: second.id,
        planHash: "a".repeat(64), instructionHash: "b".repeat(64) },
    })).rejects.toThrow();
    await expect(db.planExecution.create({
      data: { organizationId: task.organizationId, planId: randomUUID(), proposalId: proposal.id, taskId: task.id,
        planHash: "a".repeat(64), instructionHash: "b".repeat(64) },
    })).rejects.toThrow();
  });

  it("rejects immutable edits, decreasing budgets, and incomplete approval evidence", async () => {
    const { task, request } = await seedTask();
    await expect(db.agentRequest.update({ where: { id: request.id }, data: { normalizedInstruction: "Different" } })).rejects.toThrow();
    await db.agentTask.update({ where: { id: task.id }, data: { revision: 2, modelCallsUsed: 2 } });
    await expect(db.agentTask.update({ where: { id: task.id }, data: { revision: 1 } })).rejects.toThrow();
    await expect(db.agentTask.update({ where: { id: task.id }, data: { modelCallsUsed: 1 } })).rejects.toThrow();
    await expect(db.agentTask.update({ where: { id: task.id }, data: { runtimeVersion: 2 } })).rejects.toThrow();
    const proposal = await db.agentProposal.create({ data: proposalData(task) });
    await expect(db.agentProposal.update({ where: { id: proposal.id }, data: { canonicalActions: [{ tool: "refund" }] } })).rejects.toThrow();
    await expect(db.agentProposal.update({ where: { id: proposal.id }, data: { status: "approved" } })).rejects.toThrow();
    await expect(db.agentProposal.update({ where: { id: proposal.id }, data: {
      approverKey: "member", approvedAt: new Date(), approvedHash: "c".repeat(64),
    } })).rejects.toThrow();
  });

  it("protects durable work from ordinary thread deletion and permits whole-workspace deletion", async () => {
    const { task, input } = await seedTask();
    const proposal = await db.agentProposal.create({ data: proposalData(task) });
    const execution = await db.planExecution.create({ data: {
      organizationId: task.organizationId, threadId: task.threadId,
      planId: proposal.id, proposalId: proposal.id, taskId: task.id,
      planHash: "a".repeat(64), instructionHash: "b".repeat(64),
    } });
    await db.agentAction.create({ data: {
      organizationId: task.organizationId, threadId: task.threadId,
      taskId: task.id, proposalId: proposal.id, executionId: execution.id,
      turnId: randomUUID(), tool: "add_internal_note", category: "thread",
      input: {}, mode: "auto_executed", status: "success",
    } });
    await expect(db.thread.delete({ where: { id: input.threadId } })).rejects.toThrow();
    await db.organization.delete({ where: { id: input.organizationId } });
    expect(await db.agentTask.count({ where: { organizationId: input.organizationId } })).toBe(0);
    expect(await db.agentRequest.count({ where: { organizationId: input.organizationId } })).toBe(0);
    expect(await db.agentProposal.count({ where: { organizationId: input.organizationId } })).toBe(0);
    orgIds.splice(orgIds.indexOf(input.organizationId), 1);
  });
});

describe("durable proposal and question writers", () => {
  const refundCalls = [{ id: "call-1", name: "create_refund", input: { orderId: "55", amount: "12.00" } }];
  async function claimedTask() {
    const seeded = await seedTask();
    const claim = await claimAgentTask({
      organizationId: seeded.task.organizationId, taskId: seeded.task.id, expectedRevision: 0,
    });
    return {
      ...seeded,
      identity: {
        organizationId: seeded.task.organizationId, taskId: seeded.task.id,
        expectedRevision: 0, claimToken: claim!.claimToken,
      },
    };
  }

  it("persists the proposal a waiting task is waiting on and binds it to that task", async () => {
    const { task, request, identity } = await claimedTask();
    expect(await settleAgentTaskClaim({
      ...identity, requestId: request.id,
      settlement: { status: "waiting_approval", proposal: {
        instruction: "refund the order", rawToolCalls: refundCalls, sourceRequestIds: [request.id],
      } },
    })).toBe(true);
    const stored = await db.agentTask.findUniqueOrThrow({
      where: { id: task.id }, include: { activeProposal: true },
    });
    expect(stored.status).toBe("waiting_approval");
    expect(stored.activeProposal).toMatchObject({
      taskId: task.id, taskRevision: 0, schemaVersion: 1, status: "ready",
      instruction: "refund the order",
      canonicalActions: refundCalls, sourceRequestIds: [request.id],
    });
    expect(stored.activeProposal!.proposalHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.pendingQuestionId).toBeNull();
  });

  it("reuses the proposal row when a replayed attempt re-proposes the same bundle", async () => {
    const { task, request, identity } = await claimedTask();
    const settlement = { status: "waiting_approval" as const, proposal: {
      instruction: "refund the order", rawToolCalls: refundCalls, sourceRequestIds: [request.id],
    } };
    await settleAgentTaskClaim({ ...identity, requestId: request.id, settlement });
    const first = await db.agentProposal.findFirstOrThrow({ where: { taskId: task.id } });

    await db.agentTask.update({ where: { id: task.id }, data: {
      status: "running", claimToken: identity.claimToken,
      leaseExpiresAt: new Date(Date.now() + 60000), activeCheckpointAt: new Date(),
    } });
    // Key order is canonicalized, so the same bundle authored differently is the
    // same thing to approve and must not become a second proposal.
    expect(await settleAgentTaskClaim({
      ...identity, requestId: request.id,
      settlement: { ...settlement, proposal: { ...settlement.proposal, rawToolCalls: [
        { name: "create_refund", id: "call-1", input: { amount: "12.00", orderId: "55" } },
      ] } },
    })).toBe(true);
    expect(await db.agentProposal.count({ where: { taskId: task.id } })).toBe(1);
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: task.id } })).activeProposalId).toBe(first.id);
  });

  it("names a parked question and the only actor scoped to answer it", async () => {
    const { task, request, identity, input } = await claimedTask();
    expect(await settleAgentTaskClaim({
      ...identity, requestId: request.id,
      settlement: { status: "waiting_input", question: "  Refund the shipping too?  " },
    })).toBe(true);
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({
      status: "waiting_input", pendingQuestion: "Refund the shipping too?",
      pendingAnswererKind: "member", pendingAnswererKey: `member:${input.member.id}`,
      activeProposalId: null,
    });
  });

  it("leaves a stopped, failed, or expired attempt waiting on nothing", async () => {
    const stopped = await claimedTask();
    await settleAgentTaskClaim({
      ...stopped.identity, requestId: stopped.request.id,
      settlement: { status: "waiting_approval", proposal: {
        instruction: "refund the order", rawToolCalls: refundCalls, sourceRequestIds: [stopped.request.id],
      } },
    });
    await cancelMemberAgentTask({
      organizationId: stopped.input.organizationId, clerkUserId: stopped.input.clerkUserId,
      taskId: stopped.task.id, expectedRevision: 0,
    });
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: stopped.task.id } }))
      .toMatchObject({ status: "cancelled", activeProposalId: null });
    // The snapshot survives the stop; only the task's claim on it ends.
    expect(await db.agentProposal.count({ where: { taskId: stopped.task.id } })).toBe(1);

    const failed = await claimedTask();
    await db.agentTask.update({ where: { id: failed.task.id }, data: {
      pendingQuestionId: randomUUID(), pendingQuestion: "Which order?",
      pendingAnswererKind: "member", pendingAnswererKey: failed.task.initiatingActorKey,
    } });
    expect(await failAgentTaskClaim({
      ...failed.identity, requestId: failed.request.id, failureCode: "model_failed",
    })).toBe("failed");
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: failed.task.id } }))
      .toMatchObject({ pendingQuestionId: null, pendingQuestion: null, pendingAnswererKey: null });

    const expired = await seedTask();
    const now = new Date("2026-09-15T12:00:00Z");
    await claimAgentTask({
      organizationId: expired.task.organizationId, taskId: expired.task.id,
      expectedRevision: 0, now, leaseMs: 1000,
    });
    await db.agentTask.update({ where: { id: expired.task.id }, data: {
      pendingQuestionId: randomUUID(), pendingQuestion: "Which order?",
      pendingAnswererKind: "member", pendingAnswererKey: expired.task.initiatingActorKey,
    } });
    await reconcileExpiredAgentTaskClaims(new Date(now.getTime() + 1001));
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: expired.task.id } }))
      .toMatchObject({ status: "reconciling", pendingQuestionId: null, pendingQuestion: null });
  });
});

describe("scoped question continuation", () => {
  async function park(input: Awaited<ReturnType<typeof seed>>) {
    const { request } = await acceptMemberAgentRequest({ ...input, dedupeKey: randomUUID() });
    const task = await attachMemberAgentTask({ ...input, requestId: request.id, budget });
    const claim = await claimAgentTask({
      organizationId: task.organizationId, taskId: task.id, expectedRevision: 0,
    });
    await settleAgentTaskClaim({
      organizationId: task.organizationId, taskId: task.id, expectedRevision: 0,
      claimToken: claim!.claimToken, requestId: request.id,
      settlement: { status: "waiting_input", question: "Which order did they mean?" },
    });
    return { request, task };
  }
  function answer(input: Awaited<ReturnType<typeof seed>>) {
    return acceptMemberAgentRequest({
      ...input, dedupeKey: randomUUID(), instruction: "The black one", budget,
    });
  }

  it("continues the task its answer belongs to instead of opening a second one", async () => {
    const input = await seed();
    const { task } = await park(input);
    const answered = await answer(input);
    expect(answered.task?.id).toBe(task.id);
    expect(answered.request.taskId).toBe(task.id);
    expect(answered.request.state).toBe("attached");
    expect(await db.agentTask.count({ where: { organizationId: input.organizationId } })).toBe(1);
    // A fresh revision invalidates the parked attempt's claim and names nothing
    // to wait on, so the resumed attempt runs the answer rather than the question.
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({
      status: "queued", revision: 1, pendingQuestionId: null, pendingQuestion: null,
      pendingAnswererKind: null, pendingAnswererKey: null,
    });
  });

  it("leaves a question parked for another actor unanswered", async () => {
    const input = await seed();
    const { task } = await park(input);
    await db.agentTask.update({
      where: { id: task.id }, data: { pendingAnswererKey: `member:${randomUUID()}` },
    });
    const answered = await answer(input);
    expect(answered.task?.id).not.toBe(task.id);
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: task.id } }))
      .toMatchObject({ status: "waiting_input", revision: 0, pendingQuestion: "Which order did they mean?" });
  });

  it("resumes neither task when two parked questions make the answer ambiguous", async () => {
    const input = await seed();
    const first = await park(input);
    const second = await park(input);
    const answered = await answer(input);
    expect([first.task.id, second.task.id]).not.toContain(answered.task?.id);
    expect(await db.agentTask.count({
      where: { organizationId: input.organizationId, status: "waiting_input" },
    })).toBe(2);
    expect(await db.agentTask.count({ where: { organizationId: input.organizationId } })).toBe(3);
  });

  it("does not attach an answer to work no worker may claim", async () => {
    const input = await seed();
    const { task } = await park(input);
    await db.agentAction.create({ data: {
      organizationId: task.organizationId, threadId: task.threadId, taskId: task.id,
      turnId: randomUUID(), tool: "create_refund", category: "order", input: {},
      status: "unknown", mode: "auto_executed", dispatchState: "unknown",
      executedAt: new Date(), durationMs: 1, operationId: randomUUID(), actionIndex: 0,
    } });
    expect((await answer(input)).task?.id).not.toBe(task.id);
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: task.id } })).status).toBe("waiting_input");
  });

  it("resumes once when two answers race for one parked question", async () => {
    const input = await seed();
    const { task } = await park(input);
    const answers = await Promise.all([answer(input), answer(input)]);
    expect(answers.filter((result) => result.task?.id === task.id)).toHaveLength(1);
    expect(await db.agentTask.count({ where: { organizationId: input.organizationId } })).toBe(2);
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: task.id } })).revision).toBe(1);
  });
});

describe("support conversation request boundary", () => {
  async function seedSupport(channel: "email" | "operator" = "email") {
    const org = await createTestOrg();
    orgIds.push(org.id);
    const customer = await createTestCustomer(org.id, randomUUID());
    const thread = await createTestThread(org.id, customer.id, channel);
    const message = await createTestMessage(thread.id, "Where is my order?");
    return {
      organizationId: org.id, threadId: thread.id, customerId: customer.id,
      sourceMessageId: message.id, objective: "Handle this customer's latest request",
      budget,
    };
  }

  it("accepts one request per inbound message however often planning runs", async () => {
    const input = await seedSupport();
    const results = await Promise.all(Array.from({ length: 6 }, () =>
      acceptCustomerAgentRequest(input)));
    expect(new Set(results.map(r => r.request.id)).size).toBe(1);
    expect(new Set(results.map(r => r.task.id)).size).toBe(1);
    expect(await db.agentRequest.count({ where: { organizationId: input.organizationId } })).toBe(1);
    expect(await db.agentTask.count({ where: { organizationId: input.organizationId } })).toBe(1);
    expect(results[0].request).toMatchObject({
      actorKind: "customer", actorKey: `customer:${input.customerId}`,
      channel: "email", sourceMessageId: input.sourceMessageId, state: "attached",
    });
    expect(results[0].task).toMatchObject({
      initiatingActorKind: "customer", objective: input.objective, status: "queued",
    });
  });

  // The objective comes from the thread's request summary, which the summary job
  // fills in after the message lands. Hashing it would make the second planning
  // job for one message conflict with the first.
  it("re-accepts the same message under a later objective", async () => {
    const input = await seedSupport();
    const first = await acceptCustomerAgentRequest(input);
    const second = await acceptCustomerAgentRequest({
      ...input, objective: "Customer is asking where their order is",
    });
    expect(second.request.id).toBe(first.request.id);
    expect(second.task.id).toBe(first.task.id);
    expect(second.task.objective).toBe(input.objective);
  });

  it("mints no customer actor on an operator conversation", async () => {
    const input = await seedSupport("operator");
    await expect(acceptCustomerAgentRequest(input)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await db.agentRequest.count({ where: { organizationId: input.organizationId } })).toBe(0);
  });

  it("refuses a message that is not the customer's own", async () => {
    const input = await seedSupport();
    const agentMessage = await createTestMessage(input.threadId, "On it", "agent");
    await expect(acceptCustomerAgentRequest({ ...input, sourceMessageId: agentMessage.id }))
      .rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuses a message from another organization's conversation", async () => {
    const mine = await seedSupport();
    const theirs = await seedSupport();
    await expect(acceptCustomerAgentRequest({ ...mine, sourceMessageId: theirs.sourceMessageId }))
      .rejects.toBeInstanceOf(ForbiddenError);
  });

  it("advances the thread's open task instead of opening a second beside it", async () => {
    const input = await seedSupport();
    const { task } = await acceptCustomerAgentRequest(input);
    const claim = await claimAgentTask({
      organizationId: input.organizationId, taskId: task.id, expectedRevision: task.revision,
    });
    await settleAgentTaskClaim({
      organizationId: input.organizationId, taskId: task.id, expectedRevision: task.revision,
      claimToken: claim!.claimToken, requestId: (await db.agentRequest.findFirstOrThrow({
        where: { organizationId: input.organizationId },
      })).id,
      settlement: { status: "waiting_approval", proposal: {
        instruction: "Refund them", sourceRequestIds: [],
        rawToolCalls: [{ id: "t1", name: "create_refund", input: { order_id: "1" } }],
      } },
    });
    const parked = await db.agentTask.findUniqueOrThrow({ where: { id: task.id } });
    expect(parked.status).toBe("waiting_approval");
    expect(parked.activeProposalId).not.toBeNull();

    const next = await createTestMessage(input.threadId, "Actually, cancel it");
    const later = await acceptCustomerAgentRequest({ ...input, sourceMessageId: next.id });
    expect(later.task.id).toBe(task.id);
    // The revision increment is the supersede: the parked proposal is no longer
    // what this task is waiting on.
    expect(later.task).toMatchObject({ status: "queued", revision: 1, activeProposalId: null });
    expect(await db.agentTask.count({ where: { organizationId: input.organizationId } })).toBe(1);
    expect(await db.agentRequest.count({ where: { organizationId: input.organizationId } })).toBe(2);
  });

  it("keeps independent classified topics as separate tasks", async () => {
    const input = await seedSupport();
    const first = await acceptCustomerAgentRequest({
      ...input,
      continuity: { ask: "return", order: "#1001", subject: "blue shirt" },
    });
    const next = await createTestMessage(input.threadId, "Also, where is order 2002?");
    const second = await acceptCustomerAgentRequest({
      ...input,
      sourceMessageId: next.id,
      continuity: { ask: "order_status", order: "#2002", subject: null },
    });

    expect(second.task.id).not.toBe(first.task.id);
    expect(await db.agentTask.count({ where: { organizationId: input.organizationId } })).toBe(2);
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: first.task.id } })).revision).toBe(0);
  });

  it("does not supersede a parked task when runtime-v2 classification is absent", async () => {
    const input = await seedSupport();
    const first = await acceptCustomerAgentRequest({
      ...input,
      continuityMode: "classified",
      continuity: { ask: "return", order: "#1001", subject: null },
    });
    const terseMessage = await createTestMessage(input.threadId, "Yes, that one");
    const terse = await acceptCustomerAgentRequest({
      ...input,
      sourceMessageId: terseMessage.id,
      continuityMode: "classified",
    });

    expect(terse.task.id).not.toBe(first.task.id);
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: first.task.id } })).revision).toBe(0);
  });

  it("returns to the one task matching the classified topic and entity", async () => {
    const input = await seedSupport();
    const first = await acceptCustomerAgentRequest({
      ...input,
      continuity: { ask: "return", order: "#1001", subject: "blue shirt" },
    });
    const otherMessage = await createTestMessage(input.threadId, "Where is order 2002?");
    await acceptCustomerAgentRequest({
      ...input,
      sourceMessageId: otherMessage.id,
      continuity: { ask: "order_status", order: "#2002", subject: null },
    });
    const returnMessage = await createTestMessage(input.threadId, "Back to returning order 1001");
    const resumed = await acceptCustomerAgentRequest({
      ...input,
      sourceMessageId: returnMessage.id,
      continuity: { ask: "return", order: "#1001", subject: null },
    });

    expect(resumed.task.id).toBe(first.task.id);
    expect(resumed.task.revision).toBe(1);
    expect((resumed.task.checkpoint as { sourceRequestIds: string[] }).sourceRequestIds).toEqual([
      first.request.id,
      resumed.request.id,
    ]);
  });

  it("keeps two items on the same order separate and resumes only the named item", async () => {
    const input = await seedSupport();
    const first = await acceptCustomerAgentRequest({
      ...input,
      continuity: { ask: "return", order: "#1001", subject: "blue shirt" },
    });
    const secondMessage = await createTestMessage(input.threadId, "I also need to return the black shoes from that order");
    const second = await acceptCustomerAgentRequest({
      ...input,
      sourceMessageId: secondMessage.id,
      continuity: { ask: "return", order: "#1001", subject: "black shoes" },
    });
    expect(second.task.id).not.toBe(first.task.id);

    const followUp = await createTestMessage(input.threadId, "About the blue shirt on order 1001");
    const resumed = await acceptCustomerAgentRequest({
      ...input,
      sourceMessageId: followUp.id,
      continuity: { ask: "return", order: "#1001", subject: "blue shirt" },
    });
    expect(resumed.task.id).toBe(first.task.id);
    expect(resumed.task.revision).toBe(1);
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: second.task.id } })).revision).toBe(0);

    const terse = await createTestMessage(input.threadId, "Yes, that one");
    const ambiguous = await acceptCustomerAgentRequest({
      ...input,
      sourceMessageId: terse.id,
      continuityMode: "classified",
      continuity: { ask: "return", order: "#1001", subject: null },
    });
    expect(ambiguous.task.id).not.toBe(first.task.id);
    expect(ambiguous.task.id).not.toBe(second.task.id);
  });

  it("does not choose between two tasks for an ambiguous terse follow-up", async () => {
    const input = await seedSupport();
    const first = await acceptCustomerAgentRequest({
      ...input,
      continuity: { ask: "return", order: null, subject: "blue shirt" },
    });
    const secondMessage = await createTestMessage(input.threadId, "I also need to return the black shoes");
    const second = await acceptCustomerAgentRequest({
      ...input,
      sourceMessageId: secondMessage.id,
      continuity: { ask: "return", order: null, subject: "black shoes" },
    });
    const ambiguousMessage = await createTestMessage(input.threadId, "Yes, that one");
    const ambiguous = await acceptCustomerAgentRequest({
      ...input,
      sourceMessageId: ambiguousMessage.id,
      continuity: { ask: "return", order: null, subject: null },
    });

    expect(new Set([first.task.id, second.task.id, ambiguous.task.id]).size).toBe(3);
    const originals = await db.agentTask.findMany({
      where: { id: { in: [first.task.id, second.task.id] } },
      select: { revision: true },
    });
    expect(originals).toEqual([{ revision: 0 }, { revision: 0 }]);
  });

  it("opens a new task rather than replaying one that reached a provider", async () => {
    const input = await seedSupport();
    const { task } = await acceptCustomerAgentRequest(input);
    await db.agentAction.create({ data: {
      organizationId: input.organizationId, threadId: input.threadId, taskId: task.id,
      turnId: randomUUID(), tool: "create_refund", category: "order", input: {},
      status: "unknown", mode: "auto_executed", dispatchState: "unknown",
      executedAt: new Date(), durationMs: 1, operationId: randomUUID(), actionIndex: 0,
    } });
    const next = await createTestMessage(input.threadId, "Any update?");
    const later = await acceptCustomerAgentRequest({ ...input, sourceMessageId: next.id });
    expect(later.task.id).not.toBe(task.id);
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: task.id } })).revision).toBe(0);
  });

  it("opens a new task rather than resetting a completed one", async () => {
    const input = await seedSupport();
    const { task } = await acceptCustomerAgentRequest(input);
    await db.agentTask.update({ where: { id: task.id }, data: { status: "completed" } });
    const next = await createTestMessage(input.threadId, "One more thing");
    const later = await acceptCustomerAgentRequest({ ...input, sourceMessageId: next.id });
    expect(later.task.id).not.toBe(task.id);
    expect(await db.agentTask.count({ where: { organizationId: input.organizationId } })).toBe(2);
  });

  // The durable task worker runs a member's own request and fails anything else
  // as invalid_task_owner, so its recovery sweep must not find support work.
  it("keeps customer-initiated work out of the member task queue", async () => {
    const input = await seedSupport();
    const { task } = await acceptCustomerAgentRequest(input);
    expect(task.status).toBe("queued");
    const memberInput = await seed();
    const memberRequest = await acceptMemberAgentRequest(memberInput);
    const memberTask = await attachMemberAgentTask({
      ...memberInput, requestId: memberRequest.request.id, budget,
    });
    const queued = (await findQueuedAgentTasks(100)).map(row => row.id);
    // Both are queued; only the member's belongs to that worker's queue.
    expect(queued).toContain(memberTask.id);
    expect(queued).not.toContain(task.id);
  });

  it("parks a support question on every member rather than on the customer", async () => {
    const input = await seedSupport();
    const { request, task } = await acceptCustomerAgentRequest(input);
    const claim = await claimAgentTask({
      organizationId: input.organizationId, taskId: task.id, expectedRevision: task.revision,
    });
    expect(await settleAgentTaskClaim({
      organizationId: input.organizationId, taskId: task.id, expectedRevision: task.revision,
      claimToken: claim!.claimToken, requestId: request.id,
      settlement: {
        status: "waiting_input", question: "Do you want to refund this one?",
        answerer: { kind: "member", key: ANY_MEMBER_ACTOR_KEY },
      },
    })).toBe(true);
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({
      status: "waiting_input",
      pendingQuestion: "Do you want to refund this one?",
      pendingAnswererKind: "member",
      pendingAnswererKey: ANY_MEMBER_ACTOR_KEY,
    });
  });
});

describe("support question continuation", () => {
  async function seedAnswerable() {
    const org = await createTestOrg();
    orgIds.push(org.id);
    const customer = await createTestCustomer(org.id, randomUUID());
    const thread = await createTestThread(org.id, customer.id, "email");
    const message = await createTestMessage(thread.id, "Where is my order?");
    // Two members, and the one that answers is never the one the attempt named:
    // a support question is pushed to every bound operator at once.
    const asked = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: randomUUID() },
    });
    const answering = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: randomUUID() },
    });
    const { request, task } = await acceptCustomerAgentRequest({
      organizationId: org.id, threadId: thread.id, sourceMessageId: message.id,
      objective: "Handle this customer's latest request", budget,
    });
    return {
      organizationId: org.id, threadId: thread.id, clerkUserId: answering.clerkUserId,
      endsWait: "question" as const, asked, answering, request, task,
    };
  }

  function current(seeded: Awaited<ReturnType<typeof seedAnswerable>>) {
    return { taskId: seeded.task.id, requestId: seeded.request.id };
  }

  // Runs one attempt on a support task and leaves it parked on a question, the
  // way the planning job does.
  async function park(
    seeded: { organizationId: string },
    on: { taskId: string; requestId: string },
    answerer = { kind: "member" as const, key: ANY_MEMBER_ACTOR_KEY },
  ) {
    const task = await db.agentTask.findUniqueOrThrow({ where: { id: on.taskId } });
    const claim = await claimAgentTask({
      organizationId: seeded.organizationId, taskId: task.id, expectedRevision: task.revision,
    });
    await settleAgentTaskClaim({
      organizationId: seeded.organizationId, taskId: task.id, expectedRevision: task.revision,
      claimToken: claim!.claimToken, requestId: on.requestId,
      settlement: { status: "waiting_input", question: "Do we refund this one?", answerer },
    });
    return task.id;
  }

  it("lets any bound member end a support wait and claims the task for their answer", async () => {
    const seeded = await seedAnswerable();
    const taskId = await park(seeded, current(seeded));
    const continued = await claimContinuedAgentTask(seeded);
    expect(continued).toMatchObject({ taskId, requestId: seeded.request.id, expectedRevision: 1 });
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: taskId } })).toMatchObject({
      status: "running", revision: 1, claimToken: continued!.claimToken,
      pendingQuestionId: null, pendingQuestion: null,
      pendingAnswererKind: null, pendingAnswererKey: null,
    });
    // The claim it returns is the one the re-plan settles on.
    expect(await settleAgentTaskClaim({
      ...continued!, requestId: continued!.requestId, settlement: { status: "completed" },
    })).toBe(true);
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: taskId } })).status).toBe("completed");
  });

  it("accepts the merchant answer as a durable request before continuing the task", async () => {
    const seeded = await seedAnswerable();
    const taskId = await park(seeded, current(seeded));
    const continued = await claimContinuedAgentTask({
      ...seeded,
      continuationInstruction: "Yes, refund this one.",
      continuationChannel: "operator",
    });

    expect(continued).toMatchObject({ taskId, expectedRevision: 1 });
    expect(continued!.requestId).not.toBe(seeded.request.id);
    expect(await db.agentRequest.findUniqueOrThrow({
      where: { id: continued!.requestId },
    })).toMatchObject({
      organizationId: seeded.organizationId,
      threadId: seeded.threadId,
      taskId,
      actorKind: "member",
      actorKey: `member:${seeded.answering.id}`,
      channel: "operator",
      state: "attached",
      normalizedInstruction: "Yes, refund this one.",
    });
  });

  it("refuses an answer from outside the organization", async () => {
    const seeded = await seedAnswerable();
    await park(seeded, current(seeded));
    const otherOrg = await createTestOrg();
    orgIds.push(otherOrg.id);
    const outsider = await db.orgMember.create({
      data: { organizationId: otherOrg.id, clerkUserId: randomUUID() },
    });
    await expect(claimContinuedAgentTask({
      ...seeded, clerkUserId: outsider.clerkUserId,
    })).rejects.toBeInstanceOf(ForbiddenError);
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: seeded.task.id } })).status)
      .toBe("waiting_input");
  });

  it("leaves a question scoped to one member for that member alone", async () => {
    const seeded = await seedAnswerable();
    const taskId = await park(seeded, current(seeded), { kind: "member", key: `member:${seeded.asked.id}` });
    expect(await claimContinuedAgentTask(seeded)).toBeNull();
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: taskId } })).toMatchObject({
      status: "waiting_input", revision: 0, pendingQuestion: "Do we refund this one?",
    });
    // The member it was actually asked of still ends it.
    expect(await claimContinuedAgentTask({
      ...seeded, clerkUserId: seeded.asked.clerkUserId,
    })).toMatchObject({ taskId });
  });

  it("continues neither task when two parked questions make the answer ambiguous", async () => {
    const seeded = await seedAnswerable();
    // A thread runs one task at a time, so the second message only opens a
    // second task while the first is claimed — which is the state that lets one
    // conversation hold two parked questions at all.
    const held = await claimAgentTask({
      organizationId: seeded.organizationId, taskId: seeded.task.id, expectedRevision: 0,
    });
    const second = await createTestMessage(seeded.threadId, "Actually, also this");
    const other = await acceptCustomerAgentRequest({
      organizationId: seeded.organizationId, threadId: seeded.threadId,
      sourceMessageId: second.id, objective: "Handle the follow-up", budget,
    });
    expect(other.task.id).not.toBe(seeded.task.id);
    await settleAgentTaskClaim({
      organizationId: seeded.organizationId, taskId: seeded.task.id, expectedRevision: 0,
      claimToken: held!.claimToken, requestId: seeded.request.id,
      settlement: {
        status: "waiting_input", question: "Do we refund this one?",
        answerer: { kind: "member", key: ANY_MEMBER_ACTOR_KEY },
      },
    });
    await park(seeded, { taskId: other.task.id, requestId: other.request.id });

    expect(await claimContinuedAgentTask(seeded)).toBeNull();
    expect(await db.agentTask.count({
      where: { organizationId: seeded.organizationId, status: "waiting_input" },
    })).toBe(2);
  });

  it("does not replay a task that already reached a provider", async () => {
    const seeded = await seedAnswerable();
    const taskId = await park(seeded, current(seeded));
    await db.agentAction.create({ data: {
      organizationId: seeded.organizationId, threadId: seeded.threadId, taskId,
      turnId: randomUUID(), tool: "create_refund", category: "order", input: {},
      status: "unknown", mode: "auto_executed", dispatchState: "unknown",
      executedAt: new Date(), durationMs: 1, operationId: randomUUID(), actionIndex: 0,
    } });
    expect(await claimContinuedAgentTask(seeded)).toBeNull();
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: taskId } })).status)
      .toBe("waiting_input");
  });

  it("claims once when two members answer the same question at the same time", async () => {
    const seeded = await seedAnswerable();
    const taskId = await park(seeded, current(seeded));
    const claims = await Promise.all([
      claimContinuedAgentTask(seeded),
      claimContinuedAgentTask({ ...seeded, clerkUserId: seeded.asked.clerkUserId }),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: taskId } })).revision).toBe(1);
  });

  it("does not treat an approval wait as a question", async () => {
    const seeded = await seedAnswerable();
    const task = await db.agentTask.findUniqueOrThrow({ where: { id: seeded.task.id } });
    const claim = await claimAgentTask({
      organizationId: seeded.organizationId, taskId: task.id, expectedRevision: task.revision,
    });
    await settleAgentTaskClaim({
      organizationId: seeded.organizationId, taskId: task.id, expectedRevision: task.revision,
      claimToken: claim!.claimToken, requestId: seeded.request.id,
      settlement: {
        status: "waiting_approval",
        proposal: {
          instruction: "Handle this customer's latest request",
          rawToolCalls: [{ id: "tc1", name: "create_refund", input: { order_id: "1" } }],
          sourceRequestIds: [seeded.request.id],
        },
        approver: { kind: "member", key: ANY_MEMBER_ACTOR_KEY },
      },
    });
    expect(await claimContinuedAgentTask(seeded)).toBeNull();
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: task.id } })).status)
      .toBe("waiting_approval");
  });
});

describe("support approval-wait continuation", () => {
  const card = [{ id: "tc1", name: "create_refund", input: { order_id: "1" } }];
  const objective = "Handle this customer's latest request";

  // A support conversation parked on a card, the way the planning job leaves
  // one: the customer initiated it, and the card went to every bound operator.
  async function seedReviseable(options: { scopeToDrafter?: boolean } = {}) {
    const org = await createTestOrg();
    orgIds.push(org.id);
    const customer = await createTestCustomer(org.id, randomUUID());
    const thread = await createTestThread(org.id, customer.id, "email");
    const message = await createTestMessage(thread.id, "This is the wrong size");
    const drafted = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: randomUUID() },
    });
    const revising = await db.orgMember.create({
      data: { organizationId: org.id, clerkUserId: randomUUID() },
    });
    const { request, task } = await acceptCustomerAgentRequest({
      organizationId: org.id, threadId: thread.id, sourceMessageId: message.id,
      objective, budget,
    });
    const claim = await claimAgentTask({
      organizationId: org.id, taskId: task.id, expectedRevision: task.revision,
    });
    const proposalId = randomUUID();
    await settleAgentTaskClaim({
      organizationId: org.id, taskId: task.id, expectedRevision: task.revision,
      claimToken: claim!.claimToken, requestId: request.id,
      settlement: {
        status: "waiting_approval",
        proposal: { proposalId, instruction: objective, rawToolCalls: card, sourceRequestIds: [request.id] },
        approver: {
          kind: "member",
          key: options.scopeToDrafter ? `member:${drafted.id}` : ANY_MEMBER_ACTOR_KEY,
        },
      },
    });
    return {
      organizationId: org.id, threadId: thread.id, clerkUserId: revising.clerkUserId,
      endsWait: "proposal" as const, drafted, revising, request, task, proposalId, message,
    };
  }

  it("lets any bound member end an approval wait and supersede the card they revised", async () => {
    const seeded = await seedReviseable();
    const continued = await claimContinuedAgentTask(seeded);
    expect(continued).toMatchObject({
      taskId: seeded.task.id, requestId: seeded.request.id, expectedRevision: 1,
    });
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: seeded.task.id } })).toMatchObject({
      status: "running", revision: 1, claimToken: continued!.claimToken, activeProposalId: null,
    });
    // The card stops being approvable, which is what keeps a merchant who still
    // has it on another device from running the draft they just replaced.
    const superseded = await db.agentProposal.findUniqueOrThrow({ where: { id: seeded.proposalId } });
    expect(superseded.status).toBe("superseded");
    expect(superseded.decidedAt).not.toBeNull();
    await expect(authorizeAgentProposal({
      organizationId: seeded.organizationId, clerkUserId: seeded.clerkUserId,
      proposalId: seeded.proposalId, instruction: objective, approvedToolCalls: card,
    })).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses guidance from outside the organization", async () => {
    const seeded = await seedReviseable();
    const otherOrg = await createTestOrg();
    orgIds.push(otherOrg.id);
    const outsider = await db.orgMember.create({
      data: { organizationId: otherOrg.id, clerkUserId: randomUUID() },
    });
    await expect(claimContinuedAgentTask({
      ...seeded, clerkUserId: outsider.clerkUserId,
    })).rejects.toBeInstanceOf(ForbiddenError);
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: seeded.task.id } })).status)
      .toBe("waiting_approval");
  });

  it("leaves a card scoped to one member for that member alone", async () => {
    const seeded = await seedReviseable({ scopeToDrafter: true });
    expect(await claimContinuedAgentTask(seeded)).toBeNull();
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: seeded.task.id } })).status)
      .toBe("waiting_approval");
    // The member it was actually shown to still ends it.
    expect(await claimContinuedAgentTask({
      ...seeded, clerkUserId: seeded.drafted.clerkUserId,
    })).toMatchObject({ taskId: seeded.task.id });
  });

  it("does not re-draft a card whose approval already decided it", async () => {
    const seeded = await seedReviseable();
    expect(await authorizeAgentProposal({
      organizationId: seeded.organizationId, clerkUserId: seeded.clerkUserId,
      proposalId: seeded.proposalId, instruction: objective, approvedToolCalls: card,
    })).not.toBeNull();
    // Approval leaves the task `waiting_approval` until the run completes, and
    // does not move its revision, so the proposal's own status is the only thing
    // that stops guidance from claiming a task that is about to execute.
    expect(await claimContinuedAgentTask(seeded)).toBeNull();
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: seeded.task.id } })).toMatchObject({
      status: "waiting_approval", activeProposalId: seeded.proposalId,
    });
    expect((await db.agentProposal.findUniqueOrThrow({ where: { id: seeded.proposalId } })).status)
      .toBe("approved");
  });

  it("does not treat a parked question as a card", async () => {
    const seeded = await seedReviseable();
    const task = await db.agentTask.findUniqueOrThrow({ where: { id: seeded.task.id } });
    const claim = await claimContinuedAgentTask(seeded);
    await settleAgentTaskClaim({
      ...claim!, requestId: claim!.requestId,
      settlement: {
        status: "waiting_input", question: "Which size did they want?",
        answerer: { kind: "member", key: ANY_MEMBER_ACTOR_KEY },
      },
    });
    expect(await claimContinuedAgentTask(seeded)).toBeNull();
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: task.id } })).status)
      .toBe("waiting_input");
  });

  it("claims once when two members revise the same card at the same time", async () => {
    const seeded = await seedReviseable();
    const claims = await Promise.all([
      claimContinuedAgentTask(seeded),
      claimContinuedAgentTask({ ...seeded, clerkUserId: seeded.drafted.clerkUserId }),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: seeded.task.id } })).revision).toBe(1);
  });

  it("supersedes the card when a later customer message advances the task instead", async () => {
    const seeded = await seedReviseable();
    const second = await createTestMessage(seeded.threadId, "Actually, make it the black one");
    const advanced = await acceptCustomerAgentRequest({
      organizationId: seeded.organizationId, threadId: seeded.threadId,
      sourceMessageId: second.id, objective, budget,
    });
    expect(advanced.task.id).toBe(seeded.task.id);
    expect((await db.agentProposal.findUniqueOrThrow({ where: { id: seeded.proposalId } })).status)
      .toBe("superseded");
  });
});
