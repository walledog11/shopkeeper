import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@shopkeeper/db";
import { cleanupTestData, createTestOrg } from "@shopkeeper/db/test-helpers";
import type { BaseAgentContext } from "./agent-context.js";
import { resolveAgentSettings } from "./settings.js";
import type { ShopifyContext } from "./shopify/client.js";
import { createPartialRefund } from "./shopify/partial-refunds.js";
import { createRefund, quoteFullRefundForApproval } from "./shopify/refunds.js";
import { jsonResponse } from "./testing/json-response.js";
import { executeToolWithStatus } from "./tools/executor.js";
import { checkStaticToolPolicy } from "./tools/static-policy.js";

// The workspace limits are set in the shop's currency. Shopify quotes a refund in
// the currency the customer was charged. On a USD shop whose customer paid in GBP
// the refund is 45.00 GBP, which costs the shop 60.00 USD: under a $50 limit in
// what the customer is refunded, over it in what the shop pays.
const PRESENTMENT = { amount: "45.00", currency: "GBP" };
const SHOP_AMOUNT = "60.00";

const SHOPIFY: ShopifyContext = {
  shop: "test-store.myshopify.com",
  accessToken: "shpat_test",
  operationId: "execution-1:refund",
  executionId: "execution-1",
  reserveCompensation: async () => ({ kind: "reserved" }),
};

const PARTIAL = { order_id: "2001", items: [{ line_item_id: "9001", quantity: 1 }] };

function stubShopify(options: { suggestedPresentmentAmount?: string } = {}) {
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const target = String(url);
    const body = typeof init?.body === "string" ? init.body : "";
    if (target.includes("refunds/calculate.json")) {
      return jsonResponse({
        refund: {
          currency: PRESENTMENT.currency,
          transactions: [{
            amount: PRESENTMENT.amount,
            currency: PRESENTMENT.currency,
            gateway: "shopify_payments",
            parent_id: 77,
            kind: "suggested_refund",
          }],
        },
      });
    }
    if (/\/orders\/2001\.json/.test(target)) {
      return jsonResponse({
        order: {
          id: 2001,
          name: "#1031",
          currency: "USD",
          financial_status: "paid",
          refunds: [],
          line_items: [{ id: 9001, title: "Napkin", quantity: 1, current_quantity: 1 }],
        },
      });
    }
    if (target.endsWith("/graphql.json") && body.includes("suggestedRefund")) {
      return jsonResponse({
        data: {
          order: {
            suggestedRefund: {
              amountSet: {
                shopMoney: { amount: SHOP_AMOUNT, currencyCode: "USD" },
                presentmentMoney: {
                  amount: options.suggestedPresentmentAmount ?? PRESENTMENT.amount,
                  currencyCode: PRESENTMENT.currency,
                },
              },
            },
          },
        },
      });
    }
    if (target.endsWith("/graphql.json") && body.includes("refundCreate")) {
      return jsonResponse({
        data: {
          refundCreate: {
            refund: {
              id: "gid://shopify/Refund/1",
              totalRefundedSet: {
                presentmentMoney: { amount: PRESENTMENT.amount },
                shopMoney: { amount: SHOP_AMOUNT },
              },
              transactions: { nodes: [{ id: "gid://shopify/OrderTransaction/2", status: "SUCCESS" }] },
            },
            userErrors: [],
          },
        },
      });
    }
    throw new Error(`unexpected Shopify request: ${target}`);
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a per-refund limit is a limit on what the refund costs the shop", () => {
  it("blocks a full refund that costs the shop more than the limit", async () => {
    stubShopify();

    const quoted = await quoteFullRefundForApproval({ order_id: "2001" }, SHOPIFY);

    expect(checkStaticToolPolicy("create_refund", quoted, resolveAgentSettings({ maxRefundAmount: 50 })).blocked)
      .toBe(true);
  });

  // The approved shop-currency figure is supplied so that nothing but Shopify's own
  // answer disagreeing with the quote can be what stops this refund.
  it("refuses a full refund whose cost to the shop Shopify does not confirm", async () => {
    stubShopify({ suggestedPresentmentAmount: "44.00" });

    const result = await createRefund({
      order_id: "2001",
      amount: PRESENTMENT.amount,
      currency: PRESENTMENT.currency,
      approval_shop_amount: SHOP_AMOUNT,
    }, SHOPIFY);

    expect(result.status).toBe("policy_block");
  });

  it("refuses a partial refund that costs the shop more than the limit", async () => {
    stubShopify();

    const result = await createPartialRefund(PARTIAL, SHOPIFY, resolveAgentSettings({ maxRefundAmount: 50 }));

    expect(result.status).toBe("policy_block");
  });
});

describe("the daily compensation budget is counted in what a refund costs the shop", () => {
  let orgId: string | null = null;

  afterEach(async () => {
    await cleanupTestData(orgId);
    orgId = null;
  });

  async function contextForNewOrg(): Promise<BaseAgentContext> {
    const org = await createTestOrg();
    orgId = org.id;
    return {
      orgId: org.id,
      orgName: org.name,
      recentMessages: [],
      escalate: async () => undefined,
      shopify: {
        shop: SHOPIFY.shop,
        accessToken: SHOPIFY.accessToken,
        operationId: SHOPIFY.operationId,
        executionId: SHOPIFY.executionId,
        grantedScopes: ["write_orders"],
      },
    };
  }

  async function reservationFor(ctx: BaseAgentContext) {
    return db.refundSpendReservation.findFirstOrThrow({ where: { organizationId: ctx.orgId } });
  }

  it("reserves and commits a full refund in shop money", async () => {
    stubShopify();
    const ctx = await contextForNewOrg();
    const quoted = await quoteFullRefundForApproval({ order_id: "2001" }, ctx.shopify!);

    const outcome = await executeToolWithStatus(
      "create_refund",
      quoted,
      ctx,
      resolveAgentSettings({ maxRefundAmount: 1000, dailyRefundCap: 100 }),
    );

    expect(outcome.status).toBe("success");
    await expect(reservationFor(ctx)).resolves.toMatchObject({ reservedCents: 6000, committedCents: 6000 });
  });

  it("reserves and commits a partial refund in shop money", async () => {
    stubShopify();
    const ctx = await contextForNewOrg();

    const outcome = await executeToolWithStatus(
      "create_partial_refund",
      PARTIAL,
      ctx,
      resolveAgentSettings({ maxRefundAmount: 1000, dailyRefundCap: 100 }),
    );

    expect(outcome.status).toBe("success");
    await expect(reservationFor(ctx)).resolves.toMatchObject({ reservedCents: 6000, committedCents: 6000 });
  });
});
