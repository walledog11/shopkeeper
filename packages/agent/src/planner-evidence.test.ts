import { describe, expect, it } from "vitest";
import type { AgentContext } from "./agent-context.js";
import { emptyIntents, emptyRequestFacts } from "./classifier-signals.js";
import { buildPlanRoutingEvidence } from "./planner-evidence.js";

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
});
