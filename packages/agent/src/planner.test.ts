import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installAgentLogger, resetAgentLoggerForTests, type AgentLogger } from "./logger.js";
import { planAgent } from "./planner.js";
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

// Reads execute for real in capture mode; stub the read executor so tests never
// hit Shopify/DB while the warning + routing pipeline stays real.
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

function endTurn(text = "Working on it.") {
  return {
    stop_reason: "end_turn",
    content: [{ type: "text", text }],
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

function completeLogPayload(logger: AgentLogger) {
  const call = logger.info.mock.calls.find(([, message]) => message === "[agent:plan] complete");
  expect(call).toBeDefined();
  return call![0] as {
    iterations: number;
    reprompted: boolean;
    modelCalls: number;
    rawToolCallCount: number;
    visibleStepCount: number;
    routingDecision: string | null;
  };
}

function toolNamesForCall(index: number): string[] {
  return mockCreate.mock.calls[index]![0].tools.map((tool: { name: string }) => tool.name);
}

const FULFILLED_ORDER_4003 = {
  id: "9000004003",
  name: "#4003",
  created_at: "2026-05-15T10:00:00-07:00",
  financial_status: "paid",
  fulfillment_status: "fulfilled",
  total_price: "42.00",
  currency: "USD",
  items: [],
  shipping_address: null,
};

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

describe("planAgent capture loop", () => {
  it("uses the injected logger for planner lifecycle logs", async () => {
    const injectedLogger = makeLogger();
    installAgentLogger(injectedLogger);
    mockCreate.mockResolvedValueOnce(endTurn("No action needed."));

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
      iterations: 1,
      modelCalls: 1,
      rawToolCallCount: 0,
      visibleStepCount: 0,
      reprompted: false,
    });
  });

  it("offers the full enabled registry, including send_reply, on the planning call", async () => {
    installAgentLogger(makeLogger());
    mockCreate.mockResolvedValueOnce(singleToolUse("send_reply", { text: "Your order is on the way." }));

    await planAgent(makeCtx(), "Where is my order?");

    const firstCallTools = toolNamesForCall(0);
    expect(firstCallTools).toContain("search_kb");
    expect(firstCallTools).toContain("create_refund");
    expect(firstCallTools).toContain("send_reply");
  });

  it("uses a 4096 max_tokens budget on planning calls", async () => {
    installAgentLogger(makeLogger());
    mockCreate.mockResolvedValueOnce(singleToolUse("send_reply", { text: "Your order is on the way." }));

    await planAgent(makeCtx(), "Where is my order?");

    expect(mockCreate.mock.calls[0]![0].max_tokens).toBe(4096);
  });

  it("passes hydrated Instagram images to the capture-mode planning model", async () => {
    installAgentLogger(makeLogger());
    mockCreate.mockResolvedValueOnce(singleToolUse("send_reply", { text: "Thanks for the photo." }));
    const ctx = makeCtx({
      thread: { ...makeCtx().thread, channelType: "ig_dm" },
      recentMessages: [{
        senderType: "customer",
        contentText: "[Instagram image attachment]",
        attachments: [{
          type: "image",
          reference: "blob:attachments/org_1/image-id/photo.png",
          status: "available",
          mediaType: "image/png",
          data: "iVBORw0KGgo=",
        }],
      }],
    });

    await planAgent(ctx, "Handle this customer's latest request");

    const firstCall = mockCreate.mock.calls[0]?.[0] as {
      messages: Array<{ content: unknown }>;
    };
    expect(firstCall.messages[0]?.content).toEqual(expect.arrayContaining([{
      type: "image",
      source: {
        type: "base64",
        media_type: "image/png",
        data: "iVBORw0KGgo=",
      },
    }]));
    expect(JSON.stringify(firstCall.messages[0]?.content)).not.toContain("Visual content unavailable");
  });

  it("captures a single send_reply as the plan and stops", async () => {
    const injectedLogger = makeLogger();
    installAgentLogger(injectedLogger);
    mockCreate.mockResolvedValueOnce(singleToolUse("send_reply", { text: "Your order is on the way." }));

    const plan = await planAgent(makeCtx(), "Where is my order?");

    expect(plan.rawToolCalls.map((toolCall) => toolCall.name)).toEqual(["send_reply"]);
    expect(plan.steps.map((step) => step.tool)).toEqual(["send_reply"]);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(completeLogPayload(injectedLogger)).toMatchObject({ iterations: 1, reprompted: false });
  });

  it("executes reads for real, then captures the mutative action and reply", async () => {
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

    const plan = await planAgent(makeCtx(), "Please refund my order", AGENT_SETTINGS_DEFAULTS);

    expect(mockExecutePlanningReadTools).toHaveBeenCalledWith(expect.objectContaining({
      readBlocks: [expect.objectContaining({ name: "search_kb" })],
    }));
    expect(plan.rawToolCalls.map((toolCall) => toolCall.name)).toEqual([
      "search_kb",
      "create_refund",
      "send_reply",
    ]);
    expect(plan.steps.map((step) => step.tool)).toEqual(["create_refund", "send_reply"]);
    expect(plan.readResults).toEqual({ tu_read: "Read result" });
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("re-prompts once for a terminal tool when a support turn stalls", async () => {
    const injectedLogger = makeLogger();
    installAgentLogger(injectedLogger);
    mockCreate
      .mockResolvedValueOnce(endTurn("I'll take a look."))
      .mockResolvedValueOnce(singleToolUse("send_reply", { text: "Your order shipped." }, "tu_reply"));

    const plan = await planAgent(makeCtx(), "Where is my order?");

    expect(mockCreate).toHaveBeenCalledTimes(2);
    const secondCallMessages = mockCreate.mock.calls[1]![0].messages as Array<{ role: string; content: unknown }>;
    expect(secondCallMessages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        role: "user",
        content: expect.stringContaining("send_reply"),
      }),
    ]));
    expect(plan.rawToolCalls.map((toolCall) => toolCall.name)).toEqual(["send_reply"]);
    expect(completeLogPayload(injectedLogger)).toMatchObject({ iterations: 2, reprompted: true });
  });

  it("does not re-prompt operator planning turns", async () => {
    const injectedLogger = makeLogger();
    installAgentLogger(injectedLogger);
    mockCreate.mockResolvedValueOnce(endTurn("Reviewed — nothing to do."));

    await planAgent(
      makeCtx({ thread: { ...makeCtx().thread, channelType: "dashboard_agent" } }),
      "Look into this",
    );

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(completeLogPayload(injectedLogger)).toMatchObject({ reprompted: false });
  });

  it("drops ask_operator from the tool set for a merchant-answer replan", async () => {
    installAgentLogger(makeLogger());
    mockCreate.mockResolvedValueOnce(singleToolUse("send_reply", { text: "Yes, we ship to Canada." }));

    await planAgent(makeCtx(), "The store owner answered your question: we ship to Canada.");

    const firstCallTools = toolNamesForCall(0);
    expect(firstCallTools).not.toContain("ask_operator");
    expect(firstCallTools).toContain("send_reply");
  });
});

