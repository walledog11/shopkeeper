import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installAgentLogger, resetAgentLoggerForTests, type AgentLogger } from "./logger.js";
import { planAgent } from "./planner.js";
import type { AgentContext } from "./agent-context.js";
import { AGENT_SETTINGS_DEFAULTS } from "./settings.js";
import { emptyIntents, emptyRequestFacts, type ClassifierIntents } from "./classifier-signals.js";

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

function classifierSignalsFor(intents: Partial<ClassifierIntents>) {
  return {
    version: 2,
    language: "en",
    intents: { ...emptyIntents(), ...intents },
    requestFacts: emptyRequestFacts(),
  };
}

function singleToolUse(name: string, input: Record<string, unknown>, id = "tu_1") {
  return {
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id, name, input }],
    usage: { input_tokens: 10, output_tokens: 5 },
  };
}

function toolUses(calls: { id: string; name: string; input: Record<string, unknown> }[]) {
  return {
    stop_reason: "tool_use",
    content: calls.map(call => ({ type: "tool_use", ...call })),
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
    toolSelectionBucket: string;
    toolSelectionNarrowed: boolean;
    namespaceMiss: boolean;
    namespaceMissReason: string | null;
    validationStatus: string;
    supersededValidationIssueCodes: string[] | null;
  };
}

function toolNamesForCall(index: number): string[] {
  return mockCreate.mock.calls[index]![0].tools.map((tool: { name: string }) => tool.name);
}

