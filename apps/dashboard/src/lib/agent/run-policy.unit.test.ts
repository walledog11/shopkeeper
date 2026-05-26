import { describe, expect, it, vi } from "vitest";
import { AGENT_SETTINGS_DEFAULTS } from "./settings";
import type { AgentContext } from "./runner";
import type { OpsAlertCounterClient } from "@/lib/server/ops-alerts";

const {
  mockCreate,
  mockSendReply,
  mockUpdateThreadStatus,
  mockRecordAgentFailure,
  mockGetDailyRefundSpendCents,
  mockIncrementDailyRefundSpendCents,
  mockEscalateToHuman,
} = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockSendReply: vi.fn(),
  mockUpdateThreadStatus: vi.fn(),
  mockRecordAgentFailure: vi.fn().mockResolvedValue({ emitted: false }),
  mockGetDailyRefundSpendCents: vi.fn().mockResolvedValue(0),
  mockIncrementDailyRefundSpendCents: vi.fn().mockResolvedValue(undefined),
  mockEscalateToHuman: vi.fn().mockResolvedValue("__ESCALATED__: ran out of options"),
}));

vi.mock("@/lib/ai/anthropic", () => ({
  anthropic: { messages: { create: mockCreate } },
  buildCachedSystemPrompt: (text: string) => [{ type: "text", text, cache_control: { type: "ephemeral" } }],
}));

vi.mock("@/lib/server/logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@/lib/server/agent-failure-alerts", () => ({
  recordAgentFailure: mockRecordAgentFailure,
}));

vi.mock("@/lib/agent/tools/thread", () => ({
  addInternalNote: vi.fn().mockResolvedValue("Note added."),
  sendReply: mockSendReply,
  sendEmail: vi.fn().mockResolvedValue("Email sent."),
  updateThreadStatus: mockUpdateThreadStatus,
  updateThreadTag: vi.fn().mockResolvedValue("Tag updated."),
  escalateToHuman: mockEscalateToHuman,
  ESCALATION_MARKER: "__ESCALATED__:",
}));

vi.mock("@/lib/server/refund-spend", () => ({
  getDailyRefundSpendCents: mockGetDailyRefundSpendCents,
  incrementDailyRefundSpendCents: mockIncrementDailyRefundSpendCents,
}));

vi.mock("@/lib/agent/spend", () => ({
  enforceSpendCap: vi.fn().mockResolvedValue(undefined),
  recordSpend: vi.fn().mockResolvedValue(undefined),
  getDailySpendNano: vi.fn().mockResolvedValue(0),
}));

vi.mock("@/lib/agent/api/agent-actions", () => ({
  recordAgentActionsBatch: vi.fn().mockResolvedValue(undefined),
  recordAgentAction: vi.fn().mockResolvedValue(undefined),
  hashPlan: vi.fn().mockReturnValue("hash"),
  hashInstruction: vi.fn().mockReturnValue("hash"),
}));

import { runAgent } from "./runner";

