import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installAgentLogger, resetAgentLoggerForTests, type AgentLogger } from "./logger.js";
import { planAgent } from "./planner.js";
import { REPLAN_INCLUDE_REPLY_PROMPT } from "./planner-tools.js";
import type { AgentContext } from "./agent-context.js";
import { AGENT_SETTINGS_DEFAULTS } from "./settings.js";

const {
  mockCreate,
  mockEnforceSpendCap,
  mockRecordSpend,
  mockExecutePlanningReadTools,
} = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockEnforceSpendCap: vi.fn().mockResolvedValue(undefined),
  mockRecordSpend: vi.fn().mockResolvedValue(undefined),
  mockExecutePlanningReadTools: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class Anthropic {
    messages = { create: mockCreate };
  },
}));

vi.mock("./spend.js", () => ({
  enforceSpendCap: mockEnforceSpendCap,
  recordSpend: mockRecordSpend,
  getDailySpendNano: vi.fn().mockResolvedValue(0),
}));

vi.mock("./planner-read-tools.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./planner-read-tools.js")>();
  return {
    ...actual,
    executePlanningReadTools: mockExecutePlanningReadTools,
  };
});

function makeLogger(): AgentLogger {
  return {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
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
      channelType: "email",
      tag: "Support",
      aiSummary: null,
      shopifyCustomerId: "shopify_customer_1",
    },
    escalate: vi.fn().mockResolvedValue(undefined),
    io: {
      addInternalNote: vi.fn(),
      sendReply: vi.fn(),
      sendEmail: vi.fn(),
      updateThreadStatus: vi.fn(),
      updateThreadTag: vi.fn(),
    },
    ...overrides,
  };
}

function singleToolUse(name: string, input: Record<string, unknown>, id = "tu_1") {
  return {
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id, name, input }],
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

function completeLogPayload(logger: AgentLogger) {
  const call = logger.info.mock.calls.find(([, message]) => message === "[agent:plan] complete");
  expect(call).toBeDefined();
  return call![0] as {
    planPath: string;
    modelCalls: number;
    replanRetried?: boolean;
    replyDrafted?: boolean;
  };
}

beforeEach(() => {
  mockCreate.mockReset();
  mockEnforceSpendCap.mockResolvedValue(undefined);
  mockRecordSpend.mockResolvedValue(undefined);
  mockExecutePlanningReadTools.mockImplementation(async ({ readBlocks }) => ({
    readToolCalls: readBlocks.map((block: { name: string }) => block.name),
    readResultsMap: new Map(readBlocks.map((block: { id: string }) => [block.id, "Read result"])),
    readStatusMap: new Map(readBlocks.map((block: { id: string }) => [block.id, "ok"])),
  }));
});

afterEach(() => {
  resetAgentLoggerForTests();
  vi.clearAllMocks();
});

