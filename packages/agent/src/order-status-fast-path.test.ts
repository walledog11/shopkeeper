import { describe, expect, it } from "vitest";
import { tryPlanOrderStatusFastPath } from "./order-status-fast-path.js";
import type { AgentContext, ShopifyOrderSummary } from "./agent-context.js";

function makeOrder(overrides: Partial<ShopifyOrderSummary> = {}): ShopifyOrderSummary {
  return {
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
    ...overrides,
  };
}

function makeCtx(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    orgId: "org_1",
    orgName: "Test Store",
    customer: { id: "customer_1", name: "Jane Doe", platformId: "jane@example.com" },
    recentMessages: [{ senderType: "customer", contentText: "Hi, where is my order #1001?" }],
    openThreadCount: 1,
    pastTickets: [],
    shopify: { shop: "test-store.myshopify.com", accessToken: "shpat_test" },
    recentOrders: [makeOrder()],
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
    escalate: async () => {},
    io: {
      addInternalNote: async () => ({ ok: true }),
      sendReply: async () => ({ ok: true }),
      sendEmail: async () => ({ ok: true }),
      updateThreadStatus: async () => ({ ok: true }),
      updateThreadTag: async () => ({ ok: true }),
    },
    ...overrides,
  };
}

describe("tryPlanOrderStatusFastPath", () => {
  it("returns a templated send_reply plan for WISMO with orders in context", () => {
    const plan = tryPlanOrderStatusFastPath(makeCtx(), "Reply to the customer about their order.");

    expect(plan).not.toBeNull();
    expect(plan?.orderStatusFastPath).toBe(true);
    expect(plan?.rawToolCalls.map((toolCall) => toolCall.name)).toEqual(["send_reply"]);
    expect(plan?.steps.map((step) => step.tool)).toEqual(["send_reply"]);
    const replyText = String((plan?.rawToolCalls[0]?.input as { text?: string }).text ?? "");
    expect(replyText).toContain("1001");
    expect(replyText).toContain("fulfilled");
  });

  it("skips operator channels", () => {
    const plan = tryPlanOrderStatusFastPath(
      makeCtx({ thread: { ...makeCtx().thread, channelType: "dashboard_agent" } }),
      "Where is Jane's order?",
    );
    expect(plan).toBeNull();
  });

  it("skips when no recent orders are in context", () => {
    const plan = tryPlanOrderStatusFastPath(makeCtx({ recentOrders: [] }), "Reply about order status.");
    expect(plan).toBeNull();
  });

  it("skips when brand voice is configured", () => {
    const plan = tryPlanOrderStatusFastPath(
      makeCtx(),
      "Reply to the customer about their order.",
      {
        brandVoice: "Sound warm and concise.",
      },
    );

    expect(plan).toBeNull();
  });

  it("skips when sample replies are configured", () => {
    const plan = tryPlanOrderStatusFastPath(
      makeCtx(),
      "Reply to the customer about their order.",
      {
        sampleReplies: ["Hang tight - we are checking the latest tracking now."],
      },
    );

    expect(plan).toBeNull();
  });

  it("skips mutative customer messages", () => {
    const plan = tryPlanOrderStatusFastPath(
      makeCtx({
        recentMessages: [{ senderType: "customer", contentText: "Please refund my order #1001." }],
      }),
      "Reply to the customer about their order.",
    );
    expect(plan).toBeNull();
  });

  it("uses the most recent order when no order number is referenced", () => {
    const recent = makeOrder({ id: "9000000005", name: "#1005" });
    const older = makeOrder({ id: "9000000004", name: "#1004", created_at: "2026-04-10T11:00:00-07:00" });
    const plan = tryPlanOrderStatusFastPath(
      makeCtx({
        recentOrders: [recent, older],
        recentMessages: [{ senderType: "customer", contentText: "Hey, where is my recent order?" }],
      }),
      "Reply to the customer about their recent order.",
    );

    const replyText = String((plan?.rawToolCalls[0]?.input as { text?: string }).text ?? "");
    expect(replyText).toContain("1005");
    expect(replyText).not.toContain("1004");
  });

  it("skips when the referenced order is not in context", () => {
    const plan = tryPlanOrderStatusFastPath(
      makeCtx({
        recentMessages: [{ senderType: "customer", contentText: "Where is order #9999?" }],
      }),
      "Reply about order #9999.",
    );
    expect(plan).toBeNull();
  });

  it("describes unfulfilled orders without tracking lookups", () => {
    const plan = tryPlanOrderStatusFastPath(
      makeCtx({
        recentOrders: [makeOrder({
          name: "#1003",
          fulfillment_status: null,
        })],
        recentMessages: [{ senderType: "customer", contentText: "Has my order shipped yet?" }],
      }),
      "Reply about whether the order has shipped.",
    );

    const replyText = String((plan?.rawToolCalls[0]?.input as { text?: string }).text ?? "");
    expect(replyText.toLowerCase()).toContain("has not shipped");
  });
});
