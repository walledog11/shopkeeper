import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@shopkeeper/db";
import { createTestOrg, createTestCustomer, createTestThread, cleanupTestData } from "@shopkeeper/db/test-helpers";
import { ConflictError, ForbiddenError } from "./errors.js";
import {
  ANY_MEMBER_ACTOR_KEY, acceptCustomerAgentRequest, acceptMemberAgentRequest,
  attachMemberAgentTask, cancelMemberAgentTask, claimAgentTask, settleAgentTaskClaim,
} from "./task-ledger.js";
import { authorizeAgentProposal, rejectAgentProposal } from "./task-approval.js";
import {
  claimPlanExecution, completePlanExecution, finalizeReconciledPlanExecution,
  reconcileStaleClaimedPlanExecutions,
} from "./execution-ledger.js";
import { authorizeAgentActionDispatch, beginAgentActionAttempt, hashInstruction, hashPlan } from "./agent-actions.js";

const orgIds: string[] = [];
const budget = { runtimeVersion: 1, modelCallLimit: 20, activeTimeMsLimit: 120000, spendNanoUsdLimit: 1000000000n };
const instruction = "refund the order";
const approvedToolCalls = [{ id: "call-1", name: "create_refund", input: { orderId: "55", amount: "12.00" } }];

async function seed() {
  const org = await createTestOrg();
  orgIds.push(org.id);
  const member = await db.orgMember.create({ data: { organizationId: org.id, clerkUserId: randomUUID() } });
  const customer = await createTestCustomer(org.id, randomUUID());
  const thread = await createTestThread(org.id, customer.id, "operator");
  await db.thread.update({ where: { id: thread.id }, data: { operatorKey: `member:${member.id}` } });
  return {
    organizationId: org.id, clerkUserId: member.clerkUserId, threadId: thread.id,
    dedupeKey: randomUUID(), instruction, member,
  };
}

/** A task parked on a proposal, exactly as the task worker leaves one. */
async function seedWaitingApproval() {
  const input = await seed();
  const { request } = await acceptMemberAgentRequest(input);
  const task = await attachMemberAgentTask({ ...input, requestId: request.id, budget });
  const claim = await claimAgentTask({
    organizationId: input.organizationId, taskId: task.id, expectedRevision: 0,
  });
  const planId = randomUUID();
  await settleAgentTaskClaim({
    organizationId: input.organizationId, taskId: task.id, expectedRevision: 0,
    claimToken: claim!.claimToken, requestId: request.id,
    settlement: { status: "waiting_approval", proposal: {
      proposalId: planId, instruction, rawToolCalls: approvedToolCalls, sourceRequestIds: [request.id],
    } },
  });
  return { input, task, planId };
}

function approval(input: { organizationId: string; clerkUserId: string }, proposalId: string) {
  return { ...input, proposalId, instruction, approvedToolCalls };
}

/**
 * A support task parked on a proposal: the customer initiates it, the thread is
 * a customer conversation with no operator key, and the card is pushed to every
 * bound member, so the wait names them all.
 */
async function seedSupportWaitingApproval() {
  const org = await createTestOrg();
  orgIds.push(org.id);
  const member = await db.orgMember.create({
    data: { organizationId: org.id, clerkUserId: randomUUID() },
  });
  const customer = await createTestCustomer(org.id, randomUUID());
  const thread = await createTestThread(org.id, customer.id, "email");
  const message = await db.message.create({
    data: {
      threadId: thread.id, organizationId: org.id,
      senderType: "customer", contentText: "refund please",
    },
  });
  const { request, task } = await acceptCustomerAgentRequest({
    organizationId: org.id, threadId: thread.id,
    sourceMessageId: message.id, objective: instruction, budget,
  });
  const claim = await claimAgentTask({
    organizationId: org.id, taskId: task.id, expectedRevision: task.revision,
  });
  const planId = randomUUID();
  await settleAgentTaskClaim({
    organizationId: org.id, taskId: task.id, expectedRevision: task.revision,
    claimToken: claim!.claimToken, requestId: request.id,
    settlement: {
      status: "waiting_approval",
      proposal: {
        proposalId: planId, instruction, rawToolCalls: approvedToolCalls,
        sourceRequestIds: [request.id],
      },
      approver: { kind: "member", key: ANY_MEMBER_ACTOR_KEY },
    },
  });
  return {
    input: { organizationId: org.id, clerkUserId: member.clerkUserId },
    organizationId: org.id, taskId: task.id, threadId: thread.id, planId, member,
  };
}

