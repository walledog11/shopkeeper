// Plans, deps and seeded threads shared by the plan-execution integration suites.
import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import { db } from "@shopkeeper/db";
import {
  createTestCustomer,
  createTestMessage,
  createTestOrg,
  createTestThread,
} from "@shopkeeper/db/test-helpers";
import { buildAgentPlanCacheRecord, commitThreadPlanCacheIfCurrent } from "../plan-cache.js";
import { supportAttemptSettlement, type PlanExecutionDeps } from "../plan-execution.js";
import { resolveAgentSettings } from "../settings.js";
import { buildPlanSteps } from "../planner-steps.js";
import {
  acceptCustomerAgentRequest,
  claimAgentTask,
  settleAgentTaskClaim,
  ANY_MEMBER_ACTOR_KEY,
} from "../task-ledger/index.js";
import { deriveProposalCommunication } from "../proposal-communication.js";
import type { AgentContext, AgentResult } from "../agent-context.js";
import type { AgentPlan, OrgSettings, RawToolCall } from "../types.js";

export const orgIds: string[] = [];

export const sendReplyCall: RawToolCall = {
  id: "send_1",
  name: "send_reply",
  input: { text: "Your order ships Monday." },
};

export const noteCall: RawToolCall = {
  id: "note_1",
  name: "add_shopify_customer_note",
  input: { customer_id: "gid://shopify/Customer/1", note: "Asked about shipping" },
};

export function quickReplyPlan(): AgentPlan {
  return {
    instruction: "When does my order ship?",
    steps: [{
      id: "send_1",
      tool: "send_reply",
      label: "Reply",
      description: "Answer the shipping question",
      category: "communication",
      enabled: true,
    }],
    rawToolCalls: [sendReplyCall],
    routingEvidence: { classifierState: "not_applicable", codes: [] },
    validation: { status: "valid", issues: [] },
  };
}

export function mutativePlan(): AgentPlan {
  return {
    instruction: "Please note my preference",
    steps: [
      {
        id: "note_1",
        tool: "add_shopify_customer_note",
        label: "Add note",
        description: "Note the request on the customer",
        category: "action",
        enabled: true,
      },
      {
        id: "send_1",
        tool: "send_reply",
        label: "Reply",
        description: "Tell the customer",
        category: "communication",
        enabled: true,
      },
    ],
    rawToolCalls: [noteCall, sendReplyCall],
    routingEvidence: { classifierState: "not_applicable", codes: [] },
    validation: { status: "valid", issues: [] },
  };
}

export const refundCall: RawToolCall = {
  id: "refund_1",
  name: "create_refund",
  input: { order_id: "gid://shopify/Order/1", amount: "10.00", currency: "USD" },
};

export function threeStepPlan(): AgentPlan {
  return {
    instruction: "Note the request, issue the refund, and reply",
    // Derived as the planner derives them, so a card identity built from this
    // plan is the identity a real card carries.
    steps: buildPlanSteps([noteCall, refundCall, sendReplyCall]),
    rawToolCalls: [noteCall, refundCall, sendReplyCall],
    routingEvidence: { classifierState: "not_applicable", codes: [] },
    validation: { status: "valid", issues: [] },
  };
}

export function escalationPlan(): AgentPlan {
  const escalation: RawToolCall = {
    id: "escalate_1",
    name: "escalate_to_human",
    input: { reason: "Needs merchant review." },
  };
  return {
    instruction: "Escalate this request",
    steps: [{
      id: escalation.id,
      tool: escalation.name,
      label: "Escalate",
      description: "Needs merchant review.",
      category: "internal",
      enabled: true,
    }],
    rawToolCalls: [escalation],
  };
}

export const okResult: AgentResult = {
  summary: "Replied to the customer",
  actionsPerformed: [{ tool: "send_reply", result: "sent", status: "success" }],
};

export function makeDeps(overrides: Partial<PlanExecutionDeps> = {}): PlanExecutionDeps {
  return {
    lock: { acquire: async () => ({ release: async () => undefined }) },
    buildContext: async (threadId, orgId) => ({
      orgId,
      orgName: "Test Shop",
      recentMessages: [],
      shopify: null,
      escalate: async () => undefined,
      thread: {
        id: threadId,
        status: "open",
        channelType: "email",
        tag: null,
        aiSummary: null,
        shopifyCustomerId: null,
      },
      customer: { id: "customer", name: null, platformId: "shopper@test.com" },
      openThreadCount: 1,
      recentOrders: [],
      linkedShopifyCustomerName: null,
      kbArticles: [],
    merchantPreferences: [],
    } satisfies AgentContext),
    runAgent: async () => okResult,
    ...overrides,
  };
}

// Deps that fail loudly if execution is reached. Every guard below is only
// meaningful if it refuses *before* a tool call can reach a provider, so the
// stubs assert that rather than quietly returning a result.
export function unreachableDeps(): PlanExecutionDeps {
  return makeDeps({
    runAgent: async () => {
      throw new Error("runAgent must not be reached once a guard has refused the plan");
    },
  });
}

