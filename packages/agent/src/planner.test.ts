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
    replyDraftFallback?: boolean;
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

  it("restricts phase-1 model call to read tools and escalate_to_human", async () => {
    installAgentLogger(makeLogger());
    mockCreate
      .mockResolvedValueOnce({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Checking order context." }],
        usage: { input_tokens: 10, output_tokens: 5 },
      })
      .mockResolvedValueOnce(singleToolUse("send_reply", { text: "Your order is on the way." }, "tu_2"));

    await planAgent(makeCtx(), "Where is my order?");

    const firstCallTools = mockCreate.mock.calls[0]![0].tools.map((tool: { name: string }) => tool.name);
    expect(firstCallTools).toContain("search_kb");
    expect(firstCallTools).toContain("escalate_to_human");
    expect(firstCallTools).not.toContain("create_refund");
    expect(firstCallTools).not.toContain("send_reply");
  });

  it("logs planPath 2-call-read when reply draft runs after read-only initial", async () => {
    const injectedLogger = makeLogger();
    installAgentLogger(injectedLogger);
    mockCreate
      .mockResolvedValueOnce({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Order is already in context." }],
        usage: { input_tokens: 10, output_tokens: 5 },
      })
      .mockResolvedValueOnce(singleToolUse("send_reply", { text: "Your order is on the way." }, "tu_2"));

    await planAgent(makeCtx(), "Where is my order?");

    expect(completeLogPayload(injectedLogger)).toMatchObject({
      planPath: "2-call-read",
      modelCalls: 2,
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
      replyDraftFallback: false,
    });
    expect(plan.rawToolCalls.map((toolCall) => toolCall.name)).toEqual([
      "search_kb",
      "create_refund",
      "send_reply",
    ]);
  });

  it("logs planPath 3-call when replan retry still omits send_reply and reply draft runs", async () => {
    const injectedLogger = makeLogger();
    installAgentLogger(injectedLogger);
    mockCreate
      .mockResolvedValueOnce(singleToolUse("search_kb", { query: "refund policy" }, "tu_read"))
      .mockResolvedValueOnce(singleToolUse("create_refund", { order_id: "123", amount: "10.00" }, "tu_refund"))
      .mockResolvedValueOnce(singleToolUse("create_refund", { order_id: "123", amount: "10.00" }, "tu_refund_retry"))
      .mockResolvedValueOnce(singleToolUse("send_reply", { text: "Refund processed." }, "tu_reply"));

    await planAgent(makeCtx(), "Please refund my order", AGENT_SETTINGS_DEFAULTS);

    expect(completeLogPayload(injectedLogger)).toMatchObject({
      planPath: "3-call",
      modelCalls: 4,
      replanRetried: true,
      replyDraftFallback: true,
    });
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
});
