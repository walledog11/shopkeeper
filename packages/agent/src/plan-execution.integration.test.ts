import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@shopkeeper/db";
import { cleanupTestData, createTestOrg } from "@shopkeeper/db/test-helpers";
import { ConflictError, ForbiddenError } from "./errors.js";
import {
  executeCurrentCachedHomePlan,
  dismissCurrentCachedPlan,
  findFailedToolResult,
  formatApproverId,
  getExecutablePlanToolCalls,
  isAutoExecuteEnabled,
  resolvePlanExecutionLedgerMode,
  supportAttemptSettlement,
  readParkedProposalForThread,
} from "./plan-execution.js";
import { resolveAgentSettings } from "./settings.js";
import { hashInstruction, hashPlan } from "./agent-actions.js";
import { claimCurrentPlanExecution } from "./execution-ledger.js";
import { acceptCustomerAgentRequest, claimAgentTask, settleAgentTaskClaim } from "./task-ledger/index.js";
import { updateThreadStatusMutation } from "./thread-io/db-mutations.js";
import { authorizeAgentProposal } from "./task-approval.js";
import type { AgentResult } from "./agent-context.js";
import type { RawToolCall } from "./types.js";
import {
  makeDeps,
  mutativePlan,
  okResult,
  orgIds,
  seedSupportCardParkedOnTask,
  seedThreadWithPlan,
  threeStepPlan,
} from "./test-fixtures/plan-execution.js";

afterEach(async () => {
  await Promise.all(orgIds.splice(0).map((orgId) => cleanupTestData(orgId)));
  vi.unstubAllEnvs();
});

