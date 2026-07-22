import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AGENT_SETTINGS_DEFAULTS } from "./settings.js";
import { runAgent } from "./run.js";
import type { AgentContext } from "./agent-context.js";

const {
  mockCreate,
  mockSendReply,
  mockUpdateThreadStatus,
  mockRecordToolFailure,
  mockReserveDailyRefundSpend,
  mockCommitDailyRefundSpendReservation,
  mockReleaseDailyRefundSpendReservation,
  mockMarkDailyRefundSpendReservationUnknown,
  mockEscalateToHuman,
  mockRecordAgentActionsBatch,
} = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockSendReply: vi.fn(),
  mockUpdateThreadStatus: vi.fn(),
  mockRecordToolFailure: vi.fn().mockResolvedValue(undefined),
  mockReserveDailyRefundSpend: vi.fn(),
  mockCommitDailyRefundSpendReservation: vi.fn().mockResolvedValue(undefined),
  mockReleaseDailyRefundSpendReservation: vi.fn().mockResolvedValue(undefined),
  mockMarkDailyRefundSpendReservationUnknown: vi.fn().mockResolvedValue(undefined),
  mockEscalateToHuman: vi.fn().mockResolvedValue(undefined),
  mockRecordAgentActionsBatch: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class Anthropic {
    messages = { create: mockCreate };
  },
}));

vi.mock("@shopkeeper/db", () => ({
  reserveDailyRefundSpend: mockReserveDailyRefundSpend,
  commitDailyRefundSpendReservation: mockCommitDailyRefundSpendReservation,
  releaseDailyRefundSpendReservation: mockReleaseDailyRefundSpendReservation,
  markDailyRefundSpendReservationUnknown: mockMarkDailyRefundSpendReservationUnknown,
  recordReturnWatch: vi.fn(),
  db: {
    kbArticle: { findMany: vi.fn().mockResolvedValue([]) },
    kbCitation: { createMany: vi.fn().mockResolvedValue({ count: 0 }) },
  },
}));

vi.mock("./spend.js", () => ({
  enforceSpendCap: vi.fn().mockResolvedValue(undefined),
  recordSpend: vi.fn().mockResolvedValue(undefined),
  getDailySpendNano: vi.fn().mockResolvedValue(0),
}));

vi.mock("./agent-actions.js", () => ({
  recordAgentActionsBatch: mockRecordAgentActionsBatch,
  recordAgentAction: vi.fn().mockResolvedValue(undefined),
  hashPlan: vi.fn().mockReturnValue("hash"),
  hashInstruction: vi.fn().mockReturnValue("hash"),
}));

function makeIo(): NonNullable<AgentContext["io"]> {
  return {
    addInternalNote: vi.fn().mockResolvedValue({ status: "ok", message: "Note added." }),
    sendReply: mockSendReply,
    sendEmail: vi.fn().mockResolvedValue({ status: "ok", message: "Email sent." }),
    updateThreadStatus: mockUpdateThreadStatus,
    updateThreadTag: vi.fn().mockResolvedValue({ status: "ok", message: "Tag updated." }),
  };
}

function makeCtx(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    orgId: "org_1",
    orgName: "Test Store",
    customer: { id: "customer_1", name: "Jane", platformId: "jane@test.com" },
    recentMessages: [{ senderType: "customer", contentText: "Help me" }],
    openThreadCount: 1,
    pastTickets: [],
    shopify: { shop: "test-store.myshopify.com", accessToken: "shpat_test" },
    recentOrders: [],
    linkedShopifyCustomerName: null,
    kbArticles: [],
    thread: {
      id: "thread_1",
      status: "open",
      channelType: "dashboard_agent",
      tag: "Support",
      aiSummary: null,
      shopifyCustomerId: null,
    },
    escalate: mockEscalateToHuman,
    io: makeIo(),
    ...overrides,
  };
}

