import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@shopkeeper/db";
import {
  cleanupTestData,
  createTestCustomer,
  createTestOrg,
  createTestThread,
} from "@shopkeeper/db/test-helpers";
import { executeCurrentCachedHomePlan, maybeAutoExecuteCurrentCachedHomePlan } from "./plan-execution.js";
import { resolveAgentSettings } from "./settings.js";
import { hashInstruction } from "./agent-actions.js";
import { acceptCustomerAgentRequest, claimAgentTask } from "./task-ledger/index.js";
import type { AgentResult } from "./agent-context.js";
import type { AgentPlan, RawToolCall } from "./types.js";
import {
  makeDeps,
  mutativePlan,
  noteCall,
  okResult,
  orgIds,
  quickReplyPlan,
  refundCall,
  seedExecutablePlan,
  seedThreadWithPlan,
  sendReplyCall,
  threeStepPlan,
  unreachableDeps,
} from "./test-fixtures/plan-execution.js";

afterEach(async () => {
  await Promise.all(orgIds.splice(0).map((orgId) => cleanupTestData(orgId)));
  vi.unstubAllEnvs();
});

describe("maybeAutoExecuteCurrentCachedHomePlan", () => {
  it("does nothing when the thread has no cached plan", async () => {
    const org = await createTestOrg();
    orgIds.push(org.id);
    const customer = await createTestCustomer(org.id, `${randomUUID()}@test.com`);
    const thread = await createTestThread(org.id, customer.id, "email");

    const result = await maybeAutoExecuteCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings: resolveAgentSettings(null),
      failureRoute: "test",
    }, unreachableDeps());

    expect(result).toBeNull();
  });

  it("skips a sender the filter is still holding", async () => {
    const { org, thread, settings } = await seedThreadWithPlan({ filterStatus: "questionable" });

    const result = await maybeAutoExecuteCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      failureRoute: "test",
    }, unreachableDeps());

    expect(result).toBeNull();
  });

  it("sends a clean quick reply without consuming merchant attention", async () => {
    const { org, thread, settings, execution } = await seedExecutablePlan({ automatic: true });
    const runAgent = vi.fn(async () => okResult);

    const result = await maybeAutoExecuteCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      failureRoute: "test",
      ...execution,
    }, makeDeps({ runAgent }));

    expect(runAgent).toHaveBeenCalledOnce();
    expect(result?.approvedToolCalls.map((call) => call.id)).toEqual(["send_1"]);
  });

  it("sends a quick reply even when mutative auto-execution is switched off", async () => {
    // Turning on clarifying replies must not be coupled to turning on refunds,
    // and the reverse must hold too.
    const { org, thread, settings, execution } = await seedExecutablePlan({ automatic: true });

    const result = await maybeAutoExecuteCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      failureRoute: "test",
      ...execution,
      allowMutativeAutoExecute: false,
    }, makeDeps());

    expect(result).not.toBeNull();
  });

  it("leaves a needs_review plan for the merchant", async () => {
    // A mutative plan under the default tier classifies as needs_review.
    const settings = resolveAgentSettings(null);
    const { org, thread } = await seedThreadWithPlan({ plan: mutativePlan(), settings });

    const result = await maybeAutoExecuteCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      failureRoute: "test",
    }, unreachableDeps());

    expect(result).toBeNull();
  });

  it("holds an auto-executable plan when the mutative gate is closed", async () => {
    const settings = resolveAgentSettings({ autonomyTier: "trusted", autoExecuteMode: "live" });
    const { org, thread } = await seedThreadWithPlan({ plan: mutativePlan(), settings });

    const result = await maybeAutoExecuteCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      failureRoute: "test",
      allowMutativeAutoExecute: false,
    }, unreachableDeps());

    expect(result).toBeNull();
  });

  it("holds an auto-executable plan when auto-execute is off", async () => {
    const settings = resolveAgentSettings({ autonomyTier: "trusted", autoExecuteMode: "off" });
    const { org, thread } = await seedThreadWithPlan({ plan: mutativePlan(), settings });

    const result = await maybeAutoExecuteCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      failureRoute: "test",
    }, unreachableDeps());

    expect(result).toBeNull();
  });

  it("executes a mutative plan only when the tier and the gate both allow it", async () => {
    const settings = resolveAgentSettings({ autonomyTier: "trusted", autoExecuteMode: "live" });
    const { org, thread, execution } = await seedExecutablePlan({ automatic: true, plan: mutativePlan(), settings });
    const runAgent = vi.fn(async () => okResult);

    const result = await maybeAutoExecuteCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      failureRoute: "test",
      ...execution,
      allowMutativeAutoExecute: true,
    }, makeDeps({ runAgent }));

    expect(runAgent).toHaveBeenCalledOnce();
    expect(result?.approvedToolCalls.map((call) => call.id)).toEqual(["note_1", "send_1"]);
  });
});

