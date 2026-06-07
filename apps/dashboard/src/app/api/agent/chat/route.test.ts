import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChannelType, SpendCapError, db, usdToNanoDollars } from "@shopkeeper/db";
import {
  cleanupTestData,
  createTestCustomer,
  createTestOrg,
  createTestThread,
} from "@shopkeeper/db/test-helpers";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  clerkClient: vi.fn(),
}));

const {
  mockBuildContext,
  mockExecuteAgentTurn,
  mockHashInstructionForLog,
  mockPlanAgent,
  mockRecordAgentRouteFailure,
  mockResolveAgentSettings,
  mockRunAgent,
} = vi.hoisted(() => ({
  mockBuildContext: vi.fn().mockResolvedValue({ messages: [] }),
  mockExecuteAgentTurn: vi.fn().mockResolvedValue({
    summary: "Done",
    actionsPerformed: [],
  }),
  mockHashInstructionForLog: vi.fn().mockReturnValue("hash_test"),
  mockPlanAgent: vi.fn(),
  mockRecordAgentRouteFailure: vi.fn().mockResolvedValue(null),
  mockResolveAgentSettings: vi.fn().mockReturnValue({ requireApprovalForActions: false }),
  mockRunAgent: vi.fn().mockResolvedValue({
    summary: "Done",
    actionsPerformed: [],
  }),
}));

vi.mock("@/lib/agent/runner", () => ({
  buildContext: mockBuildContext,
  hashInstructionForLog: mockHashInstructionForLog,
  planAgent: mockPlanAgent,
  runAgent: mockRunAgent,
}));

vi.mock("@/lib/agent/api/execution", () => ({
  executeAgentTurn: mockExecuteAgentTurn,
}));

vi.mock("@shopkeeper/agent/settings", async () => {
  const actual = await vi.importActual<typeof import("@shopkeeper/agent/settings")>("@shopkeeper/agent/settings");
  return {
    ...actual,
    resolveAgentSettings: mockResolveAgentSettings,
  };
});

vi.mock("@/lib/server/agent-failure-alerts", () => ({
  recordAgentRouteFailure: mockRecordAgentRouteFailure,
}));

import { auth } from "@clerk/nextjs/server";
import { POST } from "./route";

let org!: Awaited<ReturnType<typeof createTestOrg>>;

beforeEach(async () => {
  org = await createTestOrg();
  vi.mocked(auth).mockResolvedValue({
    userId: "usr_test",
    orgId: org.clerkOrgId,
  } as ReturnType<typeof auth> extends Promise<infer T> ? T : never);
});

afterEach(async () => {
  await cleanupTestData(org?.id);
  vi.clearAllMocks();
  mockExecuteAgentTurn.mockResolvedValue({
    summary: "Done",
    actionsPerformed: [],
  });
  mockResolveAgentSettings.mockReturnValue({ requireApprovalForActions: false });
  mockHashInstructionForLog.mockReturnValue("hash_test");
});