// Release-owner decision C: closing a conversation stops every task on it that
// is waiting for the merchant, through the authorized-stop row.
describe("closing a conversation", () => {
  const closeThread = (orgId: string, threadId: string) => (
    updateThreadStatusMutation({ status: "closed" }, { orgId, threadId })
  );

  it("cancels a waiting approval and its card can no longer be approved", async () => {
    const support = await seedSupportCardParkedOnTask(2);
    const runAgent = vi.fn(async () => okResult);

    await closeThread(support.org.id, support.thread.id);

    expect(await db.agentTask.findUniqueOrThrow({ where: { id: support.task.id } })).toMatchObject({
      status: "cancelled", activeProposalId: null, failureCode: null,
      cancelledAt: expect.any(Date),
    });
    expect(await db.agentProposal.findUniqueOrThrow({ where: { id: support.cache.planId! } }))
      .toMatchObject({ status: "superseded" });
    await expect(executeCurrentCachedHomePlan({
      orgId: support.org.id,
      threadId: support.thread.id,
      settings: support.settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      approver: { clerkUserId: support.member.clerkUserId, displayName: null },
    }, makeDeps({ runAgent }))).rejects.toBeInstanceOf(ConflictError);
    expect(runAgent).not.toHaveBeenCalled();
  });

  it("cancels a task waiting on a question", async () => {
    const { org, thread, message } = await seedThreadWithPlan();
    const { request, task } = await acceptCustomerAgentRequest({
      organizationId: org.id, threadId: thread.id, sourceMessageId: message.id,
      objective: "Change the shipping address",
      budget: { runtimeVersion: 2, modelCallLimit: 20, activeTimeMsLimit: 120000, spendNanoUsdLimit: 1000000000n },
    });
    const claim = await claimAgentTask({ organizationId: org.id, taskId: task.id, expectedRevision: task.revision });
    expect(await settleAgentTaskClaim({
      organizationId: org.id, taskId: task.id, expectedRevision: task.revision,
      claimToken: claim!.claimToken, requestId: request.id,
      settlement: {
        status: "waiting_input", question: "What is the full postal code?",
        answerer: { kind: "customer", key: `customer:${thread.customerId}` },
      },
    })).toBe(true);

    await closeThread(org.id, thread.id);

    expect(await db.agentTask.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({
      status: "cancelled", pendingQuestion: null, pendingQuestionId: null,
    });
  });

  it("reconciles a waiting task that already reached a provider", async () => {
    const support = await seedSupportCardParkedOnTask(2);
    await db.agentAction.create({ data: {
      organizationId: support.org.id, threadId: support.thread.id, taskId: support.task.id,
      turnId: support.request.id, tool: "create_refund", category: "action", input: {},
      status: "unknown", mode: "human_approved", dispatchState: "submitted",
      submittedAt: new Date(), operationId: randomUUID(), actionIndex: 0,
    } });

    await closeThread(support.org.id, support.thread.id);

    expect(await db.agentTask.findUniqueOrThrow({ where: { id: support.task.id } })).toMatchObject({
      status: "reconciling", failureCode: "cancelled_after_dispatch", cancelledAt: expect.any(Date),
    });
  });

  it("leaves an approved proposal to the execution that owns it", async () => {
    const support = await seedSupportCardParkedOnTask(2);
    const proposal = await db.agentProposal.findUniqueOrThrow({ where: { id: support.cache.planId! } });
    await authorizeAgentProposal({
      organizationId: support.org.id, clerkUserId: support.member.clerkUserId,
      threadId: support.thread.id, proposalId: proposal.id,
      instruction: support.plan.instruction,
      approvedToolCalls: support.plan.rawToolCalls,
      communication: support.plan.communication,
      executionLedgerEnforced: true,
    });

    await closeThread(support.org.id, support.thread.id);

    expect(await db.agentTask.findUniqueOrThrow({ where: { id: support.task.id } })).toMatchObject({
      status: "waiting_approval", activeProposalId: proposal.id, cancelledAt: null,
    });
    expect(await db.agentProposal.findUniqueOrThrow({ where: { id: proposal.id } }))
      .toMatchObject({ status: "approved" });
  });

  it("leaves waiting tasks on other conversations alone", async () => {
    const closing = await seedSupportCardParkedOnTask(2);
    const other = await seedSupportCardParkedOnTask(2);

    await closeThread(closing.org.id, closing.thread.id);

    expect(await db.agentTask.findUniqueOrThrow({ where: { id: other.task.id } }))
      .toMatchObject({ status: "waiting_approval", activeProposalId: other.cache.planId });
  });
});

describe("plan execution helpers", () => {
  it("records a delivered customer question as a wait on that customer", async () => {
    const { org, thread, message, settings } = await seedThreadWithPlan();
    const settlement = await supportAttemptSettlement({
      orgId: org.id,
      threadId: thread.id,
      settings,
      merchantQuestion: null,
      customerQuestion: "What is the full postal code?",
      sourceRequestIds: [message.id],
    });

    expect(settlement).toEqual({
      status: "waiting_input",
      question: "What is the full postal code?",
      answerer: { kind: "customer", key: `customer:${thread.customerId}` },
    });
  });

  it("dismisses only the exact cached plan identity", async () => {
    const { org, thread, cache } = await seedThreadWithPlan();

    await expect(dismissCurrentCachedPlan({
      orgId: org.id,
      threadId: thread.id,
      expectedPlanId: "stale-plan-id",
      clerkUserId: "user_dismisser",
    })).resolves.toBe(false);
    expect((await db.thread.findUnique({ where: { id: thread.id } }))?.cachedPlan).not.toBeNull();

    await expect(dismissCurrentCachedPlan({
      orgId: org.id,
      threadId: thread.id,
      expectedPlanId: cache.planId!,
      clerkUserId: "user_dismisser",
    })).resolves.toBe(true);
    const dismissed = await db.thread.findUnique({ where: { id: thread.id } });
    expect(dismissed?.cachedPlan).toBeNull();
    expect(dismissed?.cachedPlanMessageId).toBeNull();
  });

  it("refuses dismissal after execution has claimed the plan", async () => {
    const { org, thread, message, cache } = await seedThreadWithPlan();
    const claim = await claimCurrentPlanExecution({
      orgId: org.id,
      planId: cache.planId!,
      threadId: thread.id,
      sourceMessageId: message.id,
      planHash: hashPlan(cache.plan),
      instructionHash: hashInstruction(cache.instruction),
      mode: "human_approved",
    });
    expect(claim.claimed).toBe(true);

    await expect(dismissCurrentCachedPlan({
      orgId: org.id,
      threadId: thread.id,
      expectedPlanId: cache.planId!,
      clerkUserId: "user_dismisser",
    })).rejects.toBeInstanceOf(ConflictError);
    expect((await db.thread.findUnique({ where: { id: thread.id } }))?.cachedPlan).not.toBeNull();
  });

  // A dismissal ends the same wait an approval ends, so it has to leave the
  // durable proposal and the cached card saying the same thing. They used to
  // disagree: the card was destroyed and the task stayed `waiting_approval` on a
  // proposal the merchant had already declined, with nothing sweeping it.
  it("ends the durable approval wait when the parked card is dismissed", async () => {
    const support = await seedSupportCardParkedOnTask();

    await expect(dismissCurrentCachedPlan({
      orgId: support.org.id,
      threadId: support.thread.id,
      expectedPlanId: support.cache.planId!,
      clerkUserId: support.member.clerkUserId,
    })).resolves.toBe(true);

    expect((await db.thread.findUnique({ where: { id: support.thread.id } }))?.cachedPlan).toBeNull();
    expect((await db.agentProposal.findUniqueOrThrow({ where: { id: support.cache.planId! } })).status)
      .toBe("rejected");
    expect(await db.agentTask.findUniqueOrThrow({ where: { id: support.task.id } }))
      .toMatchObject({ status: "cancelled", activeProposalId: null });
  });

  it("leaves the draft parked when the proposal refuses the member dismissing it", async () => {
    const support = await seedSupportCardParkedOnTask();
    const otherOrg = await createTestOrg();
    orgIds.push(otherOrg.id);
    const outsider = await db.orgMember.create({
      data: { organizationId: otherOrg.id, clerkUserId: randomUUID() },
    });

    await expect(dismissCurrentCachedPlan({
      orgId: support.org.id,
      threadId: support.thread.id,
      expectedPlanId: support.cache.planId!,
      clerkUserId: outsider.clerkUserId,
    })).rejects.toBeInstanceOf(ForbiddenError);

    // Refused before the draft was destroyed, which is why the two records move
    // in one transaction rather than one after the other.
    expect((await db.thread.findUnique({ where: { id: support.thread.id } }))?.cachedPlan).not.toBeNull();
    expect((await db.agentProposal.findUniqueOrThrow({ where: { id: support.cache.planId! } })).status)
      .toBe("ready");
  });

  it("refuses to dismiss a card whose approval was already recorded", async () => {
    const support = await seedSupportCardParkedOnTask();
    expect(await authorizeAgentProposal({
      organizationId: support.org.id,
      clerkUserId: support.member.clerkUserId,
      proposalId: support.cache.planId!,
      instruction: support.plan.instruction,
      approvedToolCalls: support.plan.rawToolCalls,
      communication: support.plan.communication,
    })).not.toBeNull();

    // No execution row exists yet, so the ledger's own status is the only thing
    // that stops a second device's "no" from clearing a plan about to run.
    await expect(dismissCurrentCachedPlan({
      orgId: support.org.id,
      threadId: support.thread.id,
      expectedPlanId: support.cache.planId!,
      clerkUserId: support.member.clerkUserId,
    })).rejects.toBeInstanceOf(ConflictError);
    expect((await db.thread.findUnique({ where: { id: support.thread.id } }))?.cachedPlan).not.toBeNull();
  });

  it("formats an approver with and without a display name", () => {
    expect(formatApproverId({ clerkUserId: "user_1", displayName: "Ada" })).toBe("user_1:Ada");
    expect(formatApproverId({ clerkUserId: "user_1", displayName: null })).toBe("user_1");
  });

  it("defaults the ledger to enforce and honours only the documented downgrade", () => {
    expect(resolvePlanExecutionLedgerMode("off")).toBe("off");
    expect(resolvePlanExecutionLedgerMode("enforce")).toBe("enforce");
    expect(resolvePlanExecutionLedgerMode(undefined)).toBe("enforce");
    // Legacy rollout values and typos must not disable the durable claim.
    expect(resolvePlanExecutionLedgerMode("shadow")).toBe("enforce");
    expect(resolvePlanExecutionLedgerMode("Off")).toBe("enforce");
    expect(resolvePlanExecutionLedgerMode("disabled")).toBe("enforce");
  });

  it("treats only live auto-execute as enabled", () => {
    expect(isAutoExecuteEnabled(resolveAgentSettings({ autoExecuteMode: "live" }))).toBe(true);
    expect(isAutoExecuteEnabled(resolveAgentSettings({ autoExecuteMode: "off" }))).toBe(false);
  });

  it("keeps only executable tool calls, dropping reads", () => {
    const plan = mutativePlan();
    plan.rawToolCalls.push({ id: "read_1", name: "get_order_by_name", input: { name: "#1024" } });

    expect(getExecutablePlanToolCalls(plan).map((call) => call.id)).toEqual(["note_1", "send_1"]);
  });

  it("finds the first non-success action and nothing when all succeeded", () => {
    expect(findFailedToolResult(okResult)).toBeNull();

    for (const status of ["error", "policy_block", "unknown"] as const) {
      const result: AgentResult = {
        summary: "s",
        actionsPerformed: [
          { tool: "get_order_by_name", result: "ok", status: "success" },
          { tool: "refund_order", result: "provider rejected", status },
        ],
      };
      expect(findFailedToolResult(result)).toEqual({
        tool: "refund_order",
        result: "provider rejected",
        status,
      });
    }
  });
});

describe("readParkedProposalForThread", () => {
  // The snapshot has to hash equal to what the approval surfaces actually send,
  // and every one of them sends the calls the card renders — reads included.
  // Recording the autonomy verdict's executable subset instead made the two
  // hashes permanently different, so a support approval could only ever conflict.
  it("snapshots the bundle the approval surfaces send, not the executable subset", async () => {
    const plan = threeStepPlan();
    const read: RawToolCall = { id: "read_1", name: "get_order_by_name", input: { order_name: "#1024" } };
    plan.rawToolCalls = [read, ...plan.rawToolCalls];
    const { org, thread, settings } = await seedThreadWithPlan({
      plan,
      settings: resolveAgentSettings({ autonomyTier: "guarded", maxRefundAmount: 100 }),
    });

    const snapshot = await readParkedProposalForThread({
      orgId: org.id, threadId: thread.id, settings,
    });
    expect(snapshot?.rawToolCalls.map((call) => call.name)).toEqual(
      plan.rawToolCalls.map((call) => call.name),
    );
    // The invariant the surfaces depend on, stated as they state it.
    expect(hashPlan({ instruction: plan.instruction, steps: [], rawToolCalls: snapshot!.rawToolCalls }))
      .toBe(hashPlan({ instruction: plan.instruction, steps: [], rawToolCalls: plan.rawToolCalls }));
  });
});
