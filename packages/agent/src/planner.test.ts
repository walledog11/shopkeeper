import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installAgentLogger, resetAgentLoggerForTests } from "./logger.js";
import { planAgent } from "./planner.js";
import { AGENT_SETTINGS_DEFAULTS } from "./settings.js";
import {
  FULFILLED_ORDER_4003,
  completeLogPayload,
  endTurn,
  makeCtx,
  makeLogger,
  singleToolUse,
  toolUses,
} from "./test-fixtures/planner.js";

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

// planAgent persists its turn usage; keep that write off the database here.
vi.mock("./agent-actions.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./agent-actions.js")>()),
  recordAgentTurnUsage: vi.fn().mockResolvedValue(undefined),
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
  vi.unstubAllEnvs();
});

describe("planAgent capture loop", () => {

  it("binds Shopify's full-refund quote when the model supplies only the order", async () => {
    installAgentLogger(makeLogger());
    mockCreate.mockResolvedValueOnce(toolUses([
      {
        id: "tu_refund",
        name: "create_refund",
        input: { order_id: "9000004003", reason: "Wrong size" },
      },
      {
        id: "tu_reply",
        name: "send_reply",
        input: { text: "I can arrange the full refund." },
      },
    ]));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        order: {
          id: 9000004003,
          currency: "USD",
          financial_status: "paid",
          refunds: [],
          line_items: [{ id: 11, title: "Tee", quantity: 1, current_quantity: 1 }],
        },
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        refund: {
          currency: "USD",
          transactions: [{
            kind: "suggested_refund",
            gateway: "shopify_payments",
            parent_id: 222,
            amount: "42.00",
            maximum_refundable: "42.00",
          }],
        },
      }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const plan = await planAgent(makeCtx({
      recentOrders: [FULFILLED_ORDER_4003],
    }), "Please give me a full refund for order #4003", AGENT_SETTINGS_DEFAULTS);

    expect(plan.rawToolCalls).toContainEqual(expect.objectContaining({
      id: "tu_refund",
      name: "create_refund",
      input: {
        order_id: "9000004003",
        reason: "Wrong size",
        amount: "42.00",
        currency: "USD",
      },
    }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("names an exact-draft return's items from Shopify, not from the model", async () => {
    installAgentLogger(makeLogger());
    mockCreate.mockResolvedValueOnce(toolUses([
      {
        id: "tu_return",
        name: "create_return",
        input: {
          order_id: "9000004003",
          variant_id: "501",
          approval_line_items: [{ name: "Canvas Tote", quantity: 1, change: "return" }],
        },
      },
      { id: "tu_reply", name: "send_reply", input: { text: "I can open that return for you." } },
    ]));
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      data: {
        order: { id: "gid://shopify/Order/9000004003" },
        returnableFulfillments: { edges: [{ node: { returnableFulfillmentLineItems: { edges: [
          { node: { quantity: 1, fulfillmentLineItem: { id: "gid://shopify/FulfillmentLineItem/1", lineItem: { name: "Napkin - Special", variant: { id: "gid://shopify/ProductVariant/501" } } } } },
          { node: { quantity: 1, fulfillmentLineItem: { id: "gid://shopify/FulfillmentLineItem/2", lineItem: { name: "Napkin - Sample", variant: { id: "gid://shopify/ProductVariant/502" } } } } },
        ] } } }] },
      },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const plan = await planAgent(makeCtx({ recentOrders: [FULFILLED_ORDER_4003] }), "Handle this return", AGENT_SETTINGS_DEFAULTS, {

    });
    vi.unstubAllGlobals();

    expect(plan.rawToolCalls.find((call) => call.id === "tu_return")?.input).toEqual({
      order_id: "9000004003",
      variant_id: "501",
      approval_line_items: [{ name: "Napkin - Special", quantity: 1, change: "return" }],
    });
    expect(plan.steps.find((step) => step.id === "tu_return")?.description)
      .toBe("Open a return for 1x Napkin - Special");
    expect(plan.validation?.issues.map((issue) => issue.code)).not.toContain("unnamed_line_item_target");
  });

  it("leaves an exact-draft edit whose target Shopify does not show invalid, intact", async () => {
    installAgentLogger(makeLogger());
    mockCreate.mockResolvedValueOnce(toolUses([
      { id: "tu_edit", name: "edit_shopify_order", input: { order_id: "9000004003", remove_variant_id: "999" } },
      { id: "tu_reply", name: "send_reply", input: { text: "I can take that off your order." } },
    ]));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      order: { id: 9000004003, line_items: [{ id: 1, variant_id: 501, title: "Napkin", quantity: 1, current_quantity: 1 }] },
    }), { status: 200, headers: { "content-type": "application/json" } })));

    const plan = await planAgent(makeCtx({ recentOrders: [FULFILLED_ORDER_4003] }), "Handle this edit", AGENT_SETTINGS_DEFAULTS, {

    });
    vi.unstubAllGlobals();

    expect(plan.validation).toMatchObject({
      status: "invalid",
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "unnamed_line_item_target", toolCallId: "tu_edit" }),
      ]),
    });
    expect(plan.rawToolCalls.find((call) => call.id === "tu_edit")?.input)
      .toEqual({ order_id: "9000004003", remove_variant_id: "999" });
  });

  it("drops a model-written item name when no provider can establish it", async () => {
    installAgentLogger(makeLogger());
    mockCreate.mockResolvedValueOnce(toolUses([
      {
        id: "tu_return",
        name: "create_return",
        input: { order_id: "9000004003", approval_line_items: [{ name: "Canvas Tote", quantity: 1, change: "return" }] },
      },
      { id: "tu_reply", name: "send_reply", input: { text: "I can open that return for you." } },
    ]));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const plan = await planAgent(makeCtx({ shopify: undefined }), "Handle this return", AGENT_SETTINGS_DEFAULTS);
    vi.unstubAllGlobals();

    expect(plan.rawToolCalls.find((call) => call.id === "tu_return")?.input).toEqual({ order_id: "9000004003" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a retired task before contacting the model", async () => {
    await expect(planAgent(makeCtx(), "Handle this ticket", undefined, { runtimeVersion: 1 }))
      .rejects.toThrow(/retired agent runtime/);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("drafts the reply with the write and binds it as the exact draft", async () => {
    installAgentLogger(makeLogger());
    mockCreate
      .mockResolvedValueOnce(singleToolUse("search_kb", { query: "refund policy" }, "tu_read"))
      .mockResolvedValueOnce(singleToolUse("create_refund", { order_id: "123", amount: "10.00" }, "tu_refund"))
      .mockResolvedValueOnce(singleToolUse("send_reply", { text: "Your refund is on its way." }, "tu_reply"));

    const plan = await planAgent(makeCtx(), "Please refund my order", AGENT_SETTINGS_DEFAULTS, {

    });

    // The write does not end the turn: the message the merchant approves is
    // written before approval, alongside it.
    expect(plan.rawToolCalls.map((toolCall) => toolCall.name)).toEqual(["search_kb", "create_refund", "send_reply"]);
    expect(mockCreate).toHaveBeenCalledTimes(3);
    expect(plan.communication).toEqual({
      mode: "exact_draft",
      destination: { kind: "thread", id: "thread_1", channel: "email" },
      draft: "Your refund is on its way.",
      allowedResultBindings: [],
    });
    expect(plan.suspendedAtProposal).toBeUndefined();
  });

  it("records a write the model sent no message with as authorizing none", async () => {
    installAgentLogger(makeLogger());
    mockCreate
      .mockResolvedValueOnce(singleToolUse("create_refund", { order_id: "123", amount: "10.00" }, "tu_refund"))
      .mockResolvedValueOnce(endTurn("Refund proposed."))
      .mockResolvedValueOnce(endTurn("Refund proposed."));

    const plan = await planAgent(makeCtx(), "Please refund my order", AGENT_SETTINGS_DEFAULTS, {

    });

    expect(plan.rawToolCalls.map((toolCall) => toolCall.name)).toEqual(["create_refund"]);
    expect(plan.communication).toEqual({ mode: "none" });
  });

  it("refuses two customer messages, which one exact draft cannot cover", async () => {
    installAgentLogger(makeLogger());
    mockCreate.mockResolvedValueOnce(toolUses([
      { id: "tu_reply_1", name: "send_reply", input: { text: "Checking now." } },
      { id: "tu_reply_2", name: "send_reply", input: { text: "All sorted." } },
    ]));

    const plan = await planAgent(makeCtx(), "Where is my order?", AGENT_SETTINGS_DEFAULTS, {

    });

    expect(plan.validation).toMatchObject({
      status: "invalid",
      issues: [expect.objectContaining({ code: "multiple_customer_messages", toolCallId: "tu_reply_2" })],
    });
    expect(plan.communication).toBeUndefined();
  });

  it("re-prompts an exact-draft plan when no write or terminal tool was proposed", async () => {
    const injectedLogger = makeLogger();
    installAgentLogger(injectedLogger);
    mockCreate
      .mockResolvedValueOnce(singleToolUse("search_shopify_products", { query: "Pencil Half Zip" }, "tu_product"))
      .mockResolvedValueOnce(endTurn("The medium is available."))
      .mockResolvedValueOnce(singleToolUse("send_reply", { text: "The medium is available." }, "tu_reply"));

    const plan = await planAgent(makeCtx(), "Is the navy Pencil Half Zip available in medium?", AGENT_SETTINGS_DEFAULTS, {

    });

    expect(mockCreate).toHaveBeenCalledTimes(3);
    expect(plan.rawToolCalls.map((toolCall) => toolCall.name)).toEqual([
      "search_shopify_products",
      "send_reply",
    ]);
    expect(plan.communication).toMatchObject({ mode: "exact_draft", draft: "The medium is available." });
    expect(completeLogPayload(injectedLogger)).toMatchObject({ iterations: 3, reprompted: true });
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
      makeCtx({ thread: { ...makeCtx().thread, channelType: "operator" } }),
      "Look into this",
    );

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(completeLogPayload(injectedLogger)).toMatchObject({ reprompted: false });
  });
});