function toolUseBatch() {
  return {
    stop_reason: "tool_use",
    content: [
      { type: "tool_use", id: "tu_1", name: "send_reply", input: { text: "Done." } },
      { type: "tool_use", id: "tu_2", name: "update_thread_status", input: { status: "closed" } },
    ],
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

function endTurn(text = "Done.") {
  return {
    stop_reason: "end_turn",
    content: [{ type: "text", text }],
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

function singleToolUse(name: string, input: Record<string, unknown>) {
  return {
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id: "tu_1", name, input }],
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

beforeEach(() => {
  mockCreate.mockReset();
  mockSendReply.mockReset();
  mockUpdateThreadStatus.mockReset();
  mockRecordToolFailure.mockReset();
  mockReserveDailyRefundSpend.mockReset();
  mockCommitDailyRefundSpendReservation.mockReset();
  mockReleaseDailyRefundSpendReservation.mockReset();
  mockMarkDailyRefundSpendReservationUnknown.mockReset();
  mockEscalateToHuman.mockReset();
  mockRecordAgentActionsBatch.mockReset();

  mockSendReply.mockResolvedValue({ status: "ok", message: "Reply sent." });
  mockUpdateThreadStatus.mockResolvedValue({ status: "ok", message: "Status updated." });
  mockRecordToolFailure.mockResolvedValue(undefined);
  mockReserveDailyRefundSpend.mockResolvedValue({
    kind: "reserved",
    reservation: { id: "reservation_1", status: "reserved" },
  });
  mockCommitDailyRefundSpendReservation.mockResolvedValue(undefined);
  mockReleaseDailyRefundSpendReservation.mockResolvedValue(undefined);
  mockMarkDailyRefundSpendReservationUnknown.mockResolvedValue(undefined);
  mockEscalateToHuman.mockResolvedValue(undefined);
  mockRecordAgentActionsBatch.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("runAgent policy enforcement", () => {
  it("escalates a pre-approved cancellation when cancellations are disabled", async () => {
    const result = await runAgent(
      makeCtx(),
      "Cancel order",
      [{ id: "pre_1", name: "cancel_order", input: { order_id: "123" } }],
      { ...AGENT_SETTINGS_DEFAULTS, blockCancellations: true },
    );

    expect(mockEscalateToHuman).toHaveBeenCalledWith("order cancellations are disabled by the workspace owner.");
    expect(result.actionsPerformed).toHaveLength(1);
    expect(result.actionsPerformed[0]).toMatchObject({
      tool: "cancel_order",
      status: "escalated",
    });
    expect(result.summary).toBe("Escalated to merchant: order cancellations are disabled by the workspace owner.");
  });

  it("runs mixed non-read tool calls in order", async () => {
    let releaseReply!: () => void;
    let markReplyStarted!: () => void;
    const replyStarted = new Promise<void>((resolve) => {
      markReplyStarted = resolve;
    });
    const replyRelease = new Promise<void>((resolve) => {
      releaseReply = resolve;
    });
    mockCreate
      .mockResolvedValueOnce(toolUseBatch())
      .mockResolvedValueOnce(endTurn("All done."));
    mockSendReply.mockImplementation(async () => {
      markReplyStarted();
      await replyRelease;
      return { status: "ok", message: "Reply sent." };
    });
    mockUpdateThreadStatus.mockResolvedValue({
      status: "ok",
      message: "Status updated after reply.",
    });

    const resultPromise = runAgent(
      makeCtx({ thread: { ...makeCtx().thread, channelType: "email" } }),
      "Reply and close",
    );
    await replyStarted;
    expect(mockUpdateThreadStatus).not.toHaveBeenCalled();
    releaseReply();
    const result = await resultPromise;

    expect(result.actionsPerformed.map((action) => action.result)).toEqual([
      "Reply sent.",
      "Status updated after reply.",
    ]);
  });

  it("records tool_result failures through the injected recorder", async () => {
    mockCreate
      .mockResolvedValueOnce(singleToolUse("send_reply", { text: "Done." }))
      .mockResolvedValueOnce(endTurn("All done."));
    mockSendReply.mockResolvedValueOnce({ status: "error", message: "Error: provider send failed." });

    await runAgent(
      makeCtx({ thread: { ...makeCtx().thread, channelType: "email" } }),
      "Reply",
      undefined,
      AGENT_SETTINGS_DEFAULTS,
      { recordToolFailure: mockRecordToolFailure },
    );

    expect(mockRecordToolFailure).toHaveBeenCalledWith(
      "tool_result",
      "send_reply",
      "Error: provider send failed.",
    );
  });

  it("records tool_exception failures through the injected recorder", async () => {
    mockCreate
      .mockResolvedValueOnce(singleToolUse("send_reply", { text: "Done." }))
      .mockResolvedValueOnce(endTurn("All done."));
    mockSendReply.mockRejectedValueOnce(new Error("provider timeout"));

    await runAgent(
      makeCtx({ thread: { ...makeCtx().thread, channelType: "email" } }),
      "Reply",
      undefined,
      AGENT_SETTINGS_DEFAULTS,
      { recordToolFailure: mockRecordToolFailure },
    );

    expect(mockRecordToolFailure).toHaveBeenCalledTimes(1);
    expect(mockRecordToolFailure).toHaveBeenCalledWith(
      "tool_exception",
      "send_reply",
      "provider timeout",
    );
  });

  it("records failed tool results through the injected recorder", async () => {
    mockCreate
      .mockResolvedValueOnce(singleToolUse("get_shopify_orders", { customer_id: "999" }))
      .mockResolvedValueOnce(endTurn());

    await runAgent(
      makeCtx({ shopify: null }),
      "Look up the customer's orders",
      undefined,
      AGENT_SETTINGS_DEFAULTS,
      { recordToolFailure: mockRecordToolFailure },
    );

    expect(mockRecordToolFailure).toHaveBeenCalledWith(
      "tool_result",
      "get_shopify_orders",
      expect.stringContaining("no Shopify integration connected"),
    );
  });

  it("escalates a refund when the daily cap is already exhausted", async () => {
    mockReserveDailyRefundSpend.mockResolvedValueOnce({
      kind: "blocked",
      spentCents: 9000,
      heldCents: 0,
      remainingCents: 1000,
    });

    const result = await runAgent(
      makeCtx(),
      "Refund the order",
      [{ id: "pre_1", name: "create_refund", input: { order_id: "123", amount: "20.00" } }],
      { ...AGENT_SETTINGS_DEFAULTS, dailyRefundCap: 100 },
    );

    expect(mockEscalateToHuman).toHaveBeenCalledWith("daily goodwill cap of $100 reached (shared across refunds, store credit, and gift cards); $10.00 remaining today.");
    expect(result.actionsPerformed).toHaveLength(1);
    expect(result.actionsPerformed[0]).toMatchObject({
      tool: "create_refund",
      status: "escalated",
    });
    expect(result.summary).toBe("Escalated to merchant: daily goodwill cap of $100 reached (shared across refunds, store credit, and gift cards); $10.00 remaining today.");
    expect(mockCommitDailyRefundSpendReservation).not.toHaveBeenCalled();
  });

  it("escalates an over-cap refund instead of executing it or replying", async () => {
    const result = await runAgent(
      makeCtx(),
      "Refund the order",
      [{ id: "pre_1", name: "create_refund", input: { order_id: "123", amount: "200.00" } }],
      { ...AGENT_SETTINGS_DEFAULTS, maxRefundAmount: 50 },
    );

    expect(mockEscalateToHuman).toHaveBeenCalledWith("refund amount $200.00 exceeds the workspace limit of $50.");
    expect(result.actionsPerformed).toHaveLength(1);
    expect(result.actionsPerformed[0]).toMatchObject({
      tool: "create_refund",
      status: "escalated",
    });
    expect(result.summary).toBe("Escalated to merchant: refund amount $200.00 exceeds the workspace limit of $50.");
    expect(mockReserveDailyRefundSpend).not.toHaveBeenCalled();
  });

  it("escalates an over-cap discount instead of issuing it", async () => {
    const result = await runAgent(
      makeCtx(),
      "Give the customer a discount for the trouble",
      [{ id: "pre_1", name: "issue_discount", input: { percentage: 40 } }],
      { ...AGENT_SETTINGS_DEFAULTS, maxDiscountPercent: 20 },
    );

    expect(mockEscalateToHuman).toHaveBeenCalledWith("discount of 40% exceeds the workspace limit of 20%.");
    expect(result.actionsPerformed).toHaveLength(1);
    expect(result.actionsPerformed[0]).toMatchObject({
      tool: "issue_discount",
      status: "escalated",
    });
    expect(result.summary).toBe("Escalated to merchant: discount of 40% exceeds the workspace limit of 20%.");
  });

  it("allows a refund under the daily cap", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        order: { id: 123, name: "#1001", currency: "USD", line_items: [], total_price: "50.00" },
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        refund: {
          currency: "USD",
          transactions: [{ kind: "suggested_refund", gateway: "manual", parent_id: 1, amount: "20.00", maximum_refundable: "50.00" }],
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          refundCreate: {
            refund: {
              id: "gid://shopify/Refund/1",
              totalRefundedSet: { presentmentMoney: { amount: "20.00" } },
              transactions: { nodes: [{ status: "SUCCESS" }] },
            },
            userErrors: [],
          },
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runAgent(
      makeCtx(),
      "Refund the order",
      [{ id: "pre_1", name: "create_refund", input: { order_id: "123", amount: "20.00" } }],
      { ...AGENT_SETTINGS_DEFAULTS, dailyRefundCap: 100 },
    );

    expect(result.actionsPerformed[0]?.result).toContain("Refund of $20.00 issued successfully");
    expect(mockReserveDailyRefundSpend).toHaveBeenCalledWith(expect.objectContaining({
      orgId: "org_1",
      tool: "create_refund",
      requestedCents: 2000,
      capCents: 10000,
    }));
    expect(mockCommitDailyRefundSpendReservation).toHaveBeenCalledWith("reservation_1", 2000);
  });

  it("does not send a customer confirmation after an unknown refund outcome", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        order: { id: 123, name: "#1001", currency: "USD", line_items: [], total_price: "50.00" },
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        refund: {
          currency: "USD",
          transactions: [{ kind: "suggested_refund", gateway: "manual", parent_id: 1, amount: "20.00", maximum_refundable: "50.00" }],
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          refundCreate: {
            refund: {
              id: "gid://shopify/Refund/1",
              totalRefundedSet: { presentmentMoney: { amount: "20.00" } },
              transactions: { nodes: [{ status: "PENDING" }] },
            },
            userErrors: [],
          },
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await runAgent(
      makeCtx({ thread: { ...makeCtx().thread, channelType: "email" } }),
      "Refund the order and tell the customer",
      [
        { id: "refund_1", name: "create_refund", input: { order_id: "123", amount: "20.00" } },
        { id: "reply_1", name: "send_reply", input: { text: "Your refund was issued." } },
      ],
      AGENT_SETTINGS_DEFAULTS,
      { executionId: "0ecfcf1c-2a07-4caf-956f-77cbaa2fb83a" },
    );

    expect(result.actionsPerformed).toMatchObject([
      { tool: "create_refund", status: "unknown" },
      { tool: "send_reply", status: "unknown" },
    ]);
    expect(result.actionsPerformed[1]?.result).toContain("skipped send_reply");
    expect(mockSendReply).not.toHaveBeenCalled();
    expect(mockCommitDailyRefundSpendReservation).not.toHaveBeenCalled();
    expect(mockMarkDailyRefundSpendReservationUnknown).toHaveBeenCalledWith(
      "reservation_1",
      expect.stringContaining("PENDING"),
    );
  });

  it("halts the run loop after escalate_to_human and surfaces the reason in the summary", async () => {
    mockCreate.mockResolvedValueOnce(singleToolUse("escalate_to_human", { reason: "Customer is asking about wholesale pricing." }));

    const result = await runAgent(
      makeCtx(),
      "Help me with wholesale pricing",
      undefined,
      AGENT_SETTINGS_DEFAULTS,
    );

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(result.summary).toBe("Escalated to merchant: Customer is asking about wholesale pricing.");
    expect(result.actionsPerformed.at(-1)).toMatchObject({
      tool: "escalate_to_human",
      result: "Customer is asking about wholesale pricing.",
      status: "escalated",
    });
  });

  it("halts an approved-plan run when escalate_to_human is in the approved set", async () => {
    const result = await runAgent(
      makeCtx({ thread: { ...makeCtx().thread, channelType: "email" } }),
      "Issue refund",
      [{ id: "pre_1", name: "escalate_to_human", input: { reason: "Shopify is down." } }],
      AGENT_SETTINGS_DEFAULTS,
    );

    expect(result.summary).toBe("Escalated to merchant: Shopify is down.");
  });
});
