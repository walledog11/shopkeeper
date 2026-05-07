import { describe, expect, it, vi } from "vitest";
import { AGENT_SETTINGS_DEFAULTS } from "./settings";
import type { AgentContext } from "./runner";
import type { OpsAlertCounterClient } from "@/lib/server/ops-alerts";

const { mockCreate, mockSendReply, mockUpdateThreadStatus, mockRecordAgentFailure } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockSendReply: vi.fn(),
  mockUpdateThreadStatus: vi.fn(),
  mockRecordAgentFailure: vi.fn().mockResolvedValue({ emitted: false }),
}));

vi.mock("@/lib/ai/anthropic", () => ({
  anthropic: { messages: { create: mockCreate } },
}));

vi.mock("@/lib/server/logger", () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
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
}));

import { runAgent } from "./runner";

function makeCtx(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    orgId: "org_1",
    orgName: "Test Store",
    customer: { name: "Jane", platformId: "jane@test.com" },
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

    expect(result.actionsPerformed).toEqual([
      {
        tool: "cancel_order",
        result: "Error: order cancellations are disabled by the workspace owner.",
      },
    ]);
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
});