const REFUNDED_ORDER_1020 = {
  id: "9000001020",
  name: "#1020",
  created_at: "2026-05-08T09:00:00-07:00",
  financial_status: "refunded",
  fulfillment_status: "fulfilled",
  total_price: "38.00",
  currency: "USD",
  items: [],
  shipping_address: null,
};

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

  it("offers the full enabled registry when classifier signals are unavailable", async () => {
    installAgentLogger(makeLogger());
    mockCreate.mockResolvedValueOnce(singleToolUse("send_reply", { text: "Your order is on the way." }));

    await planAgent(makeCtx(), "Where is my order?");

    const firstCallTools = toolNamesForCall(0);
    expect(firstCallTools).toContain("search_kb");
    expect(firstCallTools).toContain("create_refund");
    expect(firstCallTools).toContain("send_reply");
    expect(firstCallTools).not.toContain("request_wider_tool_set");
  });

  it("narrows an aligned order-status plan and keeps all control tools", async () => {
    const injectedLogger = makeLogger();
    installAgentLogger(injectedLogger);
    mockCreate.mockResolvedValueOnce(singleToolUse("send_reply", { text: "Your order is on the way." }));

    await planAgent(makeCtx({
      classifierSignals: {
        ...classifierSignalsFor({ order_status: true }),
        requestFacts: { ...emptyRequestFacts(), ask: "order_status" },
      },
      thread: {
        ...makeCtx().thread,
        requestSourceMessageId: "message_1",
        latestCustomerMessageId: "message_1",
      },
    }), "Where is my order?");

    const firstCallTools = toolNamesForCall(0);
    expect(firstCallTools).toEqual(expect.arrayContaining([
      "get_shopify_orders",
      "get_order_by_name",
      "get_order_tracking",
      "send_reply",
      "escalate_to_human",
      "ask_operator",
      "request_wider_tool_set",
    ]));
    expect(firstCallTools).not.toContain("create_refund");
    expect(completeLogPayload(injectedLogger)).toMatchObject({
      toolSelectionBucket: "order_status",
      toolSelectionNarrowed: true,
      namespaceMiss: false,
    });
  });

  it("widens once from a clean transcript when the model signals a namespace miss", async () => {
    const injectedLogger = makeLogger();
    installAgentLogger(injectedLogger);
    const snapshots: unknown[] = [];
    const responses = [
      singleToolUse(
        "request_wider_tool_set",
        { capability: "update customer email" },
        "tu_widen",
      ),
      singleToolUse("send_reply", { text: "I can help with that." }, "tu_reply"),
    ];
    let callIndex = 0;
    mockCreate.mockImplementation(async (params: { messages: unknown }) => {
      snapshots.push(structuredClone(params.messages));
      return responses[Math.min(callIndex++, responses.length - 1)];
    });

    const plan = await planAgent(makeCtx({
      classifierSignals: {
        ...classifierSignalsFor({ order_status: true }),
        requestFacts: { ...emptyRequestFacts(), ask: "order_status" },
      },
    }), "Help with the latest request");

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(toolNamesForCall(0)).toContain("request_wider_tool_set");
    expect(toolNamesForCall(0)).not.toContain("update_shopify_customer_info");
    expect(toolNamesForCall(1)).not.toContain("request_wider_tool_set");
    expect(toolNamesForCall(1)).toContain("update_shopify_customer_info");
    expect(snapshots[1]).toEqual(snapshots[0]);
    expect(plan.rawToolCalls.map((call) => call.name)).toEqual(["send_reply"]);
    expect(completeLogPayload(injectedLogger)).toMatchObject({
      toolSelectionBucket: "order_status",
      namespaceMiss: true,
      namespaceMissReason: "model_signal",
    });
  });

  it("widens once after an empty narrowed plan", async () => {
    const injectedLogger = makeLogger();
    installAgentLogger(injectedLogger);
    mockCreate
      .mockResolvedValueOnce(endTurn("I need another capability."))
      .mockResolvedValueOnce(endTurn("I still need another capability."))
      .mockResolvedValueOnce(singleToolUse("send_reply", { text: "I can help with that." }, "tu_reply"));

    await planAgent(makeCtx({
      classifierSignals: {
        ...classifierSignalsFor({ policy_question: true }),
        requestFacts: { ...emptyRequestFacts(), ask: "policy_question" },
      },
    }), "Help with the latest request");

    expect(mockCreate).toHaveBeenCalledTimes(3);
    expect(toolNamesForCall(2)).not.toContain("request_wider_tool_set");
    expect(toolNamesForCall(2)).toContain("create_refund");
    expect(completeLogPayload(injectedLogger)).toMatchObject({
      namespaceMiss: true,
      namespaceMissReason: "empty_plan",
    });
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
      recentMessages: [
        { senderType: "customer", contentText: "Do you carry a snowboard like this?" },
        { senderType: "agent", contentText: "I can't view Instagram images." },
        {
          senderType: "customer",
          contentText: "[Instagram image attachment]",
          attachments: [{
            type: "image",
            reference: "blob:attachments/org_1/image-id/photo.png",
            status: "available",
            mediaType: "image/png",
            data: "iVBORw0KGgo=",
          }],
        },
      ],
    });

    await planAgent(ctx, "Handle this customer's latest request");

    const firstCall = mockCreate.mock.calls[0]?.[0] as {
      messages: Array<{ content: unknown }>;
    };
    const imageMessage = firstCall.messages.find((message) => Array.isArray(message.content));
    expect(imageMessage?.content).toEqual(expect.arrayContaining([{
      type: "image",
      source: {
        type: "base64",
        media_type: "image/png",
        data: "iVBORw0KGgo=",
      },
    }]));
    const serializedMessages = JSON.stringify(firstCall.messages);
    expect(serializedMessages).toContain("I can't view Instagram images");
    expect(serializedMessages).toContain("available for visual inspection");
    expect(serializedMessages.indexOf("I can't view Instagram images")).toBeLessThan(
      serializedMessages.indexOf("available for visual inspection"),
    );
    expect(serializedMessages).not.toContain("Visual content unavailable");
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
        classifierSignals: classifierSignalsFor({ mutative_request: true }),
      }),
      "Reply to the customer and process their refund request.",
      { ...AGENT_SETTINGS_DEFAULTS, autonomyTier: "trusted", autoExecuteMode: "live" },
    );

    expect(plan.rawToolCalls.map((toolCall) => toolCall.name)).toEqual(["create_refund", "send_reply"]);
    expect(plan.routing).toBeUndefined();
    expect(plan.routingEvidence?.classifierState).toBe("aligned");
    expect(completeLogPayload(injectedLogger)).toMatchObject({ routingDecision: "auto_execute" });
  });

  it("escalates a compensation request with no safe action", async () => {
    installAgentLogger(makeLogger());
    mockCreate.mockResolvedValueOnce(singleToolUse("send_reply", { text: "Your refund is on the way." }, "tu_reply"));

    const plan = await planAgent(
      makeCtx({
        recentMessages: [{ senderType: "customer", contentText: "Please refund me for order #4003." }],
        recentOrders: [FULFILLED_ORDER_4003],
        classifierSignals: classifierSignalsFor({ mutative_request: true }),
      }),
      "Reply to the customer and process their refund request.",
      AGENT_SETTINGS_DEFAULTS,
    );

    expect(plan.rawToolCalls.map((toolCall) => toolCall.name)).toEqual(["escalate_to_human"]);
    expect(plan.routing).toBeUndefined();
    expect(plan.signals?.map((signal) => signal.code)).toContain("mutative_intent_no_action");
  });

  it("materializes a deterministic escalation for out-of-scope commercial requests", async () => {
    installAgentLogger(makeLogger());
    mockCreate.mockResolvedValueOnce(singleToolUse("send_reply", { text: "Sure!" }, "tu_reply"));

    const plan = await planAgent(
      makeCtx({
        recentMessages: [{ senderType: "customer", contentText: "Can you give me wholesale pricing on 10,000 units?" }],
        classifierSignals: classifierSignalsFor({ out_of_scope_commercial: true }),
      }),
      "Handle this ticket.",
      AGENT_SETTINGS_DEFAULTS,
    );

    expect(plan.routing).toBeUndefined();
    expect(plan.routingEvidence?.codes).toContain("out_of_scope_commercial_request");
    expect(plan.rawToolCalls.map((toolCall) => toolCall.name)).toEqual(["escalate_to_human"]);
  });

  // Regression for the `refund-already-refunded` eval fixture: the model wrote a
  // note plus a reply, which is invalid as an orphan note, and validity used to
  // gate the whole routing block — so the escalate verdict never reached the
  // plan and the merchant saw a reply on an order already refunded in full.
  it("materializes the escalation when the invalid draft would have suppressed it", async () => {
    const injectedLogger = makeLogger();
    installAgentLogger(injectedLogger);
    mockCreate.mockResolvedValueOnce(toolUses([
      { id: "tu_note", name: "add_internal_note", input: { text: "Customer asked about a prior refund." } },
      { id: "tu_reply", name: "send_reply", input: { text: "That order was already refunded." } },
    ]));

    const plan = await planAgent(
      makeCtx({
        recentMessages: [{
          senderType: "customer",
          contentText: "Can I get a refund for order #1020? It never worked out.",
        }],
        recentOrders: [REFUNDED_ORDER_1020],
        classifierSignals: classifierSignalsFor({ mutative_request: true }),
      }),
      "Reply to the customer about their refund request.",
      AGENT_SETTINGS_DEFAULTS,
    );

    expect(plan.rawToolCalls.map((toolCall) => toolCall.name)).toEqual(["escalate_to_human"]);
    expect(plan.routingEvidence?.codes).toContain("already_refunded_request");
    // The plan the merchant approves is system-authored, so it validates.
    expect(plan.validation).toEqual({ status: "valid", issues: [] });
    expect(completeLogPayload(injectedLogger)).toMatchObject({
      routingDecision: "escalate",
      validationStatus: "valid",
      supersededValidationIssueCodes: ["orphan_internal_note"],
    });
  });

  it("preserves an invalid proposal and does not let routing hide it", async () => {
    installAgentLogger(makeLogger());
    const reply = "I've issued the wholesale refund.";
    mockCreate.mockResolvedValueOnce(singleToolUse("send_reply", { text: reply }, "tu_reply"));

    const plan = await planAgent(
      makeCtx({
        recentMessages: [{ senderType: "customer", contentText: "Can you give me wholesale pricing and refund me?" }],
      }),
      "Handle this ticket.",
      AGENT_SETTINGS_DEFAULTS,
    );

    expect(plan.validation).toEqual({
      status: "invalid",
      issues: [expect.objectContaining({ code: "ungrounded_customer_reply" })],
    });
    expect(plan.rawToolCalls).toEqual([
      { id: "tu_reply", name: "send_reply", input: { text: reply } },
    ]);
    expect(plan.routing).toBeUndefined();
    expect(plan.signals?.map((signal) => signal.code)).toContain("ungrounded_customer_reply");
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

  it("starts the low-tier re-plan from a clean transcript", async () => {
    // Regression: runAgentLoop appends to the message array in place, so reusing
    // the same array for the judgment-tier re-plan replayed the discarded
    // low-tier attempt's turns and the API rejected the sequence with
    // `400 tool_use ids were found without tool_result blocks`. Caught by the
    // eval suite on fulfill-merchant-confirmed-shipment, where the low tier
    // proposes fulfill_order and the safety net forces the re-plan.
    installAgentLogger(makeLogger());
    vi.stubEnv("AGENT_PLANNER_TIER_MODE", "low_risk_haiku");

    const snapshots: Array<Array<{ role: string; content: unknown }>> = [];
    const models: string[] = [];
    const responses = [
      // Low tier proposes a mutative action, which the outward check rejects.
      singleToolUse("create_refund", { order_id: "123", amount: "10.00" }, "tu_refund"),
      // Judgment tier re-plans from scratch.
      singleToolUse("send_reply", { text: "Looking into it." }, "tu_reply"),
    ];
    let callIndex = 0;
    mockCreate.mockImplementation(async (params: {
      model: string;
      messages: Array<{ role: string; content: unknown }>;
    }) => {
      models.push(params.model);
      snapshots.push(structuredClone(params.messages));
      return responses[Math.min(callIndex++, responses.length - 1)];
    });

    const ctx = makeCtx({
      classifierSignals: {
        version: 1,
        language: "en",
        intents: {
          mutative_request: false,
          policy_question: false,
          order_status: true,
          fraud_signals: false,
          contradiction: false,
          out_of_scope_commercial: false,
          forwarded_injection: false,
        },
      },
    });
    await planAgent(ctx, "Where is my order?", AGENT_SETTINGS_DEFAULTS);

    // Keyed on the model switch rather than a call count: the low tier may take
    // more than one iteration to land on a terminal tool, and the property under
    // test holds regardless of how many.
    const replanIndex = models.findIndex((model) => model !== models[0]);
    expect(replanIndex).toBeGreaterThan(0);
    // The re-plan starts from the same transcript the first attempt did, with
    // none of the discarded attempt's turns carried over.
    expect(snapshots[replanIndex]).toEqual(snapshots[0]);
    expectValidToolPairing(snapshots);
  });
});
