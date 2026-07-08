import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import {
  hasAmbiguousCustomerSearchResult,
  hasCriticalPlanningReadErrorsForBlocks,
  sendReplyDeflectsToManagedChannels,
  sendReplyHasText,
  shouldBlockCreateRefundForAlreadyRefundedOrder,
  shouldEscalateFulfilledCancelRequest,
  stripCreateRefundForAlreadyRefundedOrders,
  stripEmptySendReplyToolCalls,
} from "./planner-safety/index.js";
import type { AgentContext } from "./agent-context.js";
import type { RawToolCall } from "./types.js";

function makeCtx(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    orgId: "org_1",
    orgName: "Test Store",
    customer: { id: "customer_1", name: "Jane", platformId: "jane@test.com" },
    recentMessages: [{ senderType: "customer", contentText: "Please cancel order #1105 before it ships." }],
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

  it("does not escalate when no order is fulfilled", () => {
    expect(shouldEscalateFulfilledCancelRequest(
      makeCtx({
        recentMessages: [{ senderType: "customer", contentText: "Please cancel order #1104." }],
        recentOrders: [{
          id: "9000001104",
          name: "#1104",
          created_at: null,
          financial_status: "paid",
          fulfillment_status: null,
          total_price: "64.00",
          currency: "USD",
          items: [],
        }],
      }),
      "Reply to the customer about their cancellation request.",
    )).toBe(false);
  });
});

describe("stripCreateRefundForAlreadyRefundedOrders", () => {
  it("removes create_refund when the referenced order is already refunded", () => {
    const ctx = makeCtx({
      recentMessages: [{ senderType: "customer", contentText: "Can I get a refund for order #1020?" }],
      recentOrders: [{
        id: "9000001020",
        name: "#1020",
        created_at: null,
        financial_status: "refunded",
        fulfillment_status: "fulfilled",
        total_price: "38.00",
        currency: "USD",
        items: [],
      }],
    });
    const calls: RawToolCall[] = [
      { id: "tu_refund", name: "create_refund", input: { order_id: "9000001020", amount: "38.00" } },
      { id: "tu_reply", name: "send_reply", input: { text: "Already refunded." } },
    ];

    expect(shouldBlockCreateRefundForAlreadyRefundedOrder(ctx, "Reply to the customer.", calls)).toBe(true);
    expect(stripCreateRefundForAlreadyRefundedOrders(ctx, "Reply to the customer.", calls).map((call) => call.name)).toEqual([
      "send_reply",
    ]);
  });
});

describe("stripEmptySendReplyToolCalls", () => {
  it("removes send_reply calls with missing or blank text", () => {
    const calls: RawToolCall[] = [
      { id: "tu_empty", name: "send_reply", input: { text: "   " } },
      { id: "tu_ok", name: "send_reply", input: { text: "Standard shipping takes 3-5 business days." } },
    ];

    expect(sendReplyHasText(calls[1])).toBe(true);
    expect(stripEmptySendReplyToolCalls(calls).map((call) => call.id)).toEqual(["tu_ok"]);
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

describe("hasAmbiguousCustomerSearchResult", () => {
  it("detects more than one matching customer", () => {
    const blocks = [
      { type: "tool_use", id: "tu_search", name: "search_shopify_customers", input: { query: "Jane" } },
    ] as unknown as Anthropic.ToolUseBlock[];

    expect(hasAmbiguousCustomerSearchResult(blocks, new Map([["tu_search", JSON.stringify([
      { customer_id: "1", name: "Jane Smith" },
      { customer_id: "2", name: "Jane Smith" },
    ])]]))).toBe(true);

    expect(hasAmbiguousCustomerSearchResult(blocks, new Map([["tu_search", JSON.stringify([
      { customer_id: "1", name: "Jane Smith" },
    ])]]))).toBe(false);
  });
});

describe("sendReplyDeflectsToManagedChannels", () => {
  it("detects managed-channel deflection in send_reply drafts", () => {
    const deflecting: RawToolCall = {
      id: "tu_reply",
      name: "send_reply",
      input: {
        text: "Reach out to support@palettegarments.com or DM @palette.garments on Instagram.",
      },
    };
    expect(sendReplyDeflectsToManagedChannels(deflecting)).toBe(true);
    expect(sendReplyDeflectsToManagedChannels({
      id: "tu_ok",
      name: "send_reply",
      input: { text: "Yes, we ship to Canada for a $15 flat rate." },
    })).toBe(false);
  });
});
