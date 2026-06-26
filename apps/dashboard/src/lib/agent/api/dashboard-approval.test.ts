import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChannelType, SenderType, db } from "@shopkeeper/db";
import {
  createTestOrg,
  createTestCustomer,
  createTestThread,
  cleanupTestData,
} from "@shopkeeper/db/test-helpers";
import type { AgentPlan, OrgSettings } from "@/types";

const {
  mockBuildContext,
  mockExecuteAgentTurn,
  mockHashInstructionForLog,
  mockPlanAgent,
} = vi.hoisted(() => ({
  mockBuildContext: vi.fn(),
  mockExecuteAgentTurn: vi.fn(),
  mockHashInstructionForLog: vi.fn(),
  mockPlanAgent: vi.fn(),
}));

vi.mock("@/lib/agent/runner", () => ({
  buildContext: mockBuildContext,
  hashInstructionForLog: mockHashInstructionForLog,
  planAgent: mockPlanAgent,
}));

vi.mock("@/lib/agent/api/execution", () => ({
  executeAgentTurn: mockExecuteAgentTurn,
}));

vi.mock("@/lib/server/logger", () => ({
  default: { info: vi.fn(), error: vi.fn() },
}));

import {
  DASHBOARD_APPROVAL_DISMISS_SUMMARY,
  buildDashboardApprovalSummary,
  buildRevisedDashboardInstruction,
  dismissDashboardPendingApproval,
  getDashboardActionCalls,
  getDashboardApprovalReplyKind,
  planDashboardApproval,
  readDashboardPendingApproval,
  shouldPlanBeforeExecuting,
  type DashboardPendingApproval,
} from "@/lib/agent/api/dashboard-approval";

const settings = {
  requireApprovalForActions: true,
} as OrgSettings;

const createOrderPlan: AgentPlan = {
  instruction: "Create an order",
  steps: [
    {
      id: "create_1",
      tool: "create_shopify_order",
      label: "Create order",
      description: "Create Shopify order",
      category: "action",
      enabled: true,
    },
    {
      id: "send_1",
      tool: "send_reply",
      label: "Send reply",
      description: "Notify customer",
      category: "communication",
      enabled: true,
    },
  ],
  rawToolCalls: [
    {
      id: "search_1",
      name: "search_shopify_products",
      input: { query: "Pencil Half Zip" },
    },
    {
      id: "create_1",
      name: "create_shopify_order",
      input: {
        first_name: "Ada",
        last_name: "Lovelace",
        email: "ada@example.com",
        line_items: [{ variant_id: "var_1", quantity: 2 }],
        address1: "1 Infinite Loop",
        city: "Cupertino",
        province: "CA",
        zip: "95014",
      },
    },
    {
      id: "send_1",
      name: "send_reply",
      input: { text: "Done" },
    },
  ],
  readResults: {
    search_1: JSON.stringify([
      {
        title: "Pencil Half Zip",
        variants: [{ variant_id: "var_1", title: "Large", price: "42.50" }],
      },
    ]),
  },
};

function pendingApproval(overrides: Partial<DashboardPendingApproval> = {}): DashboardPendingApproval {
  return {
    kind: "dashboard_pending_approval",
    version: 1,
    instruction: "Create an order",
    instructionHash: "hash_original",
    summary: "Approval summary",
    plan: createOrderPlan,
    createdAt: "2026-05-21T12:00:00.000Z",
    ...overrides,
  };
}

let org: Awaited<ReturnType<typeof createTestOrg>> | null = null;

beforeEach(() => {
  vi.clearAllMocks();
  mockBuildContext.mockResolvedValue({ messages: [] });
  mockHashInstructionForLog.mockReturnValue("hash_test");
  mockPlanAgent.mockResolvedValue(createOrderPlan);
  mockExecuteAgentTurn.mockResolvedValue({ summary: "Done", actionsPerformed: [] });
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  org = null;
});

