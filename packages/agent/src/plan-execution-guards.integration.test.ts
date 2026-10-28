import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@shopkeeper/db";
import { cleanupTestData } from "@shopkeeper/db/test-helpers";
import { BadRequestError, ConflictError } from "./errors.js";
import { executeCurrentCachedHomePlan, maybeAutoExecuteCurrentCachedHomePlan } from "./plan-execution.js";
import { resolveAgentSettings } from "./settings.js";
import { buildPlanSteps } from "./planner-steps.js";
import { hashInstruction, hashPlan } from "./agent-actions.js";
import type { AgentPlan, RawToolCall } from "./types.js";
import {
  makeDeps,
  mutativePlan,
  noteCall,
  okResult,
  orgIds,
  quickReplyPlan,
  refundCall,
  seedSupportCardParkedOnTask,
  seedThreadWithPlan,
  sendReplyCall,
  unreachableDeps,
} from "./test-fixtures/plan-execution.js";

afterEach(async () => {
  await Promise.all(orgIds.splice(0).map((orgId) => cleanupTestData(orgId)));
  vi.unstubAllEnvs();
});

describe("executeCurrentCachedHomePlan guards", () => {
  it("refuses an invalid plan before any human or automatic execution path", async () => {
    const { org, thread, settings } = await seedThreadWithPlan({
      plan: {
        ...quickReplyPlan(),
        validation: {
          status: "invalid",
          issues: [{
            code: "ungrounded_customer_reply",
            message: "The reply claims work the plan does not perform.",
            toolCallId: "send_1",
            tool: "send_reply",
          }],
        },
      },
    });

    await expect(executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
    }, unreachableDeps())).rejects.toThrow(/invalid and cannot be approved/);

    await expect(maybeAutoExecuteCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      failureRoute: "test",
    }, unreachableDeps())).resolves.toBeNull();
  });

  it("refuses a plan whose kind the route does not allow", async () => {
    const { org, thread, settings } = await seedThreadWithPlan({
      plan: {
        ...quickReplyPlan(),
        signals: [{ code: "order_not_found", severity: "blocking", message: "missing" }],
      },
    });

    await expect(executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "automatic",
      failureRoute: "test",
    }, unreachableDeps())).rejects.toBeInstanceOf(BadRequestError);
  });

  it("refuses to send for a sender still awaiting review", async () => {
    const { org, thread, settings } = await seedThreadWithPlan({ filterStatus: "questionable" });

    await expect(executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "automatic",
      failureRoute: "test",
    }, unreachableDeps())).rejects.toThrow(/Review the sender/);
  });

  it("refuses a plan that is no longer the one the approver reviewed", async () => {
    const { org, thread, settings } = await seedThreadWithPlan();

    await expect(executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      expectedIdentity: { planHash: "a-hash-from-some-older-plan" },
    }, unreachableDeps())).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses duplicate approved steps", async () => {
    const { org, thread, settings } = await seedThreadWithPlan();

    await expect(executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      approvedToolCalls: [sendReplyCall, sendReplyCall],
    }, unreachableDeps())).rejects.toThrow(/duplicate plan steps/);
  });

  it("refuses an approved step whose input was edited after planning", async () => {
    const { org, thread, settings } = await seedThreadWithPlan();

    // Same id and tool, different body — the case the hash guard exists for.
    await expect(executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      approvedToolCalls: [{ ...sendReplyCall, input: { text: "Refund issued, sorry!" } }],
    }, unreachableDeps())).rejects.toThrow(/must come from the current reviewed plan/);
  });

  it("refuses an empty approval rather than running an empty turn", async () => {
    const { org, thread, settings } = await seedThreadWithPlan();

    await expect(executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      approvedToolCalls: [],
    }, unreachableDeps())).rejects.toThrow(/no executable tool calls/);
  });

  it("refuses a read-only subset rather than consuming the reviewed plan", async () => {
    const withRead = quickReplyPlan();
    const read: RawToolCall = { id: "read_1", name: "get_order_by_name", input: { name: "#1024" } };
    withRead.rawToolCalls.unshift(read);
    const { org, thread, settings } = await seedThreadWithPlan({ plan: withRead });

    await expect(executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      approvedToolCalls: [read],
    }, unreachableDeps())).rejects.toThrow(/no executable tool calls/);
  });

  it("requires a revised plan when partial approval keeps the customer send", async () => {
    const { org, thread, settings } = await seedThreadWithPlan({ plan: mutativePlan() });

    await expect(executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      approvedToolCalls: [sendReplyCall],
    }, unreachableDeps())).rejects.toThrow(/revised customer reply/);
  });

  it("refuses merchant approval when any executable tool is statically disabled", async () => {
    const settings = resolveAgentSettings({
      toolsEnabled: { action: true, communication: false, internal: true, read: true },
    });
    const { org, thread } = await seedThreadWithPlan({ settings });
    await expect(executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
    }, unreachableDeps())).rejects.toThrow(/not executable/);
  });
});

