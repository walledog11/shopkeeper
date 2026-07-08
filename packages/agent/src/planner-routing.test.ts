import { describe, expect, it } from "vitest";
import { emptyIntents, type ClassifierIntents } from "./classifier-signals.js";
import type { AgentContext } from "./agent-context.js";
import type { RawToolCall } from "./types.js";
import {
  applyEscalationRouting,
  computeClassifierRouting,
  computeLegacyRouting,
  routePlan,
} from "./planner-routing.js";
import {
  CIRCULAR_CHANNEL_DEFLECTION_WARNING,
  MUTATIVE_INTENT_NO_ACTION_WARNING,
} from "./planner-safety/index.js";
import type Anthropic from "@anthropic-ai/sdk";

function intents(overrides: Partial<ClassifierIntents> = {}): ClassifierIntents {
  return { ...emptyIntents(), ...overrides };
}

function makeCtx(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    orgId: "org_1",
    orgName: "Test Store",
    customer: { id: "customer_1", name: "Jane", platformId: "jane@test.com" },
    recentMessages: [{ senderType: "customer", contentText: "Hello" }],
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

const reply: RawToolCall = { id: "tu_reply", name: "send_reply", input: { text: "Hi." } };
const refund: RawToolCall = { id: "tu_refund", name: "create_refund", input: { order_id: "1" } };
const escalate: RawToolCall = { id: "tu_esc", name: "escalate_to_human", input: { reason: "x" } };

describe("computeClassifierRouting", () => {
  it("escalates on any of the four escalation intents, listing which fired", () => {
    const out = computeClassifierRouting({
      intents: intents({ fraud_signals: true, out_of_scope_commercial: true }),
      rawToolCalls: [reply],
    });
    expect(out.decision).toBe("escalate");
    expect(out.signals).toEqual(["fraud_signals", "out_of_scope_commercial"]);
  });

  it("routes mutative intent with no action or escalation to needs_review", () => {
    const out = computeClassifierRouting({
      intents: intents({ mutative_request: true }),
      rawToolCalls: [reply],
    });
    expect(out.decision).toBe("needs_review");
    expect(out.signals).toEqual(["mutative_request"]);
    expect(out.warnings).toContain(MUTATIVE_INTENT_NO_ACTION_WARNING);
  });

  it("allows mutative intent through when the plan has an action tool", () => {
    const out = computeClassifierRouting({
      intents: intents({ mutative_request: true }),
      rawToolCalls: [refund, reply],
    });
    expect(out.decision).toBe("auto_execute");
  });

  it("routes an unanswered policy question to needs_review", () => {
    const out = computeClassifierRouting({
      intents: intents({ policy_question: true }),
      rawToolCalls: [],
    });
    expect(out.decision).toBe("needs_review");
    expect(out.signals).toEqual(["policy_question"]);
  });

  it("allows a policy question the plan answered with a reply", () => {
    const out = computeClassifierRouting({
      intents: intents({ policy_question: true }),
      rawToolCalls: [reply],
    });
    expect(out.decision).toBe("auto_execute");
  });

  it("escalation intents outrank a plan that already escalates", () => {
    const out = computeClassifierRouting({
      intents: intents({ contradiction: true }),
      rawToolCalls: [escalate],
    });
    expect(out.decision).toBe("escalate");
  });
});

describe("computeLegacyRouting", () => {
  it("escalates on prose fraud signals", () => {
    const out = computeLegacyRouting({
      ctx: makeCtx({
        recentMessages: [{
          senderType: "customer",
          contentText: "I never received order #1106 and need a refund sent to a different card right now.",
        }],
      }),
      instruction: "Reply to the customer.",
      rawToolCalls: [refund, reply],
    });
    expect(out.decision).toBe("escalate");
    expect(out.signals).toContain("fraud_signals");
  });

  it("routes a prose refund request with no action to needs_review", () => {
    const out = computeLegacyRouting({
      ctx: makeCtx({
        recentMessages: [{ senderType: "customer", contentText: "Please refund order #4003." }],
      }),
      instruction: "Reply to the customer.",
      rawToolCalls: [reply],
    });
    expect(out.decision).toBe("needs_review");
    expect(out.signals).toEqual(["mutative_request"]);
  });

  it("does not flag a refund request when the order is already fully refunded", () => {
    const out = computeLegacyRouting({
      ctx: makeCtx({
        recentMessages: [{ senderType: "customer", contentText: "Can I get a refund for order #1020?" }],
        recentOrders: [{
          id: "9000001020",
          name: "#1020",
          created_at: "2026-05-01T00:00:00Z",
          financial_status: "refunded",
          fulfillment_status: "fulfilled",
          total_price: "38.00",
          currency: "USD",
          items: [],
          shipping_address: null,
        }],
      }),
      instruction: "Reply to the customer.",
      rawToolCalls: [reply],
    });
    expect(out.decision).toBe("auto_execute");
  });
});

describe("regex vs classifier disagreement", () => {
  it("agrees with the classifier on an English refund request", () => {
    const ctx = makeCtx({
      recentMessages: [{ senderType: "customer", contentText: "Please refund order #4003." }],
    });
    const legacy = computeLegacyRouting({ ctx, instruction: "Reply.", rawToolCalls: [reply] });
    const classifier = computeClassifierRouting({
      intents: intents({ mutative_request: true }),
      rawToolCalls: [reply],
    });
    expect(legacy.decision).toBe("needs_review");
    expect(classifier.decision).toBe("needs_review");
  });

  it("classifier catches a non-English refund request the English regex misses", () => {
    // "Je voudrais un remboursement pour ma commande" — the classifier tags
    // mutative_request; the English regex families in intent.ts see nothing
    // actionable (no "refund"/"cancel"/"return" substring to trip on).
    const ctx = makeCtx({
      recentMessages: [{ senderType: "customer", contentText: "Bonjour, je voudrais un remboursement pour ma commande." }],
    });
    const legacy = computeLegacyRouting({ ctx, instruction: "Répondre au client.", rawToolCalls: [reply] });
    const classifier = computeClassifierRouting({
      intents: intents({ mutative_request: true }),
      rawToolCalls: [reply],
    });
    expect(legacy.decision).toBe("auto_execute");
    expect(classifier.decision).toBe("needs_review");
    expect(classifier.decision).not.toBe(legacy.decision);
  });
});

function readBlock(id: string, name: string): Anthropic.ToolUseBlock {
  return { type: "tool_use", id, name, input: {} } as Anthropic.ToolUseBlock;
}

function withSignals(overrides: Partial<ClassifierIntents>) {
  return { version: 2, language: "en", intents: intents(overrides) };
}

function baseRouteInput() {
  return {
    ctx: makeCtx(),
    instruction: "Reply to the customer.",
    rawToolCalls: [reply] as RawToolCall[],
    readBlocks: [] as Anthropic.ToolUseBlock[],
    readStatusMap: new Map<string, "ok" | "error">(),
    readResultsMap: new Map<string, string>(),
  };
}

describe("routePlan", () => {
  it("escalates a fulfilled-order cancellation with a templated reason", () => {
    const out = routePlan({
      ...baseRouteInput(),
      ctx: makeCtx({
        recentMessages: [{ senderType: "customer", contentText: "Please cancel order #1104." }],
        recentOrders: [{
          id: "9000001104",
          name: "#1104",
          created_at: "2026-05-01T00:00:00Z",
          financial_status: "paid",
          fulfillment_status: "fulfilled",
          total_price: "64.00",
          currency: "USD",
          items: [],
          shipping_address: null,
        }],
      }),
      instruction: "Reply about the cancellation.",
    });
    expect(out.decision).toBe("escalate");
    expect(out.signals).toEqual(["fulfilled_cancel"]);
    expect(out.escalationReason).toMatch(/fulfilled/i);
  });

  it("escalates when a customer search returned multiple matches", () => {
    const out = routePlan({
      ...baseRouteInput(),
      rawToolCalls: [],
      readBlocks: [readBlock("tu_s", "search_shopify_customers")],
      readResultsMap: new Map([["tu_s", JSON.stringify([{ customer_id: "1" }, { customer_id: "2" }])]]),
    });
    expect(out.decision).toBe("escalate");
    expect(out.signals).toEqual(["ambiguous_customer"]);
  });

  it("escalates on a critical order-lookup read error", () => {
    const out = routePlan({
      ...baseRouteInput(),
      readBlocks: [readBlock("tu_o", "get_order_by_name")],
      readStatusMap: new Map([["tu_o", "error"]]),
    });
    expect(out.decision).toBe("escalate");
    expect(out.signals).toEqual(["read_error"]);
  });

  it("escalates on a classifier fraud signal with a reason", () => {
    const out = routePlan({
      ...baseRouteInput(),
      ctx: makeCtx({ classifierSignals: withSignals({ fraud_signals: true }) }),
      rawToolCalls: [refund, reply],
    });
    expect(out.decision).toBe("escalate");
    expect(out.signals).toContain("fraud_signals");
    expect(out.escalationReason).toMatch(/fraud/i);
  });

  it("routes classifier mutative intent with no action to needs_review + warning", () => {
    const out = routePlan({
      ...baseRouteInput(),
      ctx: makeCtx({ classifierSignals: withSignals({ mutative_request: true }) }),
      rawToolCalls: [reply],
    });
    expect(out.decision).toBe("needs_review");
    expect(out.warnings).toContain(MUTATIVE_INTENT_NO_ACTION_WARNING);
  });

  it("routes an unanswered policy question to needs_review with a merchant question", () => {
    const out = routePlan({
      ...baseRouteInput(),
      ctx: makeCtx({
        classifierSignals: withSignals({ policy_question: true }),
        recentMessages: [{ senderType: "customer", contentText: "Do you ship to Canada?" }],
      }),
      rawToolCalls: [],
    });
    expect(out.decision).toBe("needs_review");
    expect(out.signals).toContain("policy_question");
    expect(out.question).toContain("Canada");
  });

  it("flags a channel-deflection reply as needs_review without editing tool calls", () => {
    const deflect: RawToolCall = { id: "tu_reply", name: "send_reply", input: { text: "Please DM us on Instagram." } };
    const out = routePlan({
      ...baseRouteInput(),
      ctx: makeCtx({ classifierSignals: withSignals({}) }),
      rawToolCalls: [deflect],
    });
    expect(out.decision).toBe("needs_review");
    expect(out.signals).toContain("channel_deflection");
    expect(out.warnings).toContain(CIRCULAR_CHANNEL_DEFLECTION_WARNING);
  });

  it("auto-executes a clean reply with no signals firing", () => {
    const out = routePlan({
      ...baseRouteInput(),
      ctx: makeCtx({ classifierSignals: withSignals({}) }),
      rawToolCalls: [reply],
    });
    expect(out.decision).toBe("auto_execute");
  });

  it("falls back to legacy regex routing when no classifier signals are present", () => {
    const out = routePlan({
      ...baseRouteInput(),
      ctx: makeCtx({ recentMessages: [{ senderType: "customer", contentText: "Please refund order #4003." }] }),
      rawToolCalls: [reply],
    });
    expect(out.decision).toBe("needs_review");
    expect(out.signals).toEqual(["mutative_request"]);
  });
});

describe("applyEscalationRouting", () => {
  it("keeps reads and terminates with a single escalate_to_human", () => {
    const calls: RawToolCall[] = [
      { id: "tu_read", name: "get_order_by_name", input: {} },
      { id: "tu_reply", name: "send_reply", input: { text: "Hi." } },
      { id: "tu_refund", name: "create_refund", input: {} },
    ];
    const out = applyEscalationRouting(calls, "Needs a human.");
    expect(out.map((call) => call.name)).toEqual(["get_order_by_name", "escalate_to_human"]);
    expect(out[1].input).toMatchObject({ reason: "Needs a human." });
  });

  it("preserves a model-elected escalate_to_human call", () => {
    const out = applyEscalationRouting([escalate], "templated reason");
    expect(out).toEqual([escalate]);
  });
});
