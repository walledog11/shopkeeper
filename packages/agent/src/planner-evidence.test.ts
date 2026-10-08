import { describe, expect, it } from "vitest";
import type { AgentContext } from "./agent-context.js";
import { emptyIntents, emptyRequestFacts } from "./classifier-signals.js";
import { damageEvidenceState } from "./damage-evidence.js";
import { buildPlanSignals } from "./plan-signals.js";
import { buildPlanRoutingEvidence, completesAtMerchantFollowUp, kbMissNeedsMerchant } from "./planner-evidence.js";
import { appendInitialPlanningSignals } from "./planner-read-tools.js";
import { resolveAgentSettings } from "./settings.js";
import type { ProducedPlanSignalCode, RawToolCall } from "./types.js";

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
    merchantPreferences: [],
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
    rawToolCalls: [{ id: "reply", name: "send_reply", input: { text: "Hello." } }],
    readBlocks: [],
    readStatusMap: new Map(),
    readResultsMap: new Map(),
  }).evidence;
}

describe("buildPlanRoutingEvidence", () => {
  const blockedOrder = {
    id: "9000001020", name: "#1020", created_at: null,
    financial_status: "refunded", fulfillment_status: "fulfilled",
    total_price: "38.00", currency: "USD", items: [],
  };

  it.each([
    { ask: "cancel", code: "fulfilled_cancellation_request" },
    { ask: "address_change", code: "fulfilled_address_change_request" },
    { ask: "refund", code: "already_refunded_request" },
  ] as const)("refuses a blocked $ask from current structured facts without English wording", ({ ask, code }) => {
    const ctx = context({
      recentMessages: [{ senderType: "customer", contentText: "Por favor, ayúdame con esto." }],
      recentOrders: [blockedOrder],
      classifierSignals: {
        version: 6, language: "es", intents: { ...emptyIntents(), mutative_request: true },
        requestFacts: { ...emptyRequestFacts(), ask, order: "#1020" },
      },
    });
    expect(build(ctx).codes).toContain(code);
  });

  it("refuses the proposed write even when classification belongs to an older request", () => {
    const ctx = context({
      thread: { ...context().thread, requestSourceMessageId: "older_message" },
      recentOrders: [blockedOrder],
      classifierSignals: {
        version: 6, language: "en", intents: { ...emptyIntents(), order_status: true },
        requestFacts: { ...emptyRequestFacts(), ask: "order_status" },
      },
    });
    const evidence = buildPlanRoutingEvidence({
      ctx, rawToolCalls: [
        { id: "write", name: "update_shopify_order_address", input: { order_id: blockedOrder.id } },
      ],
      readBlocks: [], readStatusMap: new Map(), readResultsMap: new Map(),
    }).evidence;
    expect(evidence.codes).toEqual(["classifier_unaligned", "fulfilled_address_change_request"]);
  });

  it("does not revive historical compensation when a current status lookup fails", () => {
    const ctx = context({
      recentMessages: [
        { senderType: "customer", contentText: "Refund my order." },
        { senderType: "agent", contentText: "That request is complete." },
        { senderType: "customer", contentText: "¿Dónde está mi otro pedido?" },
      ],
      recentOrders: [{ ...blockedOrder, financial_status: "paid" }],
      classifierSignals: {
        version: 6, language: "es", intents: { ...emptyIntents(), order_status: true },
        requestFacts: { ...emptyRequestFacts(), ask: "order_status" },
      },
    });
    const evidence = buildPlanRoutingEvidence({
      ctx, rawToolCalls: [],
      readBlocks: [{ type: "tool_use", id: "lookup", name: "get_order_by_name", input: {} }],
      readStatusMap: new Map([["lookup", "error"]]), readResultsMap: new Map(),
    }).evidence;
    expect(evidence.codes).toEqual([]);
  });

  it("escalates an explicit store-credit request without a safe financial action", () => {
    const ctx = context({
      recentMessages: [{ senderType: "customer", contentText: "Quisiera crédito en mi cuenta." }],
      classifierSignals: {
        version: 6, language: "es",
        intents: { ...emptyIntents(), mutative_request: true, compensation_request: true },
        requestFacts: { ...emptyRequestFacts(), ask: "other" },
      },
    });
    expect(build(ctx).codes).toContain("compensation_exception");
  });

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
        requestFacts: { ...emptyRequestFacts(), ask: "refund", order: "#1020" },
      },
    });
    expect(build(ctx)).toMatchObject({
      codes: ["already_refunded_request"],
    });
  });

  it("does not judge the settled write again on a withheld-message follow-up", () => {
    const ctx = context({
      recentMessages: [{ senderType: "customer", contentText: "Refund order #1020 or I'll file a chargeback." }],
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
        intents: { ...emptyIntents(), mutative_request: true, fraud_signals: true },
        requestFacts: { ...emptyRequestFacts(), ask: "refund", order: "#1020" },
      },
    });
    const followUp = (withheldMessageFollowUp: boolean) => buildPlanRoutingEvidence({
      ctx,
      rawToolCalls: [{ id: "reply", name: "send_reply", input: { text: "Hello." } }],
      readBlocks: [],
      readStatusMap: new Map(),
      readResultsMap: new Map(),
      withheldMessageFollowUp,
    }).evidence.codes;

    expect(followUp(false)).toEqual(["already_refunded_request", "fraud_risk"]);
    expect(followUp(true)).toEqual(["fraud_risk"]);
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

  it("asks about the knowledge-base search that missed, not the customer's words", () => {
    const ctx = context({
      recentMessages: [{ senderType: "customer", contentText: "Any tips for making the candle burn evenly?" }],
      classifierSignals: { version: 2, language: "en", intents: emptyIntents(), requestFacts: emptyRequestFacts() },
    });
    const evidence = buildPlanRoutingEvidence({
      ctx,
      rawToolCalls: [{ id: "reply", name: "send_reply", input: { text: "Trim the wick." } }],
      readBlocks: [{ type: "tool_use", id: "kb", name: "search_kb", input: { query: "candle burn tips" } }],
      readStatusMap: new Map([["kb", "not_found"]]),
      readResultsMap: new Map(),
    }).evidence;

    expect(evidence.codes).toContain("kb_gap");
    expect(evidence.question).toBe(
      'I searched your knowledge base for "candle burn tips" and found nothing, so I haven\'t replied. What should I tell the customer?',
    );
  });
});

