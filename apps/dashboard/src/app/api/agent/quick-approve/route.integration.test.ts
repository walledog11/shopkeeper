import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ChannelType, db } from "@shopkeeper/db";
import {
  createTestOrg,
  createTestCustomer,
  createTestThread,
  createTestMessage,
  cleanupTestData,
} from "@shopkeeper/db/test-helpers";
import { buildAgentPlanCacheRecord } from "@shopkeeper/agent/plan-cache";
import { AGENT_PLAN_CACHE_VERSION } from "@shopkeeper/agent/plan-cache-shape";
import { resolveAgentSettings } from "@shopkeeper/agent/settings";
import { acceptCustomerAgentRequest, claimAgentTask, settleAgentTaskClaim } from "@shopkeeper/agent/task-ledger";
import { supportAttemptSettlement } from "@shopkeeper/agent/plan-execution";
import type { AgentPlan, OrgSettings } from "@/types";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

const { mockExecuteAgentTurn } = vi.hoisted(() => ({
  mockExecuteAgentTurn: vi.fn(),
}));

// quick-approve runs the turn through @shopkeeper/agent/plan-execution, which calls
// the package-internal executeAgentTurn — so the mock must target the package
// (Track 4.1), not the dashboard execution shim.
vi.mock("@shopkeeper/agent/turn", () => ({
  executeAgentTurn: mockExecuteAgentTurn,
}));

vi.mock("@/lib/agent/runner", () => ({
  hashInstructionForLog: vi.fn(() => "test-hash"),
  // The turn deps now reference the runner's buildContext/runAgent (Track 4.1);
  // stubbed so the lazy deps builder resolves (never invoked — the turn is mocked).
  buildContext: vi.fn(),
  runAgent: vi.fn(),
}));

import { POST } from "./route";
import { auth } from "@clerk/nextjs/server";

let org!: Awaited<ReturnType<typeof createTestOrg>>;

const quickReplyPlan: AgentPlan = {
  instruction: "Handle this",
  steps: [{
    id: "send_1",
    tool: "send_reply",
    label: "Notify customer",
    description: "Yes, we ship to the UK.",
    category: "communication",
    enabled: true,
  }],
  rawToolCalls: [
    { id: "read_1", name: "search_kb", input: { query: "shipping countries" } },
    { id: "send_1", name: "send_reply", input: { text: "Yes, we ship to the UK." } },
  ],
};