describe("planAgent logging", () => {
  it("uses the injected logger for planner lifecycle logs", async () => {
    const injectedLogger = makeLogger();
    installAgentLogger(injectedLogger);
    mockCreate.mockResolvedValueOnce({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "No action needed." }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    await planAgent(makeCtx({ thread: { ...makeCtx().thread, channelType: "dashboard_agent" } }), "Check this thread");

    expect(injectedLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org_1",
        threadId: "thread_1",
        channelType: "dashboard_agent",
        messageCount: 2,
      }),
      "[agent:plan] start",
    );
    expect(completeLogPayload(injectedLogger)).toMatchObject({
      planPath: "1-call",
      modelCalls: 1,
      rawToolCallCount: 0,
      visibleStepCount: 0,
    });
  });

  it("logs planPath 1-call when initial returns escalate_to_human", async () => {
    const injectedLogger = makeLogger();
    installAgentLogger(injectedLogger);
    mockCreate.mockResolvedValueOnce(
      singleToolUse("escalate_to_human", { reason: "Out of scope request." }),
    );

    await planAgent(makeCtx(), "Can you wholesale price 10,000 units?");

    expect(completeLogPayload(injectedLogger)).toMatchObject({
      planPath: "1-call",
      modelCalls: 1,
    });
  });

  it("offers every tool except send_reply on the phase-1 model call", async () => {
    installAgentLogger(makeLogger());
    mockCreate.mockResolvedValueOnce(
      singleToolUse("escalate_to_human", { reason: "Out of scope." }, "tu_1"),
    );

    await planAgent(makeCtx(), "Where is my order?");

    const firstCallTools = mockCreate.mock.calls[0]![0].tools.map((tool: { name: string }) => tool.name);
    expect(firstCallTools).toContain("search_kb");
    expect(firstCallTools).toContain("escalate_to_human");
    expect(firstCallTools).toContain("create_refund");
    expect(firstCallTools).not.toContain("send_reply");
  });

  it("uses a tighter max_tokens budget on phase-1 model calls", async () => {
    installAgentLogger(makeLogger());
    mockCreate.mockResolvedValueOnce(
      singleToolUse("send_reply", { text: "Your order is on the way." }, "tu_1"),
    );

    await planAgent(makeCtx(), "Where is my order?");

    expect(mockCreate.mock.calls[0]![0].max_tokens).toBe(1024);
  });

  it("logs planPath 1-call when initial returns send_reply directly", async () => {
    const injectedLogger = makeLogger();
    installAgentLogger(injectedLogger);
    mockCreate.mockResolvedValueOnce(
      singleToolUse("send_reply", { text: "Your order is on the way." }, "tu_1"),
    );

    await planAgent(makeCtx(), "Where is my order?");

    expect(completeLogPayload(injectedLogger)).toMatchObject({
      planPath: "1-call",
      modelCalls: 1,
    });
  });

  it("logs planPath 2-call-mutative when replan includes send_reply", async () => {
    const injectedLogger = makeLogger();
    installAgentLogger(injectedLogger);
    mockCreate
      .mockResolvedValueOnce(singleToolUse("search_kb", { query: "refund policy" }, "tu_read"))
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "tu_refund", name: "create_refund", input: { order_id: "123", amount: "10.00" } },
          { type: "tool_use", id: "tu_reply", name: "send_reply", input: { text: "Refund processed." } },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

    await planAgent(makeCtx(), "Please refund my order", AGENT_SETTINGS_DEFAULTS);

    expect(completeLogPayload(injectedLogger)).toMatchObject({
      planPath: "2-call-mutative",
      modelCalls: 2,
    });
  });

  it("includes replan send_reply nudge after read results", async () => {
    installAgentLogger(makeLogger());
    mockCreate
      .mockResolvedValueOnce(singleToolUse("search_kb", { query: "refund policy" }, "tu_read"))
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "tu_refund", name: "create_refund", input: { order_id: "123", amount: "10.00" } },
          { type: "tool_use", id: "tu_reply", name: "send_reply", input: { text: "Refund processed." } },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

    await planAgent(makeCtx(), "Please refund my order", AGENT_SETTINGS_DEFAULTS);

    const replanMessages = mockCreate.mock.calls[1]![0].messages;
    expect(replanMessages).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "user", content: REPLAN_INCLUDE_REPLY_PROMPT }),
    ]));
  });

  it("retries replan with narrowed tools when action tools omit send_reply", async () => {
    const injectedLogger = makeLogger();
    installAgentLogger(injectedLogger);
    mockCreate
      .mockResolvedValueOnce(singleToolUse("search_kb", { query: "refund policy" }, "tu_read"))
      .mockResolvedValueOnce(singleToolUse("create_refund", { order_id: "123", amount: "10.00" }, "tu_refund"))
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "tu_refund_retry", name: "create_refund", input: { order_id: "123", amount: "10.00" } },
          { type: "tool_use", id: "tu_reply", name: "send_reply", input: { text: "Refund processed." } },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

    const plan = await planAgent(makeCtx(), "Please refund my order", AGENT_SETTINGS_DEFAULTS);

    const retryTools = mockCreate.mock.calls[2]![0].tools.map((tool: { name: string }) => tool.name);
    expect(retryTools).toEqual(expect.arrayContaining([
      "create_refund",
      "send_reply",
      "add_internal_note",
      "update_thread_status",
    ]));
    expect(retryTools).not.toContain("search_kb");
    expect(completeLogPayload(injectedLogger)).toMatchObject({
      planPath: "2-call-mutative",
      modelCalls: 3,
      replanRetried: true,
    });
    expect(plan.rawToolCalls.map((toolCall) => toolCall.name)).toEqual([
      "search_kb",
      "create_refund",
      "send_reply",
    ]);
  });

  it("forces a reply draft when replan retry still omits send_reply", async () => {
    const injectedLogger = makeLogger();
    installAgentLogger(injectedLogger);
    mockCreate
      .mockResolvedValueOnce(singleToolUse("search_kb", { query: "refund policy" }, "tu_read"))
      .mockResolvedValueOnce(singleToolUse("create_refund", { order_id: "123", amount: "10.00" }, "tu_refund"))
      .mockResolvedValueOnce(singleToolUse("create_refund", { order_id: "123", amount: "10.00" }, "tu_refund_retry"))
      .mockResolvedValueOnce(singleToolUse("send_reply", { text: "Refund processed." }, "tu_draft"));

    const plan = await planAgent(makeCtx(), "Please refund my order", AGENT_SETTINGS_DEFAULTS);

    expect(completeLogPayload(injectedLogger)).toMatchObject({
      planPath: "2-call-mutative",
      modelCalls: 4,
      replanRetried: true,
      replyDrafted: true,
    });
    const draftCall = mockCreate.mock.calls[3]![0];
    expect(draftCall.tool_choice).toEqual({ type: "tool", name: "send_reply" });
    expect(plan.rawToolCalls.map((toolCall) => toolCall.name)).toEqual([
      "search_kb",
      "create_refund",
      "send_reply",
    ]);
  });

  it("dedupes mutative phase-1 tool calls when replan runs", async () => {
    mockCreate
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "tu_read", name: "search_kb", input: { query: "refund" } },
          { type: "tool_use", id: "tu_refund_1", name: "create_refund", input: { order_id: "123", amount: "10.00" } },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      })
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "tu_refund_2", name: "create_refund", input: { order_id: "123", amount: "10.00" } },
          { type: "tool_use", id: "tu_reply", name: "send_reply", input: { text: "Refund processed." } },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

    const plan = await planAgent(makeCtx(), "Please refund my order", AGENT_SETTINGS_DEFAULTS);

    expect(plan.rawToolCalls.map((toolCall) => toolCall.name)).toEqual([
      "search_kb",
      "create_refund",
      "send_reply",
    ]);
    expect(plan.rawToolCalls.filter((toolCall) => toolCall.name === "create_refund")).toHaveLength(1);
    expect(plan.rawToolCalls.find((toolCall) => toolCall.name === "create_refund")?.id).toBe("tu_refund_2");
  });

  it("skips context-redundant read tools before executing live Shopify lookups", async () => {
    installAgentLogger(makeLogger());
    mockCreate
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "tu_order_read", name: "get_order_by_name", input: { order_name: "#1001" } },
          { type: "tool_use", id: "tu_kb_read", name: "search_kb", input: { query: "warranty policy" } },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      })
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "tu_refund", name: "create_refund", input: { order_id: "9000000001", amount: "10.00" } },
          { type: "tool_use", id: "tu_reply", name: "send_reply", input: { text: "Refund processed." } },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

    const plan = await planAgent(
      makeCtx({
        recentOrders: [{
          id: "9000000001",
          name: "#1001",
          created_at: "2026-05-18T10:00:00-07:00",
          financial_status: "paid",
          fulfillment_status: "fulfilled",
          total_price: "59.00",
          currency: "USD",
          items: [],
          shipping_address: null,
        }],
        kbArticles: [],
      }),
      "Please refund order #1001",
      AGENT_SETTINGS_DEFAULTS,
    );

    expect(mockExecutePlanningReadTools).toHaveBeenCalledWith(expect.objectContaining({
      readBlocks: [expect.objectContaining({ name: "search_kb" })],
      skippedBlocks: [expect.objectContaining({ name: "get_order_by_name" })],
    }));
    expect(plan.rawToolCalls.map((toolCall) => toolCall.name)).toEqual([
      "search_kb",
      "create_refund",
      "send_reply",
    ]);
  });

  it("logs planPath fast-path when order status fast path short-circuits planning", async () => {
    const injectedLogger = makeLogger();
    installAgentLogger(injectedLogger);

    const plan = await planAgent(
      makeCtx({
        recentOrders: [{
          id: "9000000001",
          name: "#1001",
          created_at: "2026-05-18T10:00:00-07:00",
          financial_status: "paid",
          fulfillment_status: "fulfilled",
          total_price: "59.00",
          currency: "USD",
          items: [{
            line_item_id: "lineitem_1",
            title: "Cotton Tee",
            quantity: 1,
            variant_id: "variant_1",
            fulfillable_quantity: 0,
            current_quantity: 1,
            fulfillment_status: "fulfilled",
          }],
          shipping_address: null,
        }],
        recentMessages: [{ senderType: "customer", contentText: "Hi, where is my order #1001?" }],
      }),
      "Reply to the customer about their order.",
    );

    expect(mockCreate).not.toHaveBeenCalled();
    expect(plan.orderStatusFastPath).toBe(true);
    expect(plan.rawToolCalls.map((toolCall) => toolCall.name)).toEqual(["send_reply"]);
    expect(completeLogPayload(injectedLogger)).toMatchObject({
      planPath: "fast-path",
      modelCalls: 0,
    });
  });

  it("runs mutative replan when order is in context and phase 1 emits no action tools", async () => {
    const injectedLogger = makeLogger();
    installAgentLogger(injectedLogger);
    mockCreate
      .mockResolvedValueOnce({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "I'll help with that." }],
        usage: { input_tokens: 10, output_tokens: 5 },
      })
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "tu_refund", name: "create_refund", input: { order_id: "9000004003", amount: "42.00" } },
          { type: "tool_use", id: "tu_reply", name: "send_reply", input: { text: "Refund processed." } },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

    const plan = await planAgent(
      makeCtx({
        recentMessages: [{
          senderType: "customer",
          contentText: "Please refund me for order #4003.",
        }],
        recentOrders: [{
          id: "9000004003",
          name: "#4003",
          created_at: "2026-05-15T10:00:00-07:00",
          financial_status: "paid",
          fulfillment_status: "fulfilled",
          total_price: "42.00",
          currency: "USD",
          items: [],
          shipping_address: null,
        }],
      }),
      "Reply to the customer and process their refund request.",
      AGENT_SETTINGS_DEFAULTS,
    );

    expect(completeLogPayload(injectedLogger)).toMatchObject({
      planPath: "2-call-mutative",
      modelCalls: 2,
    });
    expect(plan.rawToolCalls.map((toolCall) => toolCall.name)).toEqual([
      "create_refund",
      "send_reply",
    ]);

    const replanMessages = mockCreate.mock.calls[1]![0].messages;
    expect(replanMessages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: "user",
        content: expect.stringContaining("Customer orders already in context"),
      }),
      expect.objectContaining({ role: "user", content: REPLAN_INCLUDE_REPLY_PROMPT }),
    ]));
  });

  it("skips reply draft and warns when mutative replan still omits action tools", async () => {
    installAgentLogger(makeLogger());
    mockCreate
      .mockResolvedValueOnce({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "I'll help with that." }],
        usage: { input_tokens: 10, output_tokens: 5 },
      })
      .mockResolvedValueOnce(
        singleToolUse("send_reply", { text: "Your refund is on the way." }, "tu_hollow"),
      );

    const plan = await planAgent(
      makeCtx({
        recentMessages: [{
          senderType: "customer",
          contentText: "Please refund me for order #4003.",
        }],
        recentOrders: [{
          id: "9000004003",
          name: "#4003",
          created_at: "2026-05-15T10:00:00-07:00",
          financial_status: "paid",
          fulfillment_status: "fulfilled",
          total_price: "42.00",
          currency: "USD",
          items: [],
          shipping_address: null,
        }],
      }),
      "Reply to the customer and process their refund request.",
      AGENT_SETTINGS_DEFAULTS,
    );

    expect(plan.rawToolCalls.some((toolCall) => toolCall.name === "send_reply")).toBe(false);
    expect(plan.rawToolCalls.some((toolCall) => toolCall.name === "create_refund")).toBe(false);
    expect(plan.warnings).toContain(
      "Customer requested a refund/cancel but no action was planned — review before sending.",
    );
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("skips the order status fast path when brand voice is configured", async () => {
    installAgentLogger(makeLogger());
    mockCreate.mockResolvedValueOnce(
      singleToolUse("send_reply", { text: "Your order #1001 shipped — cheers!" }, "tu_reply"),
    );

    const plan = await planAgent(
      makeCtx({
        recentOrders: [{
          id: "9000000001",
          name: "#1001",
          created_at: "2026-05-18T10:00:00-07:00",
          financial_status: "paid",
          fulfillment_status: "fulfilled",
          total_price: "59.00",
          currency: "USD",
          items: [],
          shipping_address: null,
        }],
        recentMessages: [{ senderType: "customer", contentText: "Hi, where is my order #1001?" }],
      }),
      "Reply to the customer about their order.",
      { ...AGENT_SETTINGS_DEFAULTS, brandVoice: "Always sign off with 'cheers'." },
    );

    expect(mockCreate).toHaveBeenCalled();
    expect(plan.orderStatusFastPath).toBeUndefined();
  });

});

