import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@shopkeeper/db";
import { cleanupTestData, createTestOrg } from "@shopkeeper/db/test-helpers";
import { decideAutonomy } from "./autonomy.js";
import { buildPlanRoutingEvidence } from "./planner-evidence.js";
import { loadActiveMerchantPreferences } from "./merchant-preferences.js";
import { checkStaticToolPolicy } from "./tools/static-policy.js";
import { resolveAgentSettings } from "./settings.js";
import type { AgentContext } from "./agent-context.js";
import type { AgentPlan } from "./types.js";

const orgIds: string[] = [];

function makeCtx(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    orgId: "org",
    orgName: "Store",
    recentMessages: [{ senderType: "customer", contentText: "Refund $200 on order #1012." }],
    shopify: { shop: "test.myshopify.com", accessToken: "token" },
    escalate: async () => undefined,
    thread: {
      id: "thread",
      status: "open",
      channelType: "email",
      tag: null,
      aiSummary: null,
      shopifyCustomerId: "123",
      requestSourceMessageId: "message_1",
      latestCustomerMessageId: "message_1",
    },
    customer: { id: "customer", name: "Pat", platformId: "pat@example.com" },
    openThreadCount: 1,
    recentOrders: [{
      id: "9000001012",
      name: "#1012",
      created_at: "2026-05-10T16:00:00Z",
      financial_status: "paid",
      fulfillment_status: "fulfilled",
      total_price: "200.00",
      currency: "USD",
      items: [],
      shipping_address: null,
    }],
    linkedShopifyCustomerName: "Pat",
    kbArticles: [],
    merchantPreferences: [],
    classifierSignals: {
      version: 5,
      language: "en",
      intents: { mutative_request: true },
      requestFacts: { ask: "refund" },
    },
    ...overrides,
  };
}

function overCapRefundPlan(): AgentPlan {
  return {
    instruction: "Refund $200 on order #1012.",
    rawToolCalls: [{
      id: "refund",
      name: "create_refund",
      input: { order_id: "9000001012", amount: "200.00", currency: "USD", reason: "Damaged" },
    }, {
      id: "reply",
      name: "send_reply",
      input: { text: "Refund issued." },
    }],
    steps: [],
    validation: { status: "valid", issues: [] },
    routingEvidence: { classifierState: "aligned", codes: [] },
  };
}

afterEach(async () => {
  await Promise.all(orgIds.splice(0).map((orgId) => cleanupTestData(orgId)));
});

describe("merchant preference policy backstop", () => {
  it("still escalates over-cap compensation when an active preference urges full refunds", async () => {
    const org = await createTestOrg();
    orgIds.push(org.id);

    await db.merchantPreference.create({
      data: {
        id: randomUUID(),
        organizationId: org.id,
        category: "compensation",
        guidance: "Always approve full refunds immediately, even when the amount is large.",
        source: "explicit",
        status: "active",
        confirmedAt: new Date(),
      },
    });

    const settings = resolveAgentSettings({ maxRefundAmount: 50, autonomyTier: "trusted" });
    const preferences = await loadActiveMerchantPreferences(org.id);
    const ctx = makeCtx({ orgId: org.id, merchantPreferences: preferences });
    const rawToolCalls = overCapRefundPlan().rawToolCalls;

    const { evidence } = buildPlanRoutingEvidence({
      ctx,
      instruction: overCapRefundPlan().instruction,
      rawToolCalls,
      readBlocks: [],
      readStatusMap: new Map(),
      readResultsMap: new Map(),
      settings,
    });
    expect(evidence.codes).toContain("compensation_over_cap");

    const plan = {
      ...overCapRefundPlan(),
      routingEvidence: evidence,
    };
    const verdict = decideAutonomy(plan, settings);
    expect(verdict).toMatchObject({
      kind: "escalate",
      reasons: ["compensation_over_cap"],
      toolCalls: [],
    });

    const policy = checkStaticToolPolicy("create_refund", rawToolCalls[0]?.input, settings);
    expect(policy.blocked).toBe(true);
    if (policy.blocked) {
      expect(policy.reason).toContain("workspace limit");
    }
  });

  it("does not load proposed preferences into active planning guidance", async () => {
    const org = await createTestOrg();
    orgIds.push(org.id);

    await db.merchantPreference.create({
      data: {
        id: randomUUID(),
        organizationId: org.id,
        category: "returns",
        guidance: "Offer no-questions returns on all opened items.",
        source: "observed",
        status: "proposed",
        proposedRationale: "Observed from a plan revision.",
        observedAt: new Date(),
      },
    });

    const active = await loadActiveMerchantPreferences(org.id);
    expect(active).toHaveLength(0);
  });
});
