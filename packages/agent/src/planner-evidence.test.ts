import { describe, expect, it } from "vitest";
import type { AgentContext } from "./agent-context.js";
import { emptyIntents, emptyRequestFacts } from "./classifier-signals.js";
import { buildPlanRoutingEvidence } from "./planner-evidence.js";
import { resolveAgentSettings } from "./settings.js";

function context(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    orgId: "org",
    orgName: "Store",
    recentMessages: [{ senderType: "customer", contentText: "Can I buy 10,000 units wholesale?" }],
    shopify: null,
    escalate: async () => undefined,
    thread: {
      id: "thread",
      status: "open",
      channelType: "email",
      tag: null,
      aiSummary: null,
      shopifyCustomerId: null,
      requestSourceMessageId: "message_1",
      latestCustomerMessageId: "message_1",
    },
    customer: { id: "customer", name: null, platformId: "x@example.com" },
    openThreadCount: 1,
    recentOrders: [],
    linkedShopifyCustomerName: null,
    kbArticles: [],
    classifierSignals: {
      version: 2,
      language: "en",
      intents: { ...emptyIntents(), out_of_scope_commercial: true },
      requestFacts: emptyRequestFacts(),
    },
    ...overrides,
  };
}

function build(ctx: AgentContext) {
  return buildPlanRoutingEvidence({
    ctx,
    instruction: "Handle it",
    rawToolCalls: [{ id: "reply", name: "send_reply", input: { text: "Hello." } }],
    readBlocks: [],
    readStatusMap: new Map(),
    readResultsMap: new Map(),
  }).evidence;
}

describe("buildPlanRoutingEvidence", () => {
  it("persists closed typed evidence for aligned classifier facts", () => {
    expect(build(context())).toMatchObject({
      classifierState: "aligned",
      codes: ["out_of_scope_commercial_request"],
    });
  });

  it("fails closed when classifier evidence is missing or stale", () => {
    expect(build(context({ classifierSignals: null }))).toMatchObject({
      classifierState: "missing",
      codes: ["classifier_unavailable"],
    });
    expect(build(context({
      thread: {
        ...context().thread,
        requestSourceMessageId: "message_1",
        latestCustomerMessageId: "message_2",
      },
    }))).toMatchObject({
      classifierState: "unaligned",
      codes: ["classifier_unaligned"],
    });
  });

  it("records already-refunded requests as structural escalation evidence", () => {
    const ctx = context({
      recentMessages: [{ senderType: "customer", contentText: "Refund order #1020." }],
      recentOrders: [{
        id: "9000001020",
        name: "#1020",
        created_at: "2026-05-08T16:00:00Z",
        financial_status: "refunded",
        fulfillment_status: "fulfilled",
        total_price: "38.00",
        currency: "USD",
        items: [],
      }],
      classifierSignals: {
        version: 2,
        language: "en",
        intents: { ...emptyIntents(), mutative_request: true },
        requestFacts: emptyRequestFacts(),
      },
    });
    expect(build(ctx)).toMatchObject({
      codes: ["already_refunded_request"],
    });
  });

  it("records planned compensation above the resolved cap", () => {
    const ctx = context({
      recentMessages: [{ senderType: "customer", contentText: "Refund $200 on order #1012." }],
      recentOrders: [{
        id: "9000001012",
        name: "#1012",
        created_at: "2026-05-10T16:00:00Z",
        financial_status: "paid",
        fulfillment_status: "fulfilled",
        total_price: "200.00",
        currency: "USD",
        items: [],
      }],
      classifierSignals: {
        version: 2,
        language: "en",
        intents: { ...emptyIntents(), mutative_request: true },
        requestFacts: emptyRequestFacts(),
      },
    });
    const evidence = buildPlanRoutingEvidence({
      ctx,
      instruction: "Handle it",
      rawToolCalls: [{
        id: "refund",
        name: "create_refund",
        input: { order_id: "9000001012", amount: "200.00", currency: "USD", reason: "Damaged" },
      }],
      readBlocks: [],
      readStatusMap: new Map(),
      readResultsMap: new Map(),
      settings: resolveAgentSettings({ maxRefundAmount: 50 }),
    }).evidence;
    expect(evidence).toMatchObject({ codes: ["compensation_over_cap"] });
  });
});