describe("planAgent transcript integrity", () => {
  // Every model call must ship a tool_result for each prior tool_use, or the
  // Anthropic API rejects it with `400 tool_use without tool_result`.
  function expectValidToolPairing() {
    for (const [callIndex, call] of mockCreate.mock.calls.entries()) {
      const messages = (call[0]!.messages ?? []) as Array<{ role: string; content: unknown }>;
      const toolResultIds = new Set<string>();
      for (const message of messages) {
        if (!Array.isArray(message.content)) continue;
        for (const block of message.content as Array<{ type: string; tool_use_id?: string }>) {
          if (block.type === "tool_result" && block.tool_use_id) toolResultIds.add(block.tool_use_id);
        }
      }
      for (const message of messages) {
        if (!Array.isArray(message.content)) continue;
        for (const block of message.content as Array<{ type: string; id?: string }>) {
          if (block.type === "tool_use" && block.id) {
            expect(
              toolResultIds.has(block.id),
              `model call ${callIndex} sent tool_use ${block.id} without a matching tool_result`,
            ).toBe(true);
          }
        }
      }
    }
  }

  it("pairs a non-read tool_use emitted alongside a read before replanning", async () => {
    installAgentLogger(makeLogger());
    mockCreate
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "tu_read", name: "search_kb", input: { query: "refund policy" } },
          { type: "tool_use", id: "tu_refund", name: "create_refund", input: { order_id: "123", amount: "10.00" } },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      })
      .mockResolvedValue(singleToolUse("send_reply", { text: "Done." }, "tu_reply"));

    await planAgent(makeCtx(), "Please refund my order", AGENT_SETTINGS_DEFAULTS);

    expectValidToolPairing();
  });

  it("pairs the initial tool_use before the mutative-intent context replan", async () => {
    installAgentLogger(makeLogger());
    mockCreate
      .mockResolvedValueOnce(singleToolUse("ask_operator", { question: "Should I refund this?" }, "tu_ask"))
      .mockResolvedValue(singleToolUse("send_reply", { text: "Done." }, "tu_reply"));

    await planAgent(
      makeCtx({ recentMessages: [{ senderType: "customer", contentText: "Please refund my order" }] }),
      "Please refund my order",
      AGENT_SETTINGS_DEFAULTS,
    );

    expectValidToolPairing();
  });
});