beforeEach(async () => {
  org = await createTestOrg();
  await db.orgMember.create({ data: { organizationId: org.id, clerkUserId: "usr_test" } });
  vi.mocked(auth).mockResolvedValue({ userId: "usr_test", orgId: org.clerkOrgId } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
  mockExecuteAgentTurn.mockResolvedValue({
    summary: "Reply sent.",
    actionsPerformed: [{ tool: "send_reply", result: "Reply sent to customer via email." }],
  });
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  vi.clearAllMocks();
});

async function createThreadWithCachedPlan(
  plan: AgentPlan,
  { orgSettings, parkProposal = true }: {
    orgSettings?: Partial<OrgSettings>;
    /** Production parks one only for a plan awaiting review (`readParkedProposalForThread`). */
    parkProposal?: boolean;
  } = {},
) {
  const instruction = "Handle this";
  if (orgSettings) {
    await db.organization.update({
      where: { id: org.id },
      data: { settings: orgSettings },
    });
  }

  const customer = await createTestCustomer(org.id, `customer-${crypto.randomUUID()}@test.com`);
  const thread = await createTestThread(org.id, customer.id, ChannelType.email);
  const message = await createTestMessage(thread.id, "Do you ship to the UK?");
  const settings = resolveAgentSettings(orgSettings ?? null);
  const reply = plan.rawToolCalls.find((call) => call.name === "send_reply");
  const replyInput = reply?.input as { text?: unknown } | undefined;
  plan = {
    ...plan,
    communication: reply ? {
      mode: "exact_draft", destination: { kind: "thread", id: thread.id, channel: thread.channelType },
      draft: typeof replyInput?.text === "string" ? replyInput.text : "", allowedResultBindings: [],
    } : { mode: "none" },
  };
  const cachedPlan = buildAgentPlanCacheRecord({ instruction, lastCustomerMessageId: message.id, settings, plan });

  await db.thread.update({
    where: { id: thread.id },
    data: {
      cachedPlanMessageId: message.id,
      cachedPlan: cachedPlan as unknown as Parameters<typeof db.thread.update>[0]["data"]["cachedPlan"],
    },
  });

  if (!parkProposal) return { thread, message, planId: cachedPlan.planId };

  const { request, task } = await acceptCustomerAgentRequest({
    organizationId: org.id, threadId: thread.id, sourceMessageId: message.id, objective: instruction,
    budget: { runtimeVersion: 2, modelCallLimit: 20, activeTimeMsLimit: 120000, spendNanoUsdLimit: BigInt(1000000000) },
  });
  const claim = await claimAgentTask({ organizationId: org.id, taskId: task.id, expectedRevision: task.revision });
  if (!claim) throw new Error("Could not claim the approval fixture");
  // Parked the way planning parks it. manualReview is the dashboard draft path,
  // which parks even a plan that could run on its own.
  const settlement = await supportAttemptSettlement({
    orgId: org.id, threadId: thread.id, settings, merchantQuestion: null,
    sourceRequestIds: [request.id], manualReview: true,
  });
  if (settlement.status !== "waiting_approval") throw new Error("The fixture plan parks no proposal");
  await settleAgentTaskClaim({
    organizationId: org.id, taskId: task.id, expectedRevision: task.revision, claimToken: claim.claimToken, requestId: request.id,
    settlement,
  });

  return { thread, message, planId: cachedPlan.planId };
}

describe("POST /api/agent/quick-approve", () => {
  it("rejects an invalid reply-shaped cached plan", async () => {
    const invalidPlan: AgentPlan = {
      ...quickReplyPlan,
      validation: {
        status: "invalid",
        issues: [{ code: "ungrounded_customer_reply", message: "The reply contains an unsupported claim." }],
      },
    };
    const { thread, planId } = await createThreadWithCachedPlan(invalidPlan, { parkProposal: false });

    const res = await POST(new Request("http://localhost:3000/api/agent/quick-approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId: thread.id, planId }),
    }));

    expect(res.status).toBe(400);
    expect(mockExecuteAgentTurn).not.toHaveBeenCalled();
  });

  it("executes the current quick reply as the bundle it parked, reads included", async () => {
    const { thread, planId } = await createThreadWithCachedPlan(quickReplyPlan);

    const res = await POST(new Request("http://localhost:3000/api/agent/quick-approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId: thread.id, planId }),
    }));

    expect(res.status).toBe(200);
    expect(mockExecuteAgentTurn).toHaveBeenCalledWith(expect.objectContaining({
      threadId: thread.id,
      instruction: "Handle this",
      approvedToolCalls: quickReplyPlan.rawToolCalls,
    }), expect.anything());

    const updatedThread = await db.thread.findUnique({ where: { id: thread.id } });
    expect(updatedThread?.cachedPlan).toBeNull();
    expect(updatedThread?.cachedPlanMessageId).toBeNull();
  });

  it("rejects a stale cached plan", async () => {
    const { thread, planId } = await createThreadWithCachedPlan(quickReplyPlan);
    const newerMessage = await createTestMessage(thread.id, "Actually, what about Canada?");
    await db.message.update({
      where: { id: newerMessage.id },
      data: { sentAt: new Date(Date.now() + 60_000) },
    });

    const res = await POST(new Request("http://localhost:3000/api/agent/quick-approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId: thread.id, planId }),
    }));

    expect(res.status).toBe(409);
    expect(mockExecuteAgentTurn).not.toHaveBeenCalled();
  });

  it("executes an action plan as a human-approved one-tap approval", async () => {
    const actionPlan: AgentPlan = {
      instruction: "Handle this",
      steps: [{
        id: "refund_1",
        tool: "create_refund",
        label: "Issue refund",
        description: "Refund order",
        category: "action",
        enabled: true,
      }],
      rawToolCalls: [{
        id: "refund_1",
        name: "create_refund",
        input: { order_id: "gid://shopify/Order/1", amount: "20.00" },
      }],
    };
    const { thread, planId } = await createThreadWithCachedPlan(actionPlan);

    const res = await POST(new Request("http://localhost:3000/api/agent/quick-approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId: thread.id, planId }),
    }));

    expect(res.status).toBe(200);
    expect(mockExecuteAgentTurn).toHaveBeenCalledWith(expect.objectContaining({
      threadId: thread.id,
      approvedToolCalls: [{
        id: "refund_1",
        name: "create_refund",
        input: { order_id: "gid://shopify/Order/1", amount: "20.00" },
      }],
      auditMode: "human_approved",
    }), expect.anything());
  });

  it("executes an auto_execute verdict when the merchant explicitly approves it", async () => {
    const plan: AgentPlan = {
      instruction: "Handle this",
      steps: [{
        id: "refund_1",
        tool: "create_refund",
        label: "Issue refund",
        description: "Refund $20",
        category: "action",
        enabled: true,
      }, {
        id: "send_1",
        tool: "send_reply",
        label: "Notify customer",
        description: "Tell the customer the refund was issued",
        category: "communication",
        enabled: true,
      }],
      rawToolCalls: [
        { id: "refund_1", name: "create_refund", input: { order_id: "gid://shopify/Order/1", amount: "20.00" } },
        { id: "send_1", name: "send_reply", input: { text: "I've issued the $20 refund." } },
      ],
    };
    const { thread, planId } = await createThreadWithCachedPlan(plan, {
      orgSettings: {
        autonomyTier: "trusted",
        autoExecuteMode: "live",
        maxRefundAmount: 100,
      },
    });

    const res = await POST(new Request("http://localhost:3000/api/agent/quick-approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId: thread.id, planId }),
    }));

    expect(res.status).toBe(200);
    expect(mockExecuteAgentTurn).toHaveBeenCalledWith(expect.objectContaining({
      threadId: thread.id,
      approvedToolCalls: plan.rawToolCalls,
      auditMode: "human_approved",
    }), expect.anything());
  });

  it("rejects tampered cached plans", async () => {
    const { thread, message, planId } = await createThreadWithCachedPlan(quickReplyPlan, { parkProposal: false });

    await db.thread.update({
      where: { id: thread.id },
      data: {
        cachedPlanMessageId: message.id,
        cachedPlan: {
          version: AGENT_PLAN_CACHE_VERSION,
          instruction: "Handle this",
          lastCustomerMessageId: message.id,
          settingsFingerprint: "not-checked-because-plan-is-invalid",
          plan: { instruction: "Handle this", steps: [] },
        },
      },
    });

    const res = await POST(new Request("http://localhost:3000/api/agent/quick-approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId: thread.id, planId }),
    }));

    expect(res.status).toBe(400);
    expect(mockExecuteAgentTurn).not.toHaveBeenCalled();
  });

  it("rejects quick approve for questionable senders", async () => {
    const { thread, planId } = await createThreadWithCachedPlan(quickReplyPlan);

    await db.thread.update({
      where: { id: thread.id },
      data: { filterStatus: "questionable", filterReason: "Unknown domain" },
    });

    const res = await POST(new Request("http://localhost:3000/api/agent/quick-approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId: thread.id, planId }),
    }));

    expect(res.status).toBe(400);
    expect(mockExecuteAgentTurn).not.toHaveBeenCalled();
  });

  it("rejects a planId that is not the current plan", async () => {
    const { thread } = await createThreadWithCachedPlan(quickReplyPlan);

    const res = await POST(new Request("http://localhost:3000/api/agent/quick-approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId: thread.id, planId: crypto.randomUUID() }),
    }));

    expect(res.status).toBe(409);
    expect(mockExecuteAgentTurn).not.toHaveBeenCalled();
  });

  it("executes when the planId matches the current plan", async () => {
    const { thread, planId } = await createThreadWithCachedPlan(quickReplyPlan);

    const res = await POST(new Request("http://localhost:3000/api/agent/quick-approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId: thread.id, planId }),
    }));

    expect(res.status).toBe(200);
    expect(mockExecuteAgentTurn).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: thread.id }),
      expect.anything(),
    );
  });

  // Without the planId of the card the merchant saw, the route would execute
  // whatever is cached on the thread now — possibly a plan they never saw.
  it("rejects a missing planId before execution", async () => {
    const { thread } = await createThreadWithCachedPlan(quickReplyPlan);

    const res = await POST(new Request("http://localhost:3000/api/agent/quick-approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId: thread.id }),
    }));

    expect(res.status).toBe(400);
    expect(mockExecuteAgentTurn).not.toHaveBeenCalled();
  });

  it("rejects a non-string planId before execution", async () => {
    const { thread } = await createThreadWithCachedPlan(quickReplyPlan);

    const res = await POST(new Request("http://localhost:3000/api/agent/quick-approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId: thread.id, planId: 123 }),
    }));

    expect(res.status).toBe(400);
    expect(mockExecuteAgentTurn).not.toHaveBeenCalled();
  });

  it("treats a whitespace planId as a mismatch, not a malformed field", async () => {
    const { thread } = await createThreadWithCachedPlan(quickReplyPlan);

    const res = await POST(new Request("http://localhost:3000/api/agent/quick-approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId: thread.id, planId: "   " }),
    }));

    // The local requireNonEmptyString in lib/agent/api/validation.ts checks
    // length only, while the shared one in lib/api/validation.ts checks trim().
    // So whitespace survives validation and fails the identity check instead.
    // Asserted as-is so that unifying the two helpers shows up as a test change.
    expect(res.status).toBe(409);
    expect(mockExecuteAgentTurn).not.toHaveBeenCalled();
  });
});
