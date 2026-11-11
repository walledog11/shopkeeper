import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@shopkeeper/db";
import { cleanupTestData, createTestOrg } from "@shopkeeper/db/test-helpers";
import { syncShopifyBilling } from "./billing.js";

// The stored plan decides whether the billing gate stops a workspace's writes.

const SHOP_GID = "gid://shopify/Shop/7001";
const APP_GID = "gid://shopify/App/9001";
let orgId: string | null = null;

async function storeWithPlanHistory(shopifyBillingStatus: string | null) {
  const org = await createTestOrg();
  orgId = org.id;
  await db.organization.update({ where: { id: org.id }, data: { shopifyBillingStatus } });
  await db.integration.create({
    data: {
      organizationId: org.id,
      platform: "shopify",
      externalAccountId: `b${randomUUID().slice(0, 8)}.myshopify.com`,
      accessToken: "shpat_live",
    },
  });
  return org.id;
}

/** The store's Admin API answers its ids; the Partner API answers `partner`. */
function stubShopify(partner: () => Response) {
  const partnerRequests: { url: string; headers: Record<string, string>; body: { variables: unknown } }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: RequestInit) => {
    if (String(url).startsWith("https://partners.shopify.com/")) {
      partnerRequests.push({
        url: String(url),
        headers: init?.headers as Record<string, string>,
        body: JSON.parse(String(init?.body)),
      });
      return partner();
    }
    return Response.json({ data: { shop: { id: SHOP_GID }, currentAppInstallation: { app: { id: APP_GID } } } });
  }));
  return partnerRequests;
}

function billingOf(id: string) {
  return db.organization.findUniqueOrThrow({
    where: { id },
    select: { shopifyBillingStatus: true, shopifyPlanName: true, shopifyTrialEndsAt: true },
  });
}

describe("syncShopifyBilling", () => {
  beforeEach(() => {
    vi.stubEnv("SHOPIFY_PARTNER_ID", "4242");
    vi.stubEnv("SHOPIFY_PARTNER_API_TOKEN", "prtapi_test");
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await cleanupTestData(orgId);
    orgId = null;
  });

  it("asks the Partner API for the store's subscription and stores the plan", async () => {
    const id = await storeWithPlanHistory(null);
    const requests = stubShopify(() => Response.json({
      data: { activeSubscription: { trialEndsAt: "2026-11-25T00:00:00Z", items: [{ handle: "pro" }] } },
    }));

    await expect(syncShopifyBilling(id)).resolves.toMatchObject({ status: "active", planHandle: "pro" });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("https://partners.shopify.com/4242/api/2026-10/graphql.json");
    expect(requests[0]?.headers["X-Shopify-Access-Token"]).toBe("prtapi_test");
    expect(requests[0]?.body.variables).toEqual({ appId: APP_GID, shopId: SHOP_GID });
    await expect(billingOf(id)).resolves.toEqual({
      shopifyBillingStatus: "active",
      shopifyPlanName: "pro",
      shopifyTrialEndsAt: new Date("2026-11-25T00:00:00Z"),
    });
  });

  it("marks a plan that was active and is gone as ended", async () => {
    const id = await storeWithPlanHistory("active");
    stubShopify(() => Response.json({ data: { activeSubscription: null } }));

    await syncShopifyBilling(id);
    await expect(billingOf(id)).resolves.toMatchObject({ shopifyBillingStatus: "inactive", shopifyPlanName: null });
  });

  it("leaves the stored plan alone when Shopify refuses the read", async () => {
    const id = await storeWithPlanHistory("active");
    stubShopify(() => Response.json({ errors: [{ message: "Only public app must can access active subscription" }] }));

    await expect(syncShopifyBilling(id)).rejects.toThrow(/activeSubscription failed/);
    await expect(billingOf(id)).resolves.toMatchObject({ shopifyBillingStatus: "active" });
  });

  it("reads nothing without a Partner API client", async () => {
    const id = await storeWithPlanHistory(null);
    vi.stubEnv("SHOPIFY_PARTNER_API_TOKEN", "");
    const requests = stubShopify(() => Response.json({ data: { activeSubscription: null } }));

    await expect(syncShopifyBilling(id)).resolves.toBeNull();
    expect(requests).toHaveLength(0);
  });
});
