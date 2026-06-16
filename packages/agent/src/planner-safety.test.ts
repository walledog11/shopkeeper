import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import {
  hasCriticalPlanningReadErrorsForBlocks,
  shouldEscalateFulfilledCancelRequest,
  shouldForcePlanningEscalation,
  stripNonEscalationTerminalTools,
} from "./planner-safety.js";
import type { AgentContext } from "./agent-context.js";
import type { RawToolCall } from "./types.js";

function makeCtx(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    orgId: "org_1",
    orgName: "Test Store",
    customer: { id: "customer_1", name: "Jane", platformId: "jane@test.com" },
    recentMessages: [{ senderType: "customer", contentText: "Please cancel order #1105 before it ships." }],
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
      shopifyCustomerId: null,
    },
    escalate: async () => {},
    io: {
      addInternalNote: async () => ({ status: "ok", message: "ok" }),
      sendReply: async () => ({ status: "ok", message: "ok" }),
      sendEmail: async () => ({ status: "ok", message: "ok" }),
      updateThreadStatus: async () => ({ status: "ok", message: "ok" }),
      updateThreadTag: async () => ({ status: "ok", message: "ok" }),
    },
    ...overrides,
  };
}

describe("shouldEscalateFulfilledCancelRequest", () => {
  it("detects cancel requests against fulfilled orders in context", () => {
    expect(shouldEscalateFulfilledCancelRequest(
      makeCtx({
        recentMessages: [{ senderType: "customer", contentText: "Please cancel order #1104." }],
        recentOrders: [{
          id: "9000001104",
          name: "#1104",
          created_at: null,
          financial_status: "paid",
          fulfillment_status: "fulfilled",
          total_price: "64.00",
          currency: "USD",
          items: [],
        }],
      }),
      "Reply to the customer about their cancellation request.",
    )).toBe(true);
  });
});

describe("shouldForcePlanningEscalation", () => {
  it("forces escalation for contradictory customer instructions", () => {
    expect(shouldForcePlanningEscalation({
      ctx: makeCtx({
        recentMessages: [{
          senderType: "customer",
          contentText: "Cancel order #1103. Actually change the address. Wait, refund me but still send it.",
        }],
      }),
      instruction: "Reply to the customer about their request.",
      rawToolCalls: [{ id: "tu_1", name: "send_reply", input: { text: "Got it." } }],
      readBlocks: [],
      readStatusMap: new Map(),
      readResultsMap: new Map(),
      operatorMode: false,
    })).toBe(true);
  });

  it("forces escalation when order lookups fail on a mutative request", () => {
    const readBlocks = [
      { type: "tool_use", id: "tu_read", name: "get_order_by_name", input: { order_name: "#1105" } },
    ] as unknown as Anthropic.ToolUseBlock[];

    expect(shouldForcePlanningEscalation({
      ctx: makeCtx(),
      instruction: "Reply to the customer about their cancellation request.",
      rawToolCalls: [{ id: "tu_2", name: "send_reply", input: { text: "Cancelled." } }],
      readBlocks,
      readStatusMap: new Map([["tu_read", "error"]]),
      readResultsMap: new Map([["tu_read", "Error: failed"]]),
      operatorMode: false,
    })).toBe(true);
  });

  it("forces escalation when customer search returns multiple matches", () => {
    const readBlocks = [
      { type: "tool_use", id: "tu_search", name: "search_shopify_customers", input: { query: "Jane Smith" } },
    ] as unknown as Anthropic.ToolUseBlock[];

    expect(shouldForcePlanningEscalation({
      ctx: makeCtx(),
      instruction: "Reply to the customer about their cancellation request.",
      rawToolCalls: [],
      readBlocks,
      readStatusMap: new Map([["tu_search", "ok"]]),
      readResultsMap: new Map([["tu_search", JSON.stringify([
        { customer_id: "1", name: "Jane Smith", email: "a@example.com" },
        { customer_id: "2", name: "Jane Smith", email: "b@example.com" },
      ])]]),
      operatorMode: false,
    })).toBe(true);
  });

  it("forces escalation for watch-tier mutative requests", () => {
    expect(shouldForcePlanningEscalation({
      ctx: makeCtx({
        recentMessages: [{ senderType: "customer", contentText: "Please refund order #4001." }],
      }),
      instruction: "Reply to the customer and process their refund request.",
      rawToolCalls: [],
      readBlocks: [],
      readStatusMap: new Map(),
      readResultsMap: new Map(),
      settings: { autonomyTier: "watch" },
      operatorMode: false,
    })).toBe(true);
  });

  it("does not force escalation when an order lookup error is irrelevant context", () => {
    const readBlocks = [
      { type: "tool_use", id: "tu_read", name: "search_kb", input: { query: "shipping" } },
    ] as unknown as Anthropic.ToolUseBlock[];

    expect(shouldForcePlanningEscalation({
      ctx: makeCtx({
        recentOrders: [{
          id: "1",
          name: "#1105",
          created_at: null,
          financial_status: "paid",
          fulfillment_status: null,
          total_price: "10",
          currency: "USD",
          items: [],
        }],
      }),
      instruction: "Reply about shipping times.",
      rawToolCalls: [],
      readBlocks,
      readStatusMap: new Map([["tu_read", "error"]]),
      readResultsMap: new Map(),
      operatorMode: false,
    })).toBe(false);
  });
});

describe("stripNonEscalationTerminalTools", () => {
  it("removes send_reply and mutative tools while keeping reads", () => {
    const calls: RawToolCall[] = [
      { id: "tu_read", name: "get_order_by_name", input: {} },
      { id: "tu_cancel", name: "cancel_order", input: {} },
      { id: "tu_reply", name: "send_reply", input: { text: "Done." } },
    ];

    expect(stripNonEscalationTerminalTools(calls).map((call) => call.name)).toEqual([
      "get_order_by_name",
    ]);
  });
});

describe("hasCriticalPlanningReadErrorsForBlocks", () => {
  it("detects lookup-tool errors only", () => {
    const blocks = [
      { type: "tool_use", id: "tu_order", name: "get_order_by_name", input: {} },
      { type: "tool_use", id: "tu_kb", name: "search_kb", input: {} },
    ] as unknown as Anthropic.ToolUseBlock[];

    expect(hasCriticalPlanningReadErrorsForBlocks(blocks, new Map([
      ["tu_order", "error"],
      ["tu_kb", "ok"],
    ]))).toBe(true);

    expect(hasCriticalPlanningReadErrorsForBlocks(blocks, new Map([
      ["tu_kb", "error"],
    ]))).toBe(false);
  });
});
