import { describe, expect, it } from "vitest";
import { emptyIntents, type ClassifierIntents } from "./classifier-signals.js";
import type { AgentContext } from "./agent-context.js";
import type { RawToolCall } from "./types.js";
import {
  applyEscalationRouting,
  computeClassifierRouting,
  groundEscalationReasons,
  UNGROUNDED_ESCALATION_REASON,
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

  it("escalates an address change for a fulfilled order even when the model only replied", () => {
    const out = routePlan({
      ...baseRouteInput(),
      ctx: makeCtx({
        classifierSignals: withSignals({ mutative_request: true }),
        recentMessages: [{
          senderType: "customer",
          contentText: "I gave the wrong address for order #1031. Please redirect it.",
        }],
        recentOrders: [{
          id: "9000001031",
          name: "#1031",
          created_at: "2026-05-01T00:00:00Z",
          financial_status: "paid",
          fulfillment_status: "fulfilled",
          total_price: "120.00",
          currency: "USD",
          items: [],
          shipping_address: null,
        }],
      }),
      rawToolCalls: [reply],
    });

    expect(out.decision).toBe("escalate");
    expect(out.signals).toEqual(["fulfilled_address_change"]);
    expect(out.escalationReason).toMatch(/already-fulfilled/i);
  });

  it("escalates an already-refunded order even when the model only drafted a reply", () => {
    const out = routePlan({
      ...baseRouteInput(),
      ctx: makeCtx({
        classifierSignals: withSignals({ mutative_request: true }),
        recentMessages: [{ senderType: "customer", contentText: "Refund order #1020." }],
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
      instruction: "Reply about the refund request.",
      rawToolCalls: [reply],
    });
    expect(out.decision).toBe("escalate");
    expect(out.signals).toEqual(["already_refunded"]);
    expect(out.escalationReason).toMatch(/already fully refunded/i);
  });

  it("escalates a refund action against an order that is not paid", () => {
    const out = routePlan({
      ...baseRouteInput(),
      ctx: makeCtx({
        classifierSignals: withSignals({ mutative_request: true }),
        recentMessages: [{ senderType: "customer", contentText: "Refund order #1010." }],
        recentOrders: [{
          id: "9000001010",
          name: "#1010",
          created_at: "2026-05-01T00:00:00Z",
          financial_status: "authorized",
          fulfillment_status: null,
          total_price: "42.00",
          currency: "USD",
          items: [],
          shipping_address: null,
        }],
      }),
      instruction: "Handle the refund request.",
      rawToolCalls: [
        { id: "tu_refund", name: "create_refund", input: { order_id: "9000001010", amount: "42.00" } },
        reply,
      ],
    });

    expect(out.decision).toBe("escalate");
    expect(out.signals).toEqual(["non_paid_refund"]);
    expect(out.escalationReason).toMatch(/not in the paid state/i);
  });

  it("escalates a compensation request when the model only drafted a holding reply", () => {
    const out = routePlan({
      ...baseRouteInput(),
      ctx: makeCtx({
        classifierSignals: withSignals({ mutative_request: true }),
        recentMessages: [{ senderType: "customer", contentText: "I'm unhappy. Just refund me." }],
      }),
      rawToolCalls: [reply],
    });
    expect(out.decision).toBe("escalate");
    expect(out.signals).toEqual(["compensation_exception"]);
  });

  it("escalates a gift-card request with no safe action", () => {
    const out = routePlan({
      ...baseRouteInput(),
      ctx: makeCtx({
        classifierSignals: withSignals({ mutative_request: true }),
        recentMessages: [{
          senderType: "customer",
          contentText: "Please send me a gift card for the damaged mug.",
        }],
      }),
      rawToolCalls: [reply],
    });
    expect(out.decision).toBe("escalate");
    expect(out.signals).toEqual(["compensation_exception"]);
  });

  it("does not treat an informational refund-policy question as compensation", () => {
    const out = routePlan({
      ...baseRouteInput(),
      ctx: makeCtx({
        classifierSignals: withSignals({ policy_question: true }),
        recentMessages: [{
          senderType: "customer",
          contentText: "Can I send an unworn item back for a refund?",
        }],
      }),
      rawToolCalls: [reply],
    });
    expect(out.decision).toBe("auto_execute");
  });

  it("keeps an exchange action when the customer offered refund or exchange", () => {
    const exchange: RawToolCall = {
      id: "tu_exchange",
      name: "create_exchange",
      input: { order_id: "6060", variant_id: "old", exchange_variant_id: "new" },
    };
    const out = routePlan({
      ...baseRouteInput(),
      ctx: makeCtx({
        classifierSignals: withSignals({ mutative_request: true }),
        recentMessages: [{
          senderType: "customer",
          contentText: "Could I get a refund, or swap it for a large if that's easier?",
        }],
      }),
      rawToolCalls: [exchange, reply],
    });
    expect(out.decision).toBe("auto_execute");
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

  it("routes an ungrounded KB reply to needs_review with a merchant question", () => {
    const kbBlock = readBlock("tu_kb", "search_kb");
    const out = routePlan({
      ...baseRouteInput(),
      ctx: makeCtx({
        classifierSignals: withSignals({}),
        recentMessages: [{
          senderType: "customer",
          contentText: "Any tips for making my candle burn evenly?",
        }],
      }),
      rawToolCalls: [reply],
      readBlocks: [kbBlock],
      readStatusMap: new Map([["tu_kb", "not_found"]]),
    });
    expect(out.decision).toBe("needs_review");
    expect(out.signals).toContain("kb_miss");
    expect(out.question).toContain("candle burn evenly");
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

  it("keeps the reply ahead of the escalation for a guest", () => {
    const calls: RawToolCall[] = [
      { id: "tu_kb", name: "search_kb", input: {} },
      { id: "tu_reply", name: "send_reply", input: { text: "I can't see order details here." } },
    ];
    const out = applyEscalationRouting(calls, "Needs a human.", { keepReply: true });
    expect(out.map((call) => call.name)).toEqual(["search_kb", "send_reply", "escalate_to_human"]);
  });

  it("keeps the reply ahead of a model-elected escalation for a guest", () => {
    const reply: RawToolCall = { id: "tu_reply", name: "send_reply", input: { text: "Hi." } };
    const out = applyEscalationRouting([escalate, reply], "templated reason", { keepReply: true });
    expect(out.map((call) => call.name)).toEqual(["send_reply", "escalate_to_human"]);
  });

  it("still drops mutations for a guest", () => {
    const calls: RawToolCall[] = [
      { id: "tu_reply", name: "send_reply", input: { text: "Hi." } },
      { id: "tu_refund", name: "create_refund", input: {} },
    ];
    const out = applyEscalationRouting(calls, "Needs a human.", { keepReply: true });
    expect(out.map((call) => call.name)).toEqual(["send_reply", "escalate_to_human"]);
  });

  it("drops the reply when keepReply is not set", () => {
    const calls: RawToolCall[] = [
      { id: "tu_reply", name: "send_reply", input: { text: "Hi." } },
    ];
    expect(applyEscalationRouting(calls, "r", {}).map((call) => call.name)).toEqual([
      "escalate_to_human",
    ]);
    expect(applyEscalationRouting(calls, "r", { keepReply: false }).map((call) => call.name)).toEqual(
      ["escalate_to_human"],
    );
  });
});

describe("groundEscalationReasons", () => {
  const log = { orgId: "org_1", threadId: "thread_1" };
  const reads: RawToolCall[] = [{ id: "tu_read", name: "get_order_by_name", input: {} }];

  function escalateWith(reason: string): RawToolCall {
    return { id: "tu_escalate", name: "escalate_to_human", input: { reason } };
  }

  function reasonOf(calls: RawToolCall[]): string {
    const call = calls.find((entry) => entry.name === "escalate_to_human");
    return (call?.input as { reason: string }).reason;
  }

  it("drops the claim the 2026-08-19 storefront run sent to the merchant", () => {
    const out = groundEscalationReasons(
      [...reads, escalateWith("A return has been initiated for this order, but the refund needs your approval.")],
      log,
    );
    expect(reasonOf(out)).toBe(UNGROUNDED_ESCALATION_REASON);
  });

  it("drops a first-person completion claim", () => {
    const out = groundEscalationReasons([...reads, escalateWith("I've issued the refund — the rest is yours.")], log);
    expect(reasonOf(out)).toBe(UNGROUNDED_ESCALATION_REASON);
  });

  it("keeps a claim the plan's own action call supports", () => {
    const reason = "A return has been initiated, but the exchange needs your call.";
    const out = groundEscalationReasons(
      [...reads, { id: "tu_return", name: "create_return", input: {} }, escalateWith(reason)],
      log,
    );
    expect(reasonOf(out)).toBe(reason);
  });

  it("keeps a claim attributed to the customer", () => {
    const reason = "Customer says they already returned the item, but no return exists on the order.";
    const out = groundEscalationReasons([...reads, escalateWith(reason)], log);
    expect(reasonOf(out)).toBe(reason);
  });

  it("keeps a reason that asserts no completed mutation", () => {
    const reason = "Wholesale pricing question — out of scope for automated support.";
    const out = groundEscalationReasons([...reads, escalateWith(reason)], log);
    expect(reasonOf(out)).toBe(reason);
  });

  it("keeps the router's own templated reasons", () => {
    const reason = "Refund requested for an order that is already fully refunded — needs human review.";
    const out = groundEscalationReasons([...reads, escalateWith(reason)], log);
    expect(reasonOf(out)).toBe(reason);
  });

  it("leaves a plan with no escalation untouched", () => {
    const calls: RawToolCall[] = [...reads, { id: "tu_reply", name: "send_reply", input: { text: "Hi." } }];
    expect(groundEscalationReasons(calls, log)).toEqual(calls);
  });
});