export async function seedThreadWithPlan(options: {
  plan?: AgentPlan;
  settings?: OrgSettings;
  filterStatus?: string;
  /** Plan as runtime v2 does: the communication snapshot derived from its calls. */
  exactDraft?: boolean;
} = {}) {
  const authored = options.plan ?? quickReplyPlan();
  const settings = options.settings ?? resolveAgentSettings(null);
  const org = await createTestOrg();
  orgIds.push(org.id);
  const customer = await createTestCustomer(org.id, `${randomUUID()}@test.com`);
  const thread = await createTestThread(org.id, customer.id, "email");
  const communication = options.exactDraft
    ? deriveProposalCommunication(authored.rawToolCalls, thread)
    : null;
  const plan: AgentPlan = communication ? { ...authored, communication } : authored;
  const message = await createTestMessage(thread.id, plan.instruction);

  if (options.filterStatus) {
    await db.thread.update({
      where: { id: thread.id },
      data: { filterStatus: options.filterStatus },
    });
  }

  const cache = buildAgentPlanCacheRecord({
    instruction: plan.instruction,
    lastCustomerMessageId: message.id,
    settings,
    plan,
  });
  const committed = await commitThreadPlanCacheIfCurrent({
    orgId: org.id,
    threadId: thread.id,
    sourceMessageId: message.id,
    cache,
  });
  expect(committed).toBe(true);

  return { org, thread, message, plan, settings, cache };
}

// A support conversation whose parked card is also a durable proposal: the
// planning job accepts the customer's message, runs an attempt, and settles on
// whatever `supportAttemptSettlement` reads back out of the cached plan.
export async function seedSupportCardParkedOnTask(runtimeVersion = 2, authored: AgentPlan = threeStepPlan()) {
  const settings = resolveAgentSettings({ autonomyTier: "guarded", maxRefundAmount: 100 });
  const seeded = await seedThreadWithPlan({ plan: authored, settings, exactDraft: runtimeVersion >= 2 });
  const plan = seeded.plan;
  const member = await db.orgMember.create({
    data: { organizationId: seeded.org.id, clerkUserId: randomUUID() },
  });
  const { request, task } = await acceptCustomerAgentRequest({
    organizationId: seeded.org.id, threadId: seeded.thread.id, sourceMessageId: seeded.message.id,
    objective: plan.instruction,
    budget: {
      runtimeVersion, modelCallLimit: 20,
      activeTimeMsLimit: 120000, spendNanoUsdLimit: 1000000000n,
    },
  });
  const claim = await claimAgentTask({
    organizationId: seeded.org.id, taskId: task.id, expectedRevision: task.revision,
  });
  const settlement = await supportAttemptSettlement({
    orgId: seeded.org.id, threadId: seeded.thread.id, settings,
    merchantQuestion: null, sourceRequestIds: [request.id],
  });
  expect(settlement.status).toBe("waiting_approval");
  expect(await settleAgentTaskClaim({
    organizationId: seeded.org.id, taskId: task.id, expectedRevision: task.revision,
    claimToken: claim!.claimToken, requestId: request.id, settlement,
  })).toBe(true);
  expect((await db.agentTask.findUniqueOrThrow({ where: { id: task.id } })).activeProposalId)
    .toBe(seeded.cache.planId);
  return { ...seeded, member, task, request };
}

// Exercise execution through the same accepted task/proposal contract as production.
export async function seedExecutablePlan(options: Parameters<typeof seedThreadWithPlan>[0] & { automatic?: boolean } = {}) {
  const seeded = await seedThreadWithPlan({ ...options, exactDraft: true });
  const member = await db.orgMember.create({
    data: { organizationId: seeded.org.id, clerkUserId: randomUUID() },
  });
  const { request, task } = await acceptCustomerAgentRequest({
    organizationId: seeded.org.id, threadId: seeded.thread.id, sourceMessageId: seeded.message.id,
    objective: seeded.plan.instruction,
    budget: { runtimeVersion: 2, modelCallLimit: 20, activeTimeMsLimit: 120000, spendNanoUsdLimit: 1000000000n },
  });
  const claim = await claimAgentTask({ organizationId: seeded.org.id, taskId: task.id, expectedRevision: task.revision });
  expect(claim).not.toBeNull();
  if (!options.automatic) {
    expect(await settleAgentTaskClaim({
      organizationId: seeded.org.id, taskId: task.id, expectedRevision: task.revision,
      claimToken: claim!.claimToken, requestId: request.id,
      settlement: {
        status: "waiting_approval",
        proposal: {
          proposalId: seeded.cache.planId!, instruction: seeded.plan.instruction,
          rawToolCalls: seeded.plan.rawToolCalls, communication: seeded.plan.communication,
          sourceRequestIds: [request.id],
        },
        approver: { kind: "member", key: ANY_MEMBER_ACTOR_KEY },
      },
    })).toBe(true);
  }
  return {
    ...seeded, member, task, request,
    execution: {
      approver: options.automatic ? undefined : { clerkUserId: member.clerkUserId, displayName: null as string | null },
      durableTurn: options.automatic ? {
        requestId: request.id, taskId: task.id, runtimeVersion: 2,
        expectedRevision: task.revision, claimToken: claim!.claimToken,
      } : undefined,
    },
  };
}