function makeCtx(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    orgId: "org_1",
    orgName: "Test Store",
    customer: { id: "customer_1", name: "Jane", platformId: "jane@test.com" },
    recentMessages: [{ senderType: "customer", contentText: "Help me" }],
    openThreadCount: 1,
    shopify: { shop: "test-store.myshopify.com", accessToken: "shpat_test" },
    recentOrders: [],
    kbArticles: [],
    thread: {
      id: "thread_1",
      status: "open",
      channelType: "dashboard_agent",
      tag: "Support",
      aiSummary: null,
      shopifyCustomerId: null,
    },
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

function makeFailureCounterClient(): OpsAlertCounterClient {
  return {
    incr: async () => 1,
    expire: async () => undefined,
  };
}

describe("runAgent policy enforcement", () => {
  it("blocks pre-approved cancellations when cancellations are disabled", async () => {
    const result = await runAgent(
      makeCtx(),
      "Cancel order",
      [{ id: "pre_1", name: "cancel_order", input: { order_id: "123" } }],
      { ...AGENT_SETTINGS_DEFAULTS, blockCancellations: true }
    );

    expect(result.actionsPerformed).toHaveLength(1);
    expect(result.actionsPerformed[0]).toMatchObject({
      tool: "cancel_order",
      result: "Error: order cancellations are disabled by the workspace owner.",
      status: "policy_block",
    });
    expect(result.summary).toBe("Error: order cancellations are disabled by the workspace owner.");
  });

  it("runs mixed non-read tool calls in order", async () => {
    let replyFinished = false;
    mockCreate
      .mockResolvedValueOnce(toolUseBatch())
      .mockResolvedValueOnce(endTurn("All done."));
    mockSendReply.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      replyFinished = true;
      return "Reply sent.";
    });
    mockUpdateThreadStatus.mockImplementation(async () => (
      replyFinished ? "Status updated after reply." : "Status updated before reply."
    ));

    const result = await runAgent(makeCtx({ thread: { ...makeCtx().thread, channelType: "email" } }), "Reply and close");

    expect(result.actionsPerformed.map((action) => action.result)).toEqual([
      "Reply sent.",
      "Status updated after reply.",
    ]);
  });

  it("records tool_result failures for Error: tool results", async () => {
    mockRecordAgentFailure.mockClear();
    mockCreate
      .mockResolvedValueOnce(singleToolUse("send_reply", { text: "Done." }))
      .mockResolvedValueOnce(endTurn("All done."));
    mockSendReply.mockResolvedValueOnce("Error: provider send failed.");

    await runAgent(
      makeCtx({ thread: { ...makeCtx().thread, channelType: "email" } }),
      "Reply",
      undefined,
      AGENT_SETTINGS_DEFAULTS,
      {
        failureRoute: "/api/agent",
        failureCounterClient: makeFailureCounterClient(),
      }
    );

    expect(mockRecordAgentFailure).toHaveBeenCalledWith(expect.objectContaining({
      kind: "tool_result",
      route: "/api/agent",
      orgId: "org_1",
      tool: "send_reply",
    }), expect.any(Object));
  });

  it("records tool_exception failures when a tool throws", async () => {
    mockRecordAgentFailure.mockClear();
    mockCreate
      .mockResolvedValueOnce(singleToolUse("send_reply", { text: "Done." }))
      .mockResolvedValueOnce(endTurn("All done."));
    mockSendReply.mockRejectedValueOnce(new Error("provider timeout"));

    await runAgent(
      makeCtx({ thread: { ...makeCtx().thread, channelType: "email" } }),
      "Reply",
      undefined,
      AGENT_SETTINGS_DEFAULTS,
      {
        failureRoute: "/api/agent",
        failureCounterClient: makeFailureCounterClient(),
      }
    );

    expect(mockRecordAgentFailure).toHaveBeenCalledTimes(1);
    expect(mockRecordAgentFailure).toHaveBeenCalledWith(expect.objectContaining({
      kind: "tool_exception",
      route: "/api/agent",
      orgId: "org_1",
      tool: "send_reply",
    }), expect.any(Object));
  });

  it("records fast-path Error: tool results", async () => {
    mockRecordAgentFailure.mockClear();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ errors: "Shopify unavailable" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    try {
      await runAgent(
        makeCtx(),
        "What is the status on John's order?",
        undefined,
        AGENT_SETTINGS_DEFAULTS,
        {
          failureRoute: "/api/agent/chat",
          failureCounterClient: makeFailureCounterClient(),
        }
      );
    } finally {
      vi.unstubAllGlobals();
    }

    expect(mockRecordAgentFailure).toHaveBeenCalledWith(expect.objectContaining({
      kind: "tool_result",
      route: "/api/agent/chat",
      orgId: "org_1",
      tool: "search_shopify_customers",
    }), expect.any(Object));
  });

  it("blocks a refund when the daily cap is already exhausted", async () => {
    mockGetDailyRefundSpendCents.mockResolvedValueOnce(9000); // $90 already spent

    const result = await runAgent(
      makeCtx(),
      "Refund the order",
      [{ id: "pre_1", name: "create_refund", input: { order_id: "123", amount: "20.00" } }],
      { ...AGENT_SETTINGS_DEFAULTS, dailyRefundCap: 100 }
    );

    expect(result.actionsPerformed).toHaveLength(1);
    expect(result.actionsPerformed[0]).toMatchObject({
      tool: "create_refund",
      result: "Error: daily refund cap of $100 reached; $10.00 remaining today.",
      status: "policy_block",
    });
    expect(mockIncrementDailyRefundSpendCents).not.toHaveBeenCalled();
  });

  it("allows a refund under the daily cap", async () => {
    mockGetDailyRefundSpendCents.mockResolvedValueOnce(2500); // $25 already spent

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
        refund: { transactions: [{ amount: "20.00" }] },
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    try {
      const result = await runAgent(
        makeCtx(),
        "Refund the order",
        [{ id: "pre_1", name: "create_refund", input: { order_id: "123", amount: "20.00" } }],
        { ...AGENT_SETTINGS_DEFAULTS, dailyRefundCap: 100 }
      );

      expect(result.actionsPerformed[0]?.result).toContain("Refund of $20.00 issued successfully");
      expect(mockIncrementDailyRefundSpendCents).toHaveBeenCalledWith("org_1", 2000);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("halts the run loop after escalate_to_human and surfaces the reason in the summary", async () => {
    mockCreate.mockReset();
    mockEscalateToHuman.mockReset();
    mockEscalateToHuman.mockResolvedValueOnce("__ESCALATED__: Customer is asking about wholesale pricing.");
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
      result: "__ESCALATED__: Customer is asking about wholesale pricing.",
      status: "escalated",
    });
  });

  it("halts an approved-plan run when escalate_to_human is in the approved set", async () => {
    mockEscalateToHuman.mockReset();
    mockEscalateToHuman.mockResolvedValueOnce("__ESCALATED__: Shopify is down.");

    const result = await runAgent(
      makeCtx({ thread: { ...makeCtx().thread, channelType: "email" } }),
      "Issue refund",
      [{ id: "pre_1", name: "escalate_to_human", input: { reason: "Shopify is down." } }],
      AGENT_SETTINGS_DEFAULTS,
    );

    expect(result.summary).toBe("Escalated to merchant: Shopify is down.");
  });
});