afterEach(async () => {
  for (const id of orgIds.splice(0)) await cleanupTestData(id);
});

describe("shared proposal approval boundary", () => {
  it("makes the parked card's plan the durable proposal an approval names", async () => {
    const { task, planId } = await seedWaitingApproval();
    const stored = await db.agentTask.findUniqueOrThrow({ where: { id: task.id } });
    expect(stored.activeProposalId).toBe(planId);
  });

  it("records the approver from authentication and closes the task only after the run", async () => {
    const { input, task, planId } = await seedWaitingApproval();
    const authorized = await authorizeAgentProposal(approval(input, planId));
    expect(authorized).toMatchObject({
      taskId: task.id, proposalId: planId, taskRevision: 0,
      approverKey: `member:${input.member.id}`,
    });
    const proposal = await db.agentProposal.findUniqueOrThrow({ where: { id: planId } });
    expect(proposal).toMatchObject({
      status: "approved", approverKey: `member:${input.member.id}`,
      approvedHash: proposal.proposalHash,
    });
    expect(proposal.approvedAt).not.toBeNull();
    // Authorizing is not finishing: the task waits until the run succeeded.
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: task.id } })).status)
      .toBe("waiting_approval");

  });

  it("leaves a durable proposal ready when the execution ledger is unavailable", async () => {
    const { input, task, planId } = await seedWaitingApproval();
    await expect(authorizeAgentProposal({
      ...approval(input, planId), executionLedgerEnforced: false,
    })).rejects.toThrow("Durable proposals require the execution ledger");
    expect(await db.agentProposal.findUniqueOrThrow({ where: { id: planId } }))
      .toMatchObject({ status: "ready", approverKey: null });
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: task.id } }))
      .toMatchObject({ status: "waiting_approval", activeProposalId: planId });
  });

  it("binds an approved dispatch to its task and settles execution with the task atomically", async () => {
    const { input, task, planId } = await seedWaitingApproval();
    const authorized = await authorizeAgentProposal(approval(input, planId));
    const identity = {
      orgId: input.organizationId,
      planId,
      planHash: hashPlan({ instruction, rawToolCalls: approvedToolCalls }),
      instructionHash: hashInstruction(instruction),
      taskId: task.id,
      proposalId: planId,
    };
    const execution = await claimPlanExecution(identity);
    expect(execution.claimed).toBe(true);
    const attempt = await beginAgentActionAttempt({
      orgId: input.organizationId,
      mode: "human_approved",
      actionIndex: 0,
      operationId: randomUUID(),
      executionId: execution.execution.id,
      taskAuthority: {
        kind: "approved_proposal",
        taskId: task.id,
        expectedRevision: authorized!.taskRevision,
        proposalId: planId,
        executionId: execution.execution.id,
        executionClaimToken: execution.claimToken!,
      },
      action: { tool: "create_refund", input: { orderId: "55" }, category: "action" },
    });
    await authorizeAgentActionDispatch(attempt);
    await completePlanExecution({
      executionId: execution.execution.id,
      claimToken: execution.claimToken!,
      status: "committed",
    });

    expect(await db.agentAction.findUniqueOrThrow({ where: { id: attempt.id } }))
      .toMatchObject({ taskId: task.id, proposalId: planId, dispatchState: "dispatch_authorized" });
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: task.id } }))
      .toMatchObject({ status: "completed", activeProposalId: null });
    expect(await db.agentProposal.findUniqueOrThrow({ where: { id: planId } }))
      .toMatchObject({ status: "completed" });
  });

  it("moves an uncertain approved execution to reconciliation instead of leaving an approved wait", async () => {
    const { input, task, planId } = await seedWaitingApproval();
    await authorizeAgentProposal(approval(input, planId));
    const execution = await claimPlanExecution({
      orgId: input.organizationId,
      planId,
      planHash: hashPlan({ instruction, rawToolCalls: approvedToolCalls }),
      instructionHash: hashInstruction(instruction),
      taskId: task.id,
      proposalId: planId,
    });
    await completePlanExecution({
      executionId: execution.execution.id,
      claimToken: execution.claimToken!,
      status: "unknown",
      error: "provider outcome unknown",
    });

    expect(await db.agentTask.findUniqueOrThrow({ where: { id: task.id } }))
      .toMatchObject({
        status: "reconciling",
        activeProposalId: null,
        failureCode: "approved_execution_unknown",
      });
  });

  it("keeps a committed outcome when cancellation lands after dispatch", async () => {
    const { input, task, planId } = await seedWaitingApproval();
    const authorized = await authorizeAgentProposal(approval(input, planId));
    const execution = await claimPlanExecution({
      orgId: input.organizationId,
      planId,
      planHash: hashPlan({ instruction, rawToolCalls: approvedToolCalls }),
      instructionHash: hashInstruction(instruction),
      taskId: task.id,
      proposalId: planId,
    });
    const attempt = await beginAgentActionAttempt({
      orgId: input.organizationId,
      mode: "human_approved",
      actionIndex: 0,
      operationId: randomUUID(),
      executionId: execution.execution.id,
      taskAuthority: {
        kind: "approved_proposal",
        taskId: task.id,
        expectedRevision: authorized!.taskRevision,
        proposalId: planId,
        executionId: execution.execution.id,
        executionClaimToken: execution.claimToken!,
      },
      action: { tool: "create_refund", input: { orderId: "55" }, category: "action" },
    });
    await authorizeAgentActionDispatch(attempt);
    await cancelMemberAgentTask({
      organizationId: input.organizationId,
      clerkUserId: input.clerkUserId,
      taskId: task.id,
      expectedRevision: task.revision,
    });

    await completePlanExecution({
      executionId: execution.execution.id,
      claimToken: execution.claimToken!,
      status: "committed",
    });

    expect(await db.planExecution.findUniqueOrThrow({ where: { id: execution.execution.id } }))
      .toMatchObject({ status: "committed" });
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: task.id } }))
      .toMatchObject({ status: "completed", activeProposalId: null, failureCode: null });
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: task.id } })).cancelledAt)
      .not.toBeNull();
    expect(await db.agentProposal.findUniqueOrThrow({ where: { id: planId } }))
      .toMatchObject({ status: "completed" });
  });

  it("recovers a crash between approval execution and task settlement", async () => {
    const { input, task, planId } = await seedWaitingApproval();
    await authorizeAgentProposal(approval(input, planId));
    const execution = await claimPlanExecution({
      orgId: input.organizationId,
      planId,
      planHash: hashPlan({ instruction, rawToolCalls: approvedToolCalls }),
      instructionHash: hashInstruction(instruction),
      taskId: task.id,
      proposalId: planId,
    });
    await db.planExecution.update({
      where: { id: execution.execution.id },
      data: { claimedAt: new Date("2026-01-01T00:00:00.000Z") },
    });

    expect(await reconcileStaleClaimedPlanExecutions(
      new Date("2026-01-02T00:00:00.000Z"),
      "worker_crashed",
    )).toBe(1);
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: task.id } }))
      .toMatchObject({ status: "reconciling", activeProposalId: null });

    await db.agentAction.create({
      data: {
        organizationId: input.organizationId,
        turnId: randomUUID(),
        executionId: execution.execution.id,
        taskId: task.id,
        proposalId: planId,
        tool: "create_refund",
        category: "action",
        input: {},
        status: "success",
        mode: "human_approved",
      },
    });
    expect(await finalizeReconciledPlanExecution(execution.execution.id)).toBe("committed");
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: task.id } }))
      .toMatchObject({ status: "completed", failureCode: null });
  });

  it("still reconciles a stale execution when its linked task is already terminal", async () => {
    const { input, task, planId } = await seedWaitingApproval();
    await authorizeAgentProposal(approval(input, planId));
    const execution = await claimPlanExecution({
      orgId: input.organizationId,
      planId,
      planHash: hashPlan({ instruction, rawToolCalls: approvedToolCalls }),
      instructionHash: hashInstruction(instruction),
      taskId: task.id,
      proposalId: planId,
    });
    await db.planExecution.update({
      where: { id: execution.execution.id },
      data: { claimedAt: new Date("2026-01-01T00:00:00.000Z") },
    });
    await db.agentTask.update({
      where: { id: task.id },
      data: {
        status: "cancelled", cancelledAt: new Date(), activeProposalId: null,
        pendingQuestionId: null, pendingQuestion: null,
        pendingAnswererKind: null, pendingAnswererKey: null,
      },
    });

    expect(await reconcileStaleClaimedPlanExecutions(
      new Date("2026-01-02T00:00:00.000Z"),
      "worker_crashed",
    )).toBe(1);
    expect(await db.planExecution.findUniqueOrThrow({ where: { id: execution.execution.id } }))
      .toMatchObject({ status: "unknown", lastError: "worker_crashed" });
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: task.id } }))
      .toMatchObject({ status: "cancelled" });
  });

  it("refuses to run inputs other than the ones that were approved", async () => {
    const { input, planId } = await seedWaitingApproval();
    await expect(authorizeAgentProposal({
      ...approval(input, planId),
      approvedToolCalls: [{ id: "call-1", name: "create_refund", input: { orderId: "55", amount: "120.00" } }],
    })).rejects.toBeInstanceOf(ConflictError);
    await expect(authorizeAgentProposal({ ...approval(input, planId), instruction: "refund and cancel" }))
      .rejects.toBeInstanceOf(ConflictError);
    expect((await db.agentProposal.findUniqueOrThrow({ where: { id: planId } })).status).toBe("ready");
  });

  it("reorders the same bundle without changing what it authorizes", async () => {
    const { input, planId } = await seedWaitingApproval();
    const authorized = await authorizeAgentProposal({
      ...approval(input, planId),
      approvedToolCalls: [{ name: "create_refund", id: "call-1", input: { amount: "12.00", orderId: "55" } }],
    });
    expect(authorized?.proposalId).toBe(planId);
  });

  it("gives two concurrent approvals one effect and the same reported outcome", async () => {
    const { input, planId } = await seedWaitingApproval();
    const results = await Promise.all(Array.from({ length: 5 }, () =>
      authorizeAgentProposal(approval(input, planId))));
    const approver = `member:${input.member.id}`;
    expect(results.every(result => result?.proposalId === planId && result.approverKey === approver)).toBe(true);
    const proposal = await db.agentProposal.findUniqueOrThrow({ where: { id: planId } });
    expect(proposal.status).toBe("approved");
    expect(proposal.approvedAt).toEqual(proposal.decidedAt);
  });

  it("refuses another tenant, another member, and a member who has been removed", async () => {
    const { input, planId } = await seedWaitingApproval();
    const other = await seed();
    expect(await authorizeAgentProposal(approval(other, planId))).toBeNull();
    const second = await db.orgMember.create({
      data: { organizationId: input.organizationId, clerkUserId: randomUUID() },
    });
    await expect(authorizeAgentProposal(approval({ ...input, clerkUserId: second.clerkUserId }, planId)))
      .rejects.toBeInstanceOf(ForbiddenError);
    await db.orgMember.delete({ where: { id: input.member.id } });
    await expect(authorizeAgentProposal(approval(input, planId)))
      .rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuses a proposal the task has stopped waiting on", async () => {
    const superseded = await seedWaitingApproval();
    await db.agentTask.update({
      where: { id: superseded.task.id }, data: { activeProposalId: null },
    });
    await expect(authorizeAgentProposal(approval(superseded.input, superseded.planId)))
      .rejects.toBeInstanceOf(ConflictError);

    const stopped = await seedWaitingApproval();
    await db.agentTask.update({
      where: { id: stopped.task.id }, data: { cancelledAt: new Date() },
    });
    await expect(authorizeAgentProposal(approval(stopped.input, stopped.planId)))
      .rejects.toBeInstanceOf(ConflictError);
  });

  // A support task is initiated by the customer and approved by any bound member.
  // The boundary used to derive the approver as "the member who initiated the
  // task, on their own operator thread", which is true of no support task, so
  // every one of these approvals was refused and the merchant's card was dead.
  it("lets any bound member approve a support proposal the customer initiated", async () => {
    const support = await seedSupportWaitingApproval();
    const stored = await db.agentProposal.findUniqueOrThrow({ where: { id: support.planId } });
    expect(stored).toMatchObject({
      approverScopeKind: "member", approverScopeKey: ANY_MEMBER_ACTOR_KEY,
    });

    // A second member of the same organization, who asked for none of it.
    const second = await db.orgMember.create({
      data: { organizationId: support.organizationId, clerkUserId: randomUUID() },
    });
    const authorized = await authorizeAgentProposal(
      approval({ organizationId: support.organizationId, clerkUserId: second.clerkUserId }, support.planId),
    );
    expect(authorized).toMatchObject({
      taskId: support.taskId, proposalId: support.planId,
      approverKey: `member:${second.id}`,
    });
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: support.taskId } })).status)
      .toBe("waiting_approval");
  });

  it("still refuses someone who is not a member of the organization at all", async () => {
    const support = await seedSupportWaitingApproval();
    await expect(authorizeAgentProposal(
      approval({ organizationId: support.organizationId, clerkUserId: randomUUID() }, support.planId),
    )).rejects.toBeInstanceOf(ForbiddenError);
    // Another tenant's member names no proposal of this one.
    const other = await seed();
    expect(await authorizeAgentProposal(approval(other, support.planId))).toBeNull();
  });

  it("refuses a formerly bound member whose membership ended during the approval wait", async () => {
    const support = await seedSupportWaitingApproval();
    const formerMember = await db.orgMember.findFirstOrThrow({
      where: {
        organizationId: support.organizationId,
        clerkUserId: support.input.clerkUserId,
      },
    });
    await db.orgMember.delete({ where: { id: formerMember.id } });

    await expect(authorizeAgentProposal(approval(support.input, support.planId)))
      .rejects.toBeInstanceOf(ForbiddenError);
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: support.taskId } }))
      .toMatchObject({ status: "waiting_approval", activeProposalId: support.planId });
    expect(await db.agentProposal.findUniqueOrThrow({ where: { id: support.planId } }))
      .toMatchObject({ status: "ready" });
  });

  it("gives two different members approving one support card a single effect", async () => {
    const support = await seedSupportWaitingApproval();
    const second = await db.orgMember.create({
      data: { organizationId: support.organizationId, clerkUserId: randomUUID() },
    });
    const results = await Promise.all([
      authorizeAgentProposal(approval(support.input, support.planId)),
      authorizeAgentProposal(
        approval({ organizationId: support.organizationId, clerkUserId: second.clerkUserId }, support.planId),
      ),
    ]);
    const approvers = new Set(results.map((result) => result?.approverKey));
    expect(approvers.size).toBe(1);
    const proposal = await db.agentProposal.findUniqueOrThrow({ where: { id: support.planId } });
    expect(proposal.status).toBe("approved");
    expect([...approvers][0]).toBe(proposal.approverKey);
  });

  it("leaves an approval that names no durable proposal to the legacy path", async () => {
    const input = await seed();
    expect(await authorizeAgentProposal(approval(input, randomUUID()))).toBeNull();
    expect(await authorizeAgentProposal({ ...approval(input, randomUUID()), proposalId: undefined })).toBeNull();
    // A plan parked before proposals existed carries an ID no proposal can have.
    expect(await authorizeAgentProposal(approval(input, "plan-a"))).toBeNull();
  });
});