describe("POST /api/agent/chat", () => {
  it("rejects dashboard sessions owned by another user", async () => {
    const otherCustomer = await createTestCustomer(org.id, "dashboard:usr_other");
    const otherSession = await createTestThread(org.id, otherCustomer.id, ChannelType.dashboard_agent);

    const req = new Request("http://localhost:3000/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction: "Hello", sessionId: otherSession.id }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
    expect(mockRunAgent).not.toHaveBeenCalled();
  });

  it("creates a new session for the authenticated user", async () => {
    const req = new Request("http://localhost:3000/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction: "Help me" }),
    });

    const res = await POST(req);
    const body = await res.json() as { sessionId: string };

    expect(res.status).toBe(200);
    expect(body.sessionId).toBeTruthy();

    const thread = await db.thread.findUnique({ where: { id: body.sessionId } });
    expect(thread?.channelType).toBe("dashboard_agent");
    expect(mockExecuteAgentTurn).toHaveBeenCalledWith(expect.objectContaining({
      orgId: org.id,
      threadId: body.sessionId,
      instruction: "Help me",
      failureRoute: "/api/agent/chat",
    }));
  });

  it("returns an approval prompt and stores the pending action plan when action approval is required", async () => {
    mockResolveAgentSettings.mockReturnValue({ requireApprovalForActions: true });
    mockPlanAgent.mockResolvedValueOnce({
      instruction: "Create an order for Jane",
      steps: [{
        id: "act_1",
        tool: "create_shopify_order",
        label: "Create order",
        description: "Create a Shopify order",
        category: "action",
        enabled: true,
      }],
      rawToolCalls: [{
        id: "act_1",
        name: "create_shopify_order",
        input: {
          first_name: "Jane",
          email: "jane@example.com",
          line_items: [{ variant_id: "gid://shopify/ProductVariant/1", quantity: 1 }],
        },
      }],
    });

    const res = await POST(jsonReq({ instruction: "Create an order for Jane" }));
    const body = await res.json() as { sessionId: string; awaitingApproval?: boolean; summary: string };

    expect(res.status).toBe(200);
    expect(body.awaitingApproval).toBe(true);
    expect(body.summary).toContain("Reply yes to create it");
    expect(mockExecuteAgentTurn).not.toHaveBeenCalled();

    const thread = await db.thread.findUniqueOrThrow({
      where: { id: body.sessionId },
      select: { cachedPlan: true, messages: { select: { senderType: true, contentText: true }, orderBy: { sentAt: "asc" } } },
    });
    expect(thread.cachedPlan).toMatchObject({
      kind: "dashboard_pending_approval",
      instruction: "Create an order for Jane",
      instructionHash: "hash_test",
    });
    expect(thread.messages.map((message) => message.senderType)).toEqual(["customer", "agent"]);
  });

  it("auto-executes planned dashboard actions when trusted rollout is enabled", async () => {
    mockResolveAgentSettings.mockReturnValue({
      autonomyTier: "trusted",
      autoExecuteEnabled: true,
      requireApprovalForActions: false,
      maxRefundAmount: 100,
      dailyRefundCap: null,
      blockCancellations: false,
      blockCustomLineItems: false,
      toolsEnabled: { action: true, communication: true, internal: true, read: true },
    });
    mockPlanAgent.mockResolvedValueOnce({
      instruction: "Refund Jane",
      steps: [{
        id: "refund_1",
        tool: "create_refund",
        label: "Issue refund",
        description: "Refund $20",
        category: "action",
        enabled: true,
      }],
      rawToolCalls: [{
        id: "refund_1",
        name: "create_refund",
        input: { order_id: "gid://shopify/Order/1", amount: "20.00" },
      }],
    });
    mockExecuteAgentTurn.mockResolvedValueOnce({
      summary: "Refund issued.",
      actionsPerformed: [{ tool: "create_refund", result: "Refund of $20.00 issued successfully." }],
    });

    const res = await POST(jsonReq({ instruction: "Refund Jane" }));
    const body = await res.json() as { sessionId: string; autoExecuted?: boolean; summary: string };

    expect(res.status).toBe(200);
    expect(body.autoExecuted).toBe(true);
    expect(body.summary).toBe("Refund issued.");
    expect(mockExecuteAgentTurn).toHaveBeenCalledWith(expect.objectContaining({
      instruction: "Refund Jane",
      approvedToolCalls: [{
        id: "refund_1",
        name: "create_refund",
        input: { order_id: "gid://shopify/Order/1", amount: "20.00" },
      }],
      auditMode: "auto_executed",
    }));

    const thread = await db.thread.findUniqueOrThrow({
      where: { id: body.sessionId },
      select: { cachedPlan: true },
    });
    expect(thread.cachedPlan).toBeNull();
  });

  it("maps spend-cap failures to the public 429 response", async () => {
    mockExecuteAgentTurn.mockRejectedValueOnce(
      new SpendCapError(usdToNanoDollars(25), usdToNanoDollars(25)),
    );

    const res = await POST(jsonReq({ instruction: "Summarize today's tickets" }));
    const body = await res.json() as { code?: string; currentUsd?: number; capUsd?: number };

    expect(res.status).toBe(429);
    expect(body).toMatchObject({ code: "spend_cap_reached", currentUsd: 25, capUsd: 25 });
  });

  it("records route failures for AI execution errors", async () => {
    mockExecuteAgentTurn.mockRejectedValueOnce(new Error("Anthropic unavailable"));

    const res = await POST(jsonReq({ instruction: "Draft a response" }));

    expect(res.status).toBe(500);
    expect(mockRecordAgentRouteFailure).toHaveBeenCalledWith(expect.objectContaining({
      route: "/api/agent/chat",
      orgId: org.id,
      error: expect.any(Error),
    }), expect.objectContaining({
      getCounterClient: expect.any(Function),
      onError: expect.any(Function),
    }));
  });
});

function jsonReq(body: unknown) {
  return new Request("http://localhost:3000/api/agent/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