describe("planAgent routing", () => {
  it("keeps a mutative action and routes the plan to auto_execute", async () => {
    const injectedLogger = makeLogger();
    installAgentLogger(injectedLogger);
    mockCreate
      .mockResolvedValueOnce(singleToolUse("create_refund", { order_id: "9000004003", amount: "42.00" }, "tu_refund"))
      .mockResolvedValueOnce(singleToolUse("send_reply", { text: "Refund processed." }, "tu_reply"));

    const plan = await planAgent(
      makeCtx({
        recentMessages: [{ senderType: "customer", contentText: "Please refund me for order #4003." }],
        recentOrders: [FULFILLED_ORDER_4003],
      }),
      "Reply to the customer and process their refund request.",
      AGENT_SETTINGS_DEFAULTS,
    );

    expect(plan.rawToolCalls.map((toolCall) => toolCall.name)).toEqual(["create_refund", "send_reply"]);
    expect(plan.routing?.decision).toBe("auto_execute");
    expect(completeLogPayload(injectedLogger)).toMatchObject({ routingDecision: "auto_execute" });
  });

  it("routes a mutative request with no action to needs_review", async () => {
    installAgentLogger(makeLogger());
    mockCreate.mockResolvedValueOnce(singleToolUse("send_reply", { text: "Your refund is on the way." }, "tu_reply"));

    const plan = await planAgent(
      makeCtx({
        recentMessages: [{ senderType: "customer", contentText: "Please refund me for order #4003." }],
        recentOrders: [FULFILLED_ORDER_4003],
      }),
      "Reply to the customer and process their refund request.",
      AGENT_SETTINGS_DEFAULTS,
    );

    expect(plan.rawToolCalls.map((toolCall) => toolCall.name)).toEqual(["send_reply"]);
    expect(plan.routing?.decision).toBe("needs_review");
    expect(plan.warnings).toContain(
      "Customer requested a refund/cancel but no action was planned — review before sending.",
    );
  });

  it("materializes a deterministic escalation for out-of-scope commercial requests", async () => {
    installAgentLogger(makeLogger());
    mockCreate.mockResolvedValueOnce(singleToolUse("send_reply", { text: "Sure!" }, "tu_reply"));

    const plan = await planAgent(
      makeCtx({
        recentMessages: [{ senderType: "customer", contentText: "Can you give me wholesale pricing on 10,000 units?" }],
      }),
      "Handle this ticket.",
      AGENT_SETTINGS_DEFAULTS,
    );

    expect(plan.routing?.decision).toBe("escalate");
    expect(plan.rawToolCalls.map((toolCall) => toolCall.name)).toEqual(["escalate_to_human"]);
  });
});

describe("planAgent transcript integrity", () => {
  // Every model call must ship a tool_result for each prior tool_use, or the
  // Anthropic API rejects it with `400 tool_use without tool_result`. The loop
  // mutates the message array in place, so snapshot each call's messages at send
  // time rather than inspecting the (final) shared reference afterwards.
  function expectValidToolPairing(snapshots: Array<Array<{ role: string; content: unknown }>>) {
    for (const [callIndex, messages] of snapshots.entries()) {
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

  it("pairs a read and a non-read emitted together before the next iteration", async () => {
    installAgentLogger(makeLogger());
    const snapshots: Array<Array<{ role: string; content: unknown }>> = [];
    const responses = [
      {
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "tu_read", name: "search_kb", input: { query: "refund policy" } },
          { type: "tool_use", id: "tu_refund", name: "create_refund", input: { order_id: "123", amount: "10.00" } },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      },
      singleToolUse("send_reply", { text: "Done." }, "tu_reply"),
    ];
    let callIndex = 0;
    mockCreate.mockImplementation(async (params: { messages: Array<{ role: string; content: unknown }> }) => {
      snapshots.push(structuredClone(params.messages));
      return responses[Math.min(callIndex++, responses.length - 1)];
    });

    await planAgent(makeCtx(), "Please refund my order", AGENT_SETTINGS_DEFAULTS);

    expectValidToolPairing(snapshots);
  });
});
