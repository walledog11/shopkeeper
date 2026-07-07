import { describe, expect, it } from "vitest";
import { emptyIntents, type ClassifierIntents } from "./classifier-signals.js";
import type { AgentContext } from "./agent-context.js";
import type { RawToolCall } from "./types.js";
import {
  computeClassifierRouting,
  computeLegacyRouting,
} from "./planner-routing.js";
import { MUTATIVE_INTENT_NO_ACTION_WARNING } from "./planner-safety/index.js";

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