describe("kbMissNeedsMerchant", () => {
  const missed = {
    readBlocks: [{ type: "tool_use" as const, id: "kb", name: "search_kb", input: { query: "care" } }],
    readStatusMap: new Map([["kb", "not_found" as const]]),
  };
  const reply = { id: "reply", name: "send_reply", input: { text: "Hi." } };

  it("holds a reply drafted after an empty search", () => {
    expect(kbMissNeedsMerchant({ ctx: context(), rawToolCalls: [reply], ...missed }))
      .toBe(true);
  });

  it("lets the reply through once the merchant has answered", () => {
    expect(kbMissNeedsMerchant({
      ctx: context(),
      merchantContinuation: "answer",
      rawToolCalls: [reply],
      ...missed,
    })).toBe(false);
  });

  it("holds a reply beside an action only when the customer asked about policy", () => {
    const withReturn = [{ id: "return", name: "create_return", input: { order_id: "1042" } }, reply];
    const askedHowToReturn = context({
      classifierSignals: {
        version: 2,
        language: "en",
        intents: { ...emptyIntents(), policy_question: true, mutative_request: true },
        requestFacts: emptyRequestFacts(),
      },
    });

    expect(kbMissNeedsMerchant({ ctx: askedHowToReturn, rawToolCalls: withReturn, ...missed }))
      .toBe(true);
    expect(kbMissNeedsMerchant({ ctx: context(), rawToolCalls: withReturn, ...missed }))
      .toBe(false);
  });
});

