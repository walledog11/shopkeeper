import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ChannelType, db } from "@shopkeeper/db";
import {
  createTestOrg,
  createTestCustomer,
  createTestThread,
  createTestMessage,
  cleanupTestData,
} from "@shopkeeper/db/test-helpers";
import { buildAgentPlanCacheRecord } from "@/lib/agent/api/plan-cache";
import { AGENT_PLAN_CACHE_VERSION } from "@/lib/agent/plan-cache-shape";
import { resolveAgentSettings } from "@shopkeeper/agent/settings";
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
  instruction = "Handle this",
  orgSettings?: Partial<OrgSettings>,
) {
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

  await db.thread.update({
    where: { id: thread.id },
    data: {
      cachedPlanMessageId: message.id,
      cachedPlan: buildAgentPlanCacheRecord({
        instruction,
        lastCustomerMessageId: message.id,
        settings,
        plan,
      }) as unknown as Parameters<typeof db.thread.update>[0]["data"]["cachedPlan"],
    },
  });

  return { thread, message };
}

describe("POST /api/agent/quick-approve", () => {
  it("executes the current quick reply using only the send_reply tool call", async () => {
    const { thread } = await createThreadWithCachedPlan(quickReplyPlan);

    const res = await POST(new Request("http://localhost:3000/api/agent/quick-approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId: thread.id }),
    }));

    expect(res.status).toBe(200);
    expect(mockExecuteAgentTurn).toHaveBeenCalledWith(expect.objectContaining({
      threadId: thread.id,
      instruction: "Handle this",
      approvedToolCalls: [{ id: "send_1", name: "send_reply", input: { text: "Yes, we ship to the UK." } }],
    }), expect.anything());

    const updatedThread = await db.thread.findUnique({ where: { id: thread.id } });
    expect(updatedThread?.cachedPlan).toBeNull();
    expect(updatedThread?.cachedPlanMessageId).toBeNull();
  });

  it("rejects a stale cached plan", async () => {
    const { thread } = await createThreadWithCachedPlan(quickReplyPlan);
    const newerMessage = await createTestMessage(thread.id, "Actually, what about Canada?");
    await db.message.update({
      where: { id: newerMessage.id },
      data: { sentAt: new Date(Date.now() + 60_000) },
    });

    const res = await POST(new Request("http://localhost:3000/api/agent/quick-approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId: thread.id }),
    }));

    expect(res.status).toBe(400);
    expect(mockExecuteAgentTurn).not.toHaveBeenCalled();
  });

  it("rejects action plans", async () => {
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
      rawToolCalls: [{ id: "refund_1", name: "create_refund", input: { order_id: "gid://shopify/Order/1" } }],
    };
    const { thread } = await createThreadWithCachedPlan(actionPlan);

    const res = await POST(new Request("http://localhost:3000/api/agent/quick-approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId: thread.id }),
    }));

    expect(res.status).toBe(400);
    expect(mockExecuteAgentTurn).not.toHaveBeenCalled();
  });

  it("rejects auto-execute plans (server-side auto-execute runs via plan-internal, not this route)", async () => {
    const plan: AgentPlan = {
      instruction: "Handle this",
      steps: [{
        id: "refund_1",
        tool: "create_refund",
        label: "Issue refund",
        description: "Refund $20",
        category: "action",
        enabled: true,
      }],
      rawToolCalls: [
        { id: "refund_1", name: "create_refund", input: { order_id: "gid://shopify/Order/1", amount: "20.00" } },
      ],
    };
    const { thread } = await createThreadWithCachedPlan(plan, "Handle this", {
      autonomyTier: "trusted",
      autoExecuteEnabled: true,
      maxRefundAmount: 100,
    });

    const res = await POST(new Request("http://localhost:3000/api/agent/quick-approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId: thread.id }),
    }));

    expect(res.status).toBe(400);
    expect(mockExecuteAgentTurn).not.toHaveBeenCalled();
  });

  it("rejects tampered cached plans", async () => {
    const { thread, message } = await createThreadWithCachedPlan(quickReplyPlan);

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
      body: JSON.stringify({ threadId: thread.id }),
    }));

    expect(res.status).toBe(400);
    expect(mockExecuteAgentTurn).not.toHaveBeenCalled();
  });
});