// Decision A: a proposal binds the exact customer message and its destination.
describe("exact-draft proposals", () => {
  const cardIdentity = (support: Awaited<ReturnType<typeof seedSupportCardParkedOnTask>>, plan: AgentPlan) => ({
    planId: support.cache.planId!, sourceMessageId: support.message.id,
    planHash: hashPlan(plan), instructionHash: hashInstruction(plan.instruction),
  });

  it("persists the exact draft and its destination as part of the proposal's identity", async () => {
    const support = await seedSupportCardParkedOnTask(2);
    const proposal = await db.agentProposal.findUniqueOrThrow({ where: { id: support.cache.planId! } });

    expect(proposal).toMatchObject({
      communicationMode: "exact_draft",
      communicationDestination: { kind: "thread", id: support.thread.id, channel: "email" },
      approvedDraft: "Your order ships Monday.",
      allowedResultBindings: [],
    });
    expect(proposal.proposalHash).toBe(hashPlan(support.plan));
    expect(proposal.proposalHash).not.toBe(hashPlan({ ...support.plan, communication: undefined }));
  });

  it("refuses a card whose draft is not the one the proposal binds", async () => {
    const support = await seedSupportCardParkedOnTask(2);
    const runAgent = vi.fn(async () => okResult);
    const edited: AgentPlan = {
      ...support.plan,
      communication: { ...support.plan.communication!, draft: "Your order ships Tuesday." } as AgentPlan["communication"],
    };

    await expect(executeCurrentCachedHomePlan({
      orgId: support.org.id,
      threadId: support.thread.id,
      settings: support.settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      approver: { clerkUserId: support.member.clerkUserId, displayName: null },
      expectedIdentity: cardIdentity(support, edited),
    }, makeDeps({ runAgent }))).rejects.toBeInstanceOf(ConflictError);
    expect(runAgent).not.toHaveBeenCalled();
    expect(await db.agentProposal.findUniqueOrThrow({ where: { id: support.cache.planId! } }))
      .toMatchObject({ status: "ready", approverKey: null });
  });

  it("refuses a card whose destination is not the one the proposal binds", async () => {
    const support = await seedSupportCardParkedOnTask(2);
    const runAgent = vi.fn(async () => okResult);
    const exact = support.plan.communication as Extract<AgentPlan["communication"], { mode: "exact_draft" }>;
    const redirected: AgentPlan = {
      ...support.plan,
      communication: { ...exact, destination: { kind: "thread", id: randomUUID(), channel: "email" } },
    };

    await expect(executeCurrentCachedHomePlan({
      orgId: support.org.id,
      threadId: support.thread.id,
      settings: support.settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      approver: { clerkUserId: support.member.clerkUserId, displayName: null },
      expectedIdentity: cardIdentity(support, redirected),
    }, makeDeps({ runAgent }))).rejects.toBeInstanceOf(ConflictError);
    expect(runAgent).not.toHaveBeenCalled();
  });

  it("refuses an approval that drops the approved reply and keeps the writes", async () => {
    const support = await seedSupportCardParkedOnTask(2);
    const runAgent = vi.fn(async () => okResult);

    await expect(executeCurrentCachedHomePlan({
      orgId: support.org.id,
      threadId: support.thread.id,
      settings: support.settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      approver: { clerkUserId: support.member.clerkUserId, displayName: null },
      approvedToolCalls: [noteCall, refundCall],
    }, makeDeps({ runAgent }))).rejects.toBeInstanceOf(ConflictError);
    expect(runAgent).not.toHaveBeenCalled();
    expect(await db.planExecution.count({ where: { organizationId: support.org.id } })).toBe(0);
  });

  it("binds a receipt placeholder into the proposal and hands the executor that exact snapshot", async () => {
    const reply: RawToolCall = { ...sendReplyCall, input: { text: "We refunded {{refund_amount}}." } };
    const authored: AgentPlan = {
      instruction: "Issue the refund and tell the customer",
      steps: buildPlanSteps([refundCall, reply]),
      rawToolCalls: [refundCall, reply],
      routingEvidence: { classifierState: "not_applicable", codes: [] },
      validation: { status: "valid", issues: [] },
    };
    const support = await seedSupportCardParkedOnTask(2, authored);
    const binding = { placeholder: "refund_amount", toolCallId: "refund_1", tool: "create_refund", field: "facts.amount" };
    expect(await db.agentProposal.findUniqueOrThrow({ where: { id: support.cache.planId! } }))
      .toMatchObject({ approvedDraft: "We refunded {{refund_amount}}.", allowedResultBindings: [binding] });
    const runAgent = vi.fn(async () => okResult);

    await executeCurrentCachedHomePlan({
      orgId: support.org.id,
      threadId: support.thread.id,
      settings: support.settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      approver: { clerkUserId: support.member.clerkUserId, displayName: null },
      expectedIdentity: cardIdentity(support, support.plan),
    }, makeDeps({ runAgent }));

    expect(runAgent.mock.calls[0]?.[4].approvedCommunication).toEqual(support.plan.communication);
    expect(runAgent.mock.calls[0]?.[4].approvedCommunication).toMatchObject({ allowedResultBindings: [binding] });
  });

  it("requires regeneration of a legacy reply before approval can send it", async () => {
    const { org, thread, settings } = await seedThreadWithPlan({ plan: mutativePlan() });
    await expect(executeCurrentCachedHomePlan({
      orgId: org.id, threadId: thread.id, settings, executionIntent: "merchant_approved", failureRoute: "test",
    }, unreachableDeps())).rejects.toBeInstanceOf(ConflictError);
  });

  it("sends nothing on a proposal that authorizes no message", async () => {
    const writesOnly: AgentPlan = {
      instruction: "Note the request and issue the refund",
      steps: buildPlanSteps([noteCall, refundCall]),
      rawToolCalls: [noteCall, refundCall],
      routingEvidence: { classifierState: "not_applicable", codes: [] },
      validation: { status: "valid", issues: [] },
    };
    const support = await seedSupportCardParkedOnTask(2, writesOnly);
    const runAgent = vi.fn(async () => okResult);
    expect(support.plan.communication).toEqual({ mode: "none" });
    expect(await db.agentProposal.findUniqueOrThrow({ where: { id: support.cache.planId! } }))
      .toMatchObject({ communicationMode: null, approvedDraft: null });

    await executeCurrentCachedHomePlan({
      orgId: support.org.id,
      threadId: support.thread.id,
      settings: support.settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
      approver: { clerkUserId: support.member.clerkUserId, displayName: null },
      expectedIdentity: cardIdentity(support, support.plan),
    }, makeDeps({ runAgent }));

    expect(runAgent.mock.calls[0]?.[2]).toEqual([noteCall, refundCall]);
  });

  it("refuses a plan that authorizes no message but carries one", async () => {
    const { org, thread, settings } = await seedThreadWithPlan({
      plan: { ...mutativePlan(), communication: { mode: "none" } },
    });

    await expect(executeCurrentCachedHomePlan({
      orgId: org.id,
      threadId: thread.id,
      settings,
      executionIntent: "merchant_approved",
      failureRoute: "test",
    }, unreachableDeps())).rejects.toBeInstanceOf(ConflictError);
  });
});
