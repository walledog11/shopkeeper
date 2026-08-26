import { describe, expect, it } from "vitest";
import type { AgentContext } from "./agent-context.js";
import { validatePlan } from "./plan-validation.js";
import type { RawToolCall } from "./types.js";

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
    merchantPreferences: [],
    thread: {
      id: "thread_1",
      status: "open",
      channelType: "email",
      tag: "Support",
      aiSummary: null,
      shopifyCustomerId: "customer_1",
    },
    escalate: async () => undefined,
    ...overrides,
  };
}

function codes(result: ReturnType<typeof validatePlan>) {
  return result.issues.map((entry) => entry.code);
}

describe("validatePlan", () => {
  it("accepts a well-formed plan", () => {
    expect(validatePlan({
      ctx: makeCtx(),
      instruction: "Reply",
      rawToolCalls: [{ id: "reply_1", name: "send_reply", input: { text: "Hello." } }],
    })).toEqual({ status: "valid", issues: [] });
  });

  it("reports invalid input and duplicate ids without editing the proposal", () => {
    const calls: RawToolCall[] = [
      { id: "same", name: "send_reply", input: { text: "   " } },
      { id: "same", name: "send_reply", input: { text: "Hello." } },
    ];
    const before = structuredClone(calls);
    const result = validatePlan({ ctx: makeCtx(), instruction: "Reply", rawToolCalls: calls });

    expect(codes(result)).toEqual(["invalid_tool_input", "duplicate_tool_call_id"]);
    expect(calls).toEqual(before);
  });

  it("invalidates an already-refunded action and an orphan note", () => {
    const refundedOrder = {
      id: "9000001020",
      name: "#1020",
      created_at: null,
      financial_status: "refunded",
      fulfillment_status: "fulfilled",
      total_price: "38.00",
      currency: "USD",
      items: [],
    };
    const refund = validatePlan({
      ctx: makeCtx({
        recentMessages: [{ senderType: "customer", contentText: "Refund order #1020" }],
        recentOrders: [refundedOrder],
      }),
      instruction: "Refund order #1020",
      rawToolCalls: [{
        id: "refund_1",
        name: "create_refund",
        input: { order_id: refundedOrder.id, amount: "38.00" },
      }],
    });
    expect(codes(refund)).toContain("already_refunded_action");

    const note = validatePlan({
      ctx: makeCtx(),
      instruction: "Reply",
      rawToolCalls: [
        { id: "reply_1", name: "send_reply", input: { text: "Hello." } },
        { id: "note_1", name: "add_internal_note", input: { text: "Customer wrote in." } },
      ],
    });
    expect(codes(note)).toEqual(["orphan_internal_note"]);
  });

  it("turns grounding failures into validation issues without rewriting prose", () => {
    const calls: RawToolCall[] = [
      { id: "reply_1", name: "send_reply", input: { text: "I've issued the refund." } },
      { id: "escalate_1", name: "escalate_to_human", input: { reason: "I've issued the refund, but need help." } },
    ];
    const before = structuredClone(calls);
    const result = validatePlan({ ctx: makeCtx(), instruction: "Refund", rawToolCalls: calls });

    expect(codes(result)).toEqual([
      "ungrounded_escalation_reason",
      "ungrounded_customer_reply",
    ]);
    expect(calls).toEqual(before);
  });
});