describe("dashboard approval helpers", () => {
  it("classifies approval, dismissal, and revision replies", () => {
    expect(getDashboardApprovalReplyKind(" Yes please! ")).toBe("approve");
    expect(getDashboardApprovalReplyKind("never mind")).toBe("dismiss");
    expect(getDashboardApprovalReplyKind("yes, but make it a medium")).toBe("revise");
    expect(getDashboardApprovalReplyKind("change the address first")).toBe("revise");
  });

  it("only plans before execution when approval is enabled and the instruction asks for an action", () => {
    expect(shouldPlanBeforeExecuting("Create the order", settings)).toBe(true);
    expect(shouldPlanBeforeExecuting("What is the order status?", settings)).toBe(false);
    expect(shouldPlanBeforeExecuting("Create the order", {
      ...settings,
      requireApprovalForActions: false,
    })).toBe(false);
    expect(shouldPlanBeforeExecuting("Refund the order", {
      ...settings,
      autonomyTier: "trusted",
      requireApprovalForActions: false,
    })).toBe(true);
  });

  it("filters dashboard approval actions to action-category planned tool calls", () => {
    expect(getDashboardActionCalls(createOrderPlan)).toEqual([
      createOrderPlan.rawToolCalls[1],
    ]);
  });

  it("builds a product-friendly summary for create-order approvals", () => {
    const summary = buildDashboardApprovalSummary(createOrderPlan);

    expect(summary).toContain("- Customer: Ada Lovelace");
    expect(summary).toContain("ada@example.com");
    expect(summary).toContain("- Item: 2× Pencil Half Zip (Large)");
    expect(summary).toContain("- Ship to: 1 Infinite Loop, Cupertino, CA 95014");
    expect(summary).toContain("- Total: $85.00");
    expect(summary).toContain("Reply yes to create it");
  });

  it("reads only current-version pending approvals", () => {
    const approval = pendingApproval();

    expect(readDashboardPendingApproval(approval)).toEqual(approval);
    expect(readDashboardPendingApproval({ ...approval, version: 2 })).toBeNull();
    expect(readDashboardPendingApproval({ ...approval, plan: null })).toBeNull();
    expect(readDashboardPendingApproval(null)).toBeNull();
  });

  it("builds revision instructions from the pending approval and operator changes", () => {
    expect(buildRevisedDashboardInstruction(
      pendingApproval({ instruction: "Create an order for Ada" }),
      "Use size medium instead",
    )).toBe("Original request: Create an order for Ada\nRequested changes before approval: Use size medium instead");
  });

  it("clears and records dashboard dismissals", async () => {
    org = await createTestOrg();
    const customer = await createTestCustomer(org.id, "ada@example.com", { name: "Ada" });
    const thread = await createTestThread(org.id, customer.id, ChannelType.dashboard_agent);
    await db.thread.update({
      where: { id: thread.id },
      data: { cachedPlan: pendingApproval() as object },
    });

    await expect(dismissDashboardPendingApproval(thread.id, "cancel"))
      .resolves.toBe(DASHBOARD_APPROVAL_DISMISS_SUMMARY);

    const refreshed = await db.thread.findUniqueOrThrow({ where: { id: thread.id } });
    expect(refreshed.cachedPlan).toBeNull();
    expect(refreshed.cachedPlanMessageId).toBeNull();

    const messages = await db.message.findMany({
      where: { threadId: thread.id },
      orderBy: { sentAt: "asc" },
    });
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ senderType: SenderType.customer, contentText: "cancel" });
    expect(messages[1]).toMatchObject({
      senderType: SenderType.agent,
      contentText: DASHBOARD_APPROVAL_DISMISS_SUMMARY,
    });
  });

  it("plans, stores, and records pending approvals", async () => {
    org = await createTestOrg();
    const customer = await createTestCustomer(org.id, "ada@example.com", { name: "Ada" });
    const thread = await createTestThread(org.id, customer.id, ChannelType.dashboard_agent);
    mockHashInstructionForLog.mockReturnValue("hash_planned");

    const planned = await planDashboardApproval({
      orgId: org.id,
      threadId: thread.id,
      instruction: "Create an order",
      settings,
    });

    if (!planned || !("approval" in planned)) throw new Error("expected an approval result");
    expect(planned.approval.instructionHash).toBe("hash_planned");
    expect(planned.approval.summary).toContain("Reply yes to create it");
    expect(mockBuildContext).toHaveBeenCalledWith(thread.id, org.id);
    expect(mockPlanAgent).toHaveBeenCalledWith({ messages: [] }, "Create an order", settings);

    const refreshed = await db.thread.findUniqueOrThrow({ where: { id: thread.id } });
    expect(refreshed.cachedPlanMessageId).toBeNull();
    expect(refreshed.cachedPlan).toMatchObject({
      kind: "dashboard_pending_approval",
      instruction: "Create an order",
      instructionHash: "hash_planned",
    });

    const messages = await db.message.findMany({
      where: { threadId: thread.id },
      orderBy: { sentAt: "asc" },
    });
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ senderType: SenderType.customer, contentText: "Create an order" });
    expect(messages[1].senderType).toBe(SenderType.agent);
    expect(messages[1].contentText).toContain("Reply yes to create it");
  });

  it("auto-executes dashboard action plans when the rollout flag and classifier allow it", async () => {
    org = await createTestOrg();
    const customer = await createTestCustomer(org.id, "ada@example.com", { name: "Ada" });
    const thread = await createTestThread(org.id, customer.id, ChannelType.dashboard_agent);
    const refundPlan: AgentPlan = {
      instruction: "Refund Ada",
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
        description: "Tell Ada the refund was issued",
        category: "communication",
        enabled: true,
      }],
      rawToolCalls: [
        { id: "refund_1", name: "create_refund", input: { order_id: "gid://shopify/Order/1", amount: "20.00" } },
        { id: "send_1", name: "send_reply", input: { text: "I've issued the $20 refund." } },
      ],
    };
    mockPlanAgent.mockResolvedValueOnce(refundPlan);
    mockExecuteAgentTurn.mockResolvedValueOnce({
      summary: "Refund issued.",
      actionsPerformed: [{ tool: "create_refund", result: "Refund of $20.00 issued successfully." }],
    });

    const planned = await planDashboardApproval({
      orgId: org.id,
      threadId: thread.id,
      instruction: "Refund Ada",
      settings: {
        ...settings,
        autonomyTier: "trusted",
        autoExecuteMode: "live",
        requireApprovalForActions: false,
        maxRefundAmount: 100,
      },
    });

    expect(planned).toMatchObject({ autoExecuted: true });
    expect(mockExecuteAgentTurn).toHaveBeenCalledWith(expect.objectContaining({
      orgId: org.id,
      threadId: thread.id,
      instruction: "Refund Ada",
      approvedToolCalls: [
        { id: "refund_1", name: "create_refund", input: { order_id: "gid://shopify/Order/1", amount: "20.00" } },
      ],
      auditMode: "auto_executed",
    }));

    const refreshed = await db.thread.findUniqueOrThrow({ where: { id: thread.id } });
    expect(refreshed.cachedPlan).toBeNull();
  });
});
