import { describe, expect, it } from "vitest";
import type { AgentContext, OrderVerificationRecord } from "./agent-context.js";
import { orderVerificationState } from "./order-verification.js";

const NOW = new Date("2026-10-22T18:00:00Z");

function dmContext(orderVerifications: OrderVerificationRecord[]): AgentContext {
  return {
    orgId: "org_test",
    orgName: "Test Store",
    customer: { id: "customer_test", name: null, platformId: "ig_sender" },
    recentMessages: [],
    openThreadCount: 1,
    shopify: { shop: "test-store.myshopify.com", accessToken: "shpat_test" },
    recentOrders: [],
    linkedShopifyCustomerName: null,
    kbArticles: [],
    merchantPreferences: [],
    thread: {
      id: "thread_dm",
      status: "open",
      channelType: "ig_dm",
      tag: null,
      aiSummary: null,
      shopifyCustomerId: null,
    },
    orderVerifications,
    escalate: () => Promise.resolve(),
  };
}

describe("orderVerificationState", () => {
  // 2026-10-22: a photo and its text arrived as two messages, and the text
  // landed while "which order?" was on its way. The open ask still read as
  // nothing asked, so the agent asked the same question a second time.
  it("reads an open 'which order?' ask as already asked", () => {
    const ask: OrderVerificationRecord = {
      orderName: null,
      orderId: null,
      method: null,
      threadId: "thread_dm",
      requestedAt: new Date(NOW.getTime() - 30_000),
      asks: 1,
      attempts: 0,
      answeredMessageId: null,
      verifiedAt: null,
      requestFacts: null,
      compensationRequested: false,
    };

    expect(orderVerificationState(dmContext([ask]), NOW)).toMatchObject({ kind: "asked", orderName: null });
  });
});
