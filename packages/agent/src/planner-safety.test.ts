import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import {
  hasAmbiguousCustomerSearchResult,
  hasCriticalPlanningReadErrorsForBlocks,
  sendReplyDeflectsToManagedChannels,
  sendReplyHasText,
  shouldBlockCreateRefundForAlreadyRefundedOrder,
  shouldEscalateFulfilledAddressChangeRequest,
  shouldEscalateFulfilledCancelRequest,
} from "./planner-safety/index.js";
import type { AgentContext } from "./agent-context.js";
import type { RawToolCall } from "./types.js";
import { emptyIntents, emptyRequestFacts, type RequestAsk } from "./classifier-signals.js";

function requestSignals(ask: RequestAsk, order: string | null = null) {
  return {
    version: 6, language: "en",
    intents: { ...emptyIntents(), mutative_request: true },
    requestFacts: { ...emptyRequestFacts(), ask, order },
  };
}

function makeCtx(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    orgId: "org_1",
    orgName: "Test Store",
    customer: { id: "customer_1", name: "Jane", platformId: "jane@test.com" },
    recentMessages: [{ senderType: "customer", contentText: "Please cancel order #1105 before it ships." }],
    openThreadCount: 1,
    shopify: { shop: "test-store.myshopify.com", accessToken: "shpat_test" },
    recentOrders: [],
    classifierSignals: requestSignals("cancel"),
    linkedShopifyCustomerName: null,
    kbArticles: [],
    merchantPreferences: [],
    thread: {
      id: "thread_1",
      status: "open",
      channelType: "email",
      tag: "Support",
      aiSummary: null,
      shopifyCustomerId: null,
      requestSourceMessageId: "current_message",
      latestCustomerMessageId: "current_message",
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
  it("does not substitute another order when the current request's named order is missing", () => {
    const ctx = makeCtx({
      classifierSignals: requestSignals("cancel", "#9999"),
      recentOrders: [{
        id: "9000001104", name: "#1104", created_at: null,
        financial_status: "paid", fulfillment_status: "fulfilled",
        total_price: "64.00", currency: "USD", items: [],
      }],
    });
    expect(shouldEscalateFulfilledCancelRequest(ctx)).toBe(false);
  });

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
    )).toBe(false);
  });
  // Found in the 2026-09-27 audit: any shipped order in the customer's history
  // escalated a cancellation of a different, unfulfilled one.
  it("judges the order the request names, not the customer's other orders", () => {
    const unfulfilled = {
      id: "9000001045",
      name: "#1045",
      created_at: null,
      financial_status: "paid",
      fulfillment_status: null,
      total_price: "40.00",
      currency: "USD",
      items: [],
    };
    const shipped = { ...unfulfilled, id: "9000001032", name: "#1032", fulfillment_status: "fulfilled" };

    expect(shouldEscalateFulfilledCancelRequest(
      makeCtx({
        recentMessages: [{ senderType: "customer", contentText: "Please cancel order #1045, wrong size." }],
        classifierSignals: requestSignals("cancel", "#1045"),
        recentOrders: [unfulfilled, shipped],
      }),
    )).toBe(false);
  });

  it("escalates when the plan proposes cancelling a fulfilled order the request did not name", () => {
    const orders = [
      {
        id: "9000001045",
        name: "#1045",
        created_at: null,
        financial_status: "paid",
        fulfillment_status: null,
        total_price: "40.00",
        currency: "USD",
        items: [],
      },
      {
        id: "9000001032",
        name: "#1032",
        created_at: null,
        financial_status: "paid",
        fulfillment_status: "fulfilled",
        total_price: "40.00",
        currency: "USD",
        items: [],
      },
    ];

    expect(shouldEscalateFulfilledCancelRequest(
      makeCtx({
        recentMessages: [{ senderType: "customer", contentText: "Please cancel my order." }],
        recentOrders: orders,
      }),
      [{ id: "cancel_1", name: "cancel_order", input: { order_id: "9000001032" } }],
    )).toBe(true);
  });
});

describe("shouldEscalateFulfilledAddressChangeRequest", () => {
  const fulfilledOrder = {
    id: "9000001031",
    name: "#1031",
    created_at: null,
    financial_status: "paid",
    fulfillment_status: "fulfilled",
    total_price: "120.00",
    currency: "USD",
    items: [],
  };

  it("detects an address redirect for a referenced fulfilled order", () => {
    const ctx = makeCtx({
      recentMessages: [{
        senderType: "customer",
        contentText: "I gave the wrong address for order #1031. Please redirect it.",
      }],
      recentOrders: [fulfilledOrder],
      classifierSignals: requestSignals("address_change", "#1031"),
    });

    expect(shouldEscalateFulfilledAddressChangeRequest(ctx)).toBe(true);
  });

  it("does not trigger for an unfulfilled order", () => {
    const ctx = makeCtx({
      recentMessages: [{ senderType: "customer", contentText: "Change address for order #1031." }],
      recentOrders: [{ ...fulfilledOrder, fulfillment_status: null }],
      classifierSignals: requestSignals("address_change", "#1031"),
    });

    expect(shouldEscalateFulfilledAddressChangeRequest(ctx)).toBe(false);
  });
});

describe("shouldBlockCreateRefundForAlreadyRefundedOrder", () => {
  it("detects create_refund when the referenced order is already refunded", () => {
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

    expect(shouldBlockCreateRefundForAlreadyRefundedOrder(ctx, calls)).toBe(true);
  });
});

describe("sendReplyHasText", () => {
  it("detects missing or blank reply text", () => {
    const calls: RawToolCall[] = [
      { id: "tu_empty", name: "send_reply", input: { text: "   " } },
      { id: "tu_ok", name: "send_reply", input: { text: "Standard shipping takes 3-5 business days." } },
    ];

    expect(sendReplyHasText(calls[1])).toBe(true);
    expect(sendReplyHasText(calls[0])).toBe(false);
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