describe("shared proposal rejection boundary", () => {
  // Exactly the three fields the dismissal surfaces pass. Spreading a seed in
  // would hand `requireMemberActorKey` a threadId and make every refusal below
  // pass on its thread check instead of the proposal's recorded scope.
  function reject(input: { organizationId: string; clerkUserId: string }, proposalId: string) {
    return db.$transaction((tx) => rejectAgentProposal(tx, {
      organizationId: input.organizationId, clerkUserId: input.clerkUserId, proposalId,
    }));
  }

  it("ends the approval wait and stops the task when a bound member declines the card", async () => {
    const support = await seedSupportWaitingApproval();
    expect(await reject(support.input, support.planId)).toBe(true);
    const proposal = await db.agentProposal.findUniqueOrThrow({ where: { id: support.planId } });
    expect(proposal.status).toBe("rejected");
    expect(proposal.decidedAt).not.toBeNull();
    const task = await db.agentTask.findUniqueOrThrow({ where: { id: support.taskId } });
    expect(task).toMatchObject({ status: "cancelled", activeProposalId: null });
    expect(task.cancelledAt).not.toBeNull();
    expect(await db.agentRequest.findFirstOrThrow({
      where: {
        organizationId: support.organizationId,
        taskId: support.taskId,
        actorKind: "member",
      },
      orderBy: { acceptedAt: "desc" },
    })).toMatchObject({
      threadId: task.threadId,
      channel: "operator",
      state: "attached",
      normalizedInstruction: "Reject the proposed work",
    });
  });

  it("refuses a member the proposal does not admit", async () => {
    const { input, task, planId } = await seedWaitingApproval();
    const outsider = await db.orgMember.create({
      data: { organizationId: input.organizationId, clerkUserId: randomUUID() },
    });
    // The card was parked for one member on their own operator thread, so a
    // colleague is not who it is waiting on.
    await expect(reject({ ...input, clerkUserId: outsider.clerkUserId }, planId))
      .rejects.toBeInstanceOf(ForbiddenError);
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: task.id } }))
      .toMatchObject({ status: "waiting_approval", activeProposalId: planId });
    expect((await db.agentProposal.findUniqueOrThrow({ where: { id: planId } })).status)
      .toBe("ready");
  });

  it("cannot take back a decision that was already approved", async () => {
    const support = await seedSupportWaitingApproval();
    expect(await authorizeAgentProposal({
      organizationId: support.organizationId, clerkUserId: support.input.clerkUserId,
      proposalId: support.planId, instruction, approvedToolCalls,
    })).not.toBeNull();
    // The execution row is still absent between authorization and the run, so
    // the proposal's own status is what stands between a second device's "no"
    // and a plan that is about to execute.
    await expect(reject(support.input, support.planId)).rejects.toBeInstanceOf(ConflictError);
    expect((await db.agentProposal.findUniqueOrThrow({ where: { id: support.planId } })).status)
      .toBe("approved");
  });

  it("reports the outcome that already stands when one dismissal arrives twice", async () => {
    const support = await seedSupportWaitingApproval();
    expect(await reject(support.input, support.planId)).toBe(true);
    expect(await reject(support.input, support.planId)).toBe(true);
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: support.taskId } })).status)
      .toBe("cancelled");
    expect(await db.agentRequest.count({
      where: {
        organizationId: support.organizationId,
        taskId: support.taskId,
        actorKind: "member",
      },
    })).toBe(1);
  });

  it("leaves a dismissal that names no durable proposal to the legacy path", async () => {
    const input = await seed();
    expect(await reject(input, randomUUID())).toBe(false);
    // A plan parked before proposals existed carries an ID no proposal can have.
    expect(await reject(input, "plan-a")).toBe(false);
  });
});