describe("completesAtMerchantFollowUp", () => {
  const search = [{ type: "tool_use" as const, id: "kb", name: "search_kb", input: { query: "returns" } }];
  const missed = { readBlocks: search, readStatusMap: new Map([["kb", "not_found" as const]]) };
  const found = { readBlocks: search, readStatusMap: new Map([["kb", "ok" as const]]) };
  const openReturn = { id: "return", name: "create_return", input: { order_id: "1042" } };
  const askMerchant = { id: "ask", name: "ask_operator", input: { question: "Label URL?" } };
  const reply = { id: "reply", name: "send_reply", input: { text: "Hi." } };
  const attachLabel = { id: "label", name: "attach_return_label", input: { order_id: "1042" } };
  const completes = (rawToolCalls: { id: string; name: string; input: unknown }[], kb = found, merchantDirected = false) =>
    completesAtMerchantFollowUp({ merchantDirected, rawToolCalls, ...kb });

  it("ends a return plan once the agent has nothing from the store on how items go back", () => {
    expect(completes([openReturn], missed)).toBe(true);
    expect(completes([openReturn, askMerchant])).toBe(true);
    expect(completes([openReturn, reply])).toBe(false);
    expect(completes([openReturn, attachLabel, askMerchant])).toBe(false);
    expect(completes([askMerchant], missed)).toBe(false);
    // A merchant's instruction, answer or revision may be the very reply they want.
    expect(completes([openReturn, reply], missed, true)).toBe(false);
  });
});

describe("damage claims", () => {
  const settings = resolveAgentSettings({});
  const refund: RawToolCall = { id: "refund", name: "create_refund", input: { order_id: "9000001042" } };
  const reply: RawToolCall = { id: "reply", name: "send_reply", input: { text: "Sorry about that. Could you send a photo?" } };
  const askForPhoto: RawToolCall = { id: "ask", name: "await_customer_photo", input: {} };

  function damageClaim(requestEvidence: NonNullable<AgentContext["requestEvidence"]>) {
    const ctx = context({
      thread: { ...context().thread, channelType: "ig_dm" },
      recentMessages: [{ senderType: "customer", contentText: "Can I get a refund on 1042? It arrived damaged." }],
      classifierSignals: {
        version: 7, language: "en",
        intents: { ...emptyIntents(), mutative_request: true, compensation_request: true },
        requestFacts: { ...emptyRequestFacts(), ask: "refund", order: "#1042", reason: "damaged" },
      },
      requestEvidence,
    });
    return { ctx, damageEvidence: damageEvidenceState(ctx, settings) };
  }

  function route(claim: ReturnType<typeof damageClaim>, rawToolCalls: RawToolCall[]) {
    return buildPlanRoutingEvidence({
      ...claim, rawToolCalls, settings, readBlocks: [], readStatusMap: new Map(), readResultsMap: new Map(),
    });
  }

  it("hands a refund on the customer's word alone to the merchant", () => {
    const routed = route(damageClaim({ customerImages: 0, photoRequestedAt: null }), [refund, reply]);
    expect(routed.evidence.codes).toContain("damage_photo_missing");
  });

  it("hands the conversation over when the requested photo never came", () => {
    const routed = route(damageClaim({ customerImages: 0, photoRequestedAt: "2026-10-07T18:00:00.000Z" }), [reply]);
    expect(routed.evidence.codes).toContain("damage_photo_missing");
  });

  it("lets the first photo request go out without escalating it", () => {
    const routed = route(damageClaim({ customerImages: 0, photoRequestedAt: null }), [askForPhoto, reply]);
    expect(routed.evidence.codes).toEqual([]);
    expect(routed.signalCodes).not.toContain("mutative_intent_no_action");
  });

  it("holds compensation on a photographed claim for the merchant, and not a reply alone", () => {
    const { ctx, damageEvidence } = damageClaim({ customerImages: 2, photoRequestedAt: null });
    const codes: ProducedPlanSignalCode[] = [];
    appendInitialPlanningSignals({ ctx, operatorMode: false, codes, damageEvidence });
    const severity = (calls: RawToolCall[]) => (
      buildPlanSignals(codes, calls).find((signal) => signal.code === "damage_photo_attached")?.severity
    );
    expect(severity([refund, reply])).toBe("blocking");
    expect(severity([reply])).toBe("advisory");
  });
});