describe("bounded failure replan", () => {
  it("replans once after a definite partial failure and completes remaining work", async () => {
    const settings = resolveAgentSettings({ autonomyTier: "trusted", autoExecuteMode: "live" });
    const { org, thread, execution } = await seedExecutablePlan({ automatic: true, plan: threeStepPlan(), settings });
    const partialResult: AgentResult = {
      summary: "Refund failed",
      actionsPerformed: [
        { tool: "add_shopify_customer_note", result: "Noted", status: "success" },
        { tool: "create_refund", result: "Rejected", status: "error" },
      ],
    };
    const runAgent = vi.fn()
      .mockResolvedValueOnce(partialResult)
      .mockResolvedValueOnce(okResult);
    const mockPlanAgent = vi.fn(async () => quickReplyPlan());

    const executed = await executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "automatic",
      failureRoute: "test",
      ...execution,
      allowMutativeAutoExecute: true,
    }, makeDeps({ runAgent, planAgent: mockPlanAgent }));

    expect(runAgent).toHaveBeenCalledTimes(2);
    expect(mockPlanAgent).toHaveBeenCalledOnce();
    expect(mockPlanAgent.mock.calls[0]?.[1]).toContain("A previously approved plan partially failed during execution.");
    expect(executed.execution.status).toBe("committed");
    expect(executed.failureReplanRecovery).toMatchObject({
      context: expect.objectContaining({
        failureTool: "create_refund",
        failureReason: "Rejected",
      }),
    });
    expect(executed.result.actionsPerformed.at(-1)).toMatchObject({ tool: "send_reply", status: "success" });

    const threadAfter = await db.thread.findUniqueOrThrow({ where: { id: thread.id } });
    expect(threadAfter.cachedPlan).toBeNull();
  });

  it("keeps bounded failure-replan execution attributed to the durable task", async () => {
    const settings = resolveAgentSettings({ autonomyTier: "trusted", autoExecuteMode: "live" });
    const { org, thread, message } = await seedThreadWithPlan({ plan: threeStepPlan(), settings });
    const partialResult: AgentResult = {
      summary: "Refund failed",
      actionsPerformed: [
        { tool: "add_shopify_customer_note", result: "Noted", status: "success" },
        { tool: "create_refund", result: "Rejected", status: "error" },
      ],
    };
    const runAgent = vi.fn()
      .mockResolvedValueOnce(partialResult)
      .mockResolvedValueOnce(okResult);
    const { request, task } = await acceptCustomerAgentRequest({
      organizationId: org.id,
      threadId: thread.id,
      sourceMessageId: message.id,
      objective: "Resolve the request",
      budget: {
        runtimeVersion: 2,
        modelCallLimit: 20,
        activeTimeMsLimit: 120000,
        spendNanoUsdLimit: 1000000000n,
      },
    });
    const claim = await claimAgentTask({ organizationId: org.id, taskId: task.id, expectedRevision: task.revision });
    const durableTurn = {
      requestId: request.id, taskId: task.id, runtimeVersion: 2,
      expectedRevision: task.revision, claimToken: claim!.claimToken,
    };

    await executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "automatic",
      failureRoute: "test",
      allowMutativeAutoExecute: true,
      durableTurn,
    }, makeDeps({ runAgent, planAgent: vi.fn(async () => quickReplyPlan()) }));

    expect(runAgent).toHaveBeenCalledTimes(2);
    expect(runAgent.mock.calls[1]?.[4]).toMatchObject({
      turnId: durableTurn.requestId,
    });
    expect(runAgent.mock.calls[1]?.[0]).toMatchObject({
      agentRequestId: durableTurn.requestId,
      agentTaskId: durableTurn.taskId,
    });
  });

  // The dashboard ticket card posts the reviewed tool calls back to /api/agent.
  // The child shares none of them, so the parent's approval envelope must not
  // travel into the child execution.
  it("does not carry explicit merchant approval into a speculative failure replan", async () => {
    const settings = resolveAgentSettings({ autonomyTier: "trusted", autoExecuteMode: "live" });
    const plan = threeStepPlan();
    const { org, thread, execution } = await seedExecutablePlan({ plan, settings });
    const partialResult: AgentResult = {
      summary: "Refund failed",
      actionsPerformed: [
        { tool: "add_shopify_customer_note", result: "Noted", status: "success" },
        { tool: "create_refund", result: "Rejected", status: "error" },
      ],
    };
    const runAgent = vi.fn()
      .mockResolvedValueOnce(partialResult)
      .mockResolvedValueOnce(okResult);
    const mockPlanAgent = vi.fn(async () => quickReplyPlan());

    const executed = await executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      ...execution,
      approvedToolCalls: [noteCall, refundCall, sendReplyCall],
      expectedIdentity: { instructionHash: hashInstruction(plan.instruction) },
      allowMutativeAutoExecute: true,
    }, makeDeps({ runAgent, planAgent: mockPlanAgent }));

    expect(runAgent).toHaveBeenCalledOnce();
    expect(mockPlanAgent).not.toHaveBeenCalled();
    expect(executed.execution.status).toBe("partial");
    expect(executed.failureReplanRecovery).toBeUndefined();

  });

  it("does not reuse quick approval for a speculative failure replan", async () => {
    const settings = resolveAgentSettings({ autonomyTier: "trusted", autoExecuteMode: "live" });
    const { org, thread, execution } = await seedExecutablePlan({ plan: threeStepPlan(), settings });
    const partialResult: AgentResult = {
      summary: "Refund failed",
      actionsPerformed: [
        { tool: "add_shopify_customer_note", result: "Noted", status: "success" },
        { tool: "create_refund", result: "Rejected", status: "error" },
      ],
    };
    const runAgent = vi.fn()
      .mockResolvedValueOnce(partialResult)
      .mockResolvedValueOnce(okResult);
    const mockPlanAgent = vi.fn(async () => quickReplyPlan());

    const executed = await executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      ...execution,
      allowMutativeAutoExecute: true,
    }, makeDeps({ runAgent, planAgent: mockPlanAgent }));

    expect(runAgent).toHaveBeenCalledOnce();
    expect(mockPlanAgent).not.toHaveBeenCalled();
    expect(executed.failureReplanRecovery).toBeUndefined();
  });

  it("reports the approved failure without drafting a child on spent authority", async () => {
    const settings = resolveAgentSettings({ autonomyTier: "guarded", requireApprovalForActions: true });
    const { org, thread, execution } = await seedExecutablePlan({ plan: threeStepPlan(), settings });
    const retryRefund: RawToolCall = {
      id: "child_refund_1",
      name: "create_refund",
      input: { order_id: "gid://shopify/Order/1", amount: "10.00", currency: "USD" },
    };
    const childNeedingApproval: AgentPlan = {
      instruction: "Note the request, issue the refund, and reply",
      steps: [{
        id: retryRefund.id,
        tool: retryRefund.name,
        label: "Refund",
        description: "Retry the refund",
        category: "action",
        enabled: true,
      }],
      rawToolCalls: [retryRefund],
      routingEvidence: { classifierState: "not_applicable", codes: [] },
      validation: { status: "valid", issues: [] },
    };
    const partialResult: AgentResult = {
      summary: "Refund failed",
      actionsPerformed: [
        { tool: "add_shopify_customer_note", result: "Noted", status: "success" },
        { tool: "create_refund", result: "Rejected", status: "error" },
      ],
    };
    const runAgent = vi.fn().mockResolvedValueOnce(partialResult);
    const mockPlanAgent = vi.fn(async () => childNeedingApproval);

    const executed = await executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      ...execution,
      approvedToolCalls: [noteCall, refundCall, sendReplyCall],
    }, makeDeps({ runAgent, planAgent: mockPlanAgent }));

    expect(runAgent).toHaveBeenCalledOnce();
    expect(mockPlanAgent).not.toHaveBeenCalled();
    expect(executed.failureReplanRecovery).toBeUndefined();
    expect(executed.failureReplanAwaitingApproval).toBeUndefined();
    expect(executed.result.actionsPerformed).toHaveLength(2);
    expect((await db.thread.findUniqueOrThrow({ where: { id: thread.id } })).cachedPlan).toBeNull();
  });

  it("does not replan after an unknown provider outcome and escalates the thread", async () => {
    const settings = resolveAgentSettings({ autonomyTier: "trusted", autoExecuteMode: "live" });
    const { org, thread, execution } = await seedExecutablePlan({ automatic: true, plan: threeStepPlan(), settings });
    const unknownResult: AgentResult = {
      summary: "Unknown refund outcome",
      actionsPerformed: [
        { tool: "add_shopify_customer_note", result: "Noted", status: "success" },
        { tool: "create_refund", result: "Unknown", status: "unknown" },
      ],
    };
    const runAgent = vi.fn(async () => unknownResult);
    const mockPlanAgent = vi.fn(async () => quickReplyPlan());

    const executed = await executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "automatic",
      failureRoute: "test",
      ...execution,
      allowMutativeAutoExecute: true,
    }, makeDeps({ runAgent, planAgent: mockPlanAgent }));

    expect(runAgent).toHaveBeenCalledOnce();
    expect(mockPlanAgent).not.toHaveBeenCalled();
    expect(executed.execution.status).toBe("unknown");
    const updated = await db.thread.findUniqueOrThrow({ where: { id: thread.id } });
    expect(updated.escalatedAt).not.toBeNull();
    expect(updated.cachedPlan).toBeNull();
  });

  // The request-outcome write ran ahead of this escalation, uncaught, so a
  // failing analytics UPDATE left an unknown write unescalated.
  it("escalates an unknown outcome when its request-outcome record cannot be written", async () => {
    const settings = resolveAgentSettings({ autonomyTier: "trusted", autoExecuteMode: "live" });
    const { org, thread, execution } = await seedExecutablePlan({ automatic: true, plan: threeStepPlan(), settings });
    const runAgent = vi.fn(async (): Promise<AgentResult> => ({
      summary: "Unknown refund outcome",
      actionsPerformed: [{ tool: "create_refund", result: "Unknown", status: "unknown" }],
    }));
    const outcomeWrite = vi.spyOn(db.requestEpisodeOutcome, "updateMany")
      .mockRejectedValue(new Error("request outcome table unavailable"));

    try {
      const executed = await executeCurrentCachedHomePlan({
        orgId: org.id,
        threadId: thread.id,
        settings,
        executionIntent: "automatic",
        failureRoute: "test",
        ...execution,
        allowMutativeAutoExecute: true,
      }, makeDeps({ runAgent, planAgent: vi.fn(async () => quickReplyPlan()) }));

      expect(outcomeWrite).toHaveBeenCalled();
      expect(executed.execution.status).toBe("unknown");
      const updated = await db.thread.findUniqueOrThrow({ where: { id: thread.id } });
      expect(updated.escalatedAt).not.toBeNull();
    } finally {
      outcomeWrite.mockRestore();
    }
  });
});
