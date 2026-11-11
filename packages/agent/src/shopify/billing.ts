import { db } from "@shopkeeper/db";
import { shopifyGraphql } from "./client.js";
import { SHOPIFY_ACCESS_SELECT, shopifyContextFor } from "./access.js";
import { isSimulatedShopifyIntegration } from "./integration-health.js";

/**
 * A workspace billed through Shopify App Pricing: the plans live in the Partner
 * dashboard and Shopify hosts the page that picks one. Shopify reports a store's
 * plan only through the Partner API (`activeSubscription`) and sends no webhook
 * when it changes, so the app reads it on the pages that show it, after a store
 * is claimed, and daily in the gateway, and stores what it found on the
 * organization. The billing write gate (`assertBillingWriteAllowed`) and plan
 * limits read it.
 */
export type ShopifyBillingStatus = "active" | "inactive";

export interface ShopifyBillingState {
  /** `inactive`: a plan that was active has ended. Null when the store never had one. */
  status: ShopifyBillingStatus | null;
  /** The plan's handle in the Partner dashboard (`starter`, `pro`). */
  planHandle: string | null;
  trialEndsAt: Date | null;
}

export interface ActiveSubscription {
  trialEndsAt: string | null;
  items: { handle: string | null }[];
}

interface ShopifyPartnerApi {
  partnerId: string;
  accessToken: string;
}

const PARTNER_API_VERSION = "2026-10";
const PARTNER_REQUEST_TIMEOUT_MS = 10_000;

const ACTIVE_SUBSCRIPTION_QUERY = `
  query ShopkeeperActiveSubscription($appId: ID!, $shopId: ID!) {
    activeSubscription(appId: $appId, shopId: $shopId) {
      trialEndsAt
      items { handle }
    }
  }`;

// The ids the Partner API names a store's subscription by.
const SUBSCRIPTION_IDS_QUERY = `
  query ShopkeeperSubscriptionIds {
    shop { id }
    currentAppInstallation { app { id } }
  }`;

/**
 * The Partner API client (Dev Dashboard → Organization settings → Users →
 * Security, with Manage apps) and the Partner ID from the Partner Dashboard URL.
 * Null until both are set: no plan is read, and nothing is billed through Shopify.
 */
export function shopifyPartnerApiConfig(): ShopifyPartnerApi | null {
  const partnerId = process.env.SHOPIFY_PARTNER_ID?.trim();
  const accessToken = process.env.SHOPIFY_PARTNER_API_TOKEN?.trim();
  return partnerId && /^\d+$/.test(partnerId) && accessToken ? { partnerId, accessToken } : null;
}

/** The store's billing from its active subscription, given what was stored before. */
export function deriveShopifyBillingState(
  subscription: ActiveSubscription | null,
  previousStatus: string | null,
): ShopifyBillingState {
  if (subscription) {
    const trialEndsAt = subscription.trialEndsAt ? new Date(subscription.trialEndsAt) : null;
    return {
      status: "active",
      planHandle: subscription.items.find((item) => item.handle)?.handle ?? null,
      trialEndsAt: trialEndsAt && Number.isFinite(trialEndsAt.getTime()) ? trialEndsAt : null,
    };
  }
  // Shopify answers only for an active plan, so the store's history is ours: a
  // plan seen active and now gone has ended; a store never seen with one has none.
  const lapsed = previousStatus === "active" || previousStatus === "inactive";
  return { status: lapsed ? "inactive" : null, planHandle: null, trialEndsAt: null };
}

const RESYNC_AFTER_MS = 60 * 60_000;

/**
 * Whether a page that shows billing should read Shopify again: an active plan
 * read within the hour stands; anything else may have just changed.
 */
export function shouldSyncShopifyBilling(
  org: { shopifyBillingStatus: string | null; shopifyBillingSyncedAt: Date | null },
  now = Date.now(),
): boolean {
  if (org.shopifyBillingStatus !== "active" || !org.shopifyBillingSyncedAt) return true;
  return now - org.shopifyBillingSyncedAt.getTime() > RESYNC_AFTER_MS;
}

async function requestActiveSubscription(
  partner: ShopifyPartnerApi,
  ids: { appId: string; shopId: string },
): Promise<ActiveSubscription | null> {
  const response = await fetch(
    `https://partners.shopify.com/${partner.partnerId}/api/${PARTNER_API_VERSION}/graphql.json`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": partner.accessToken },
      body: JSON.stringify({ query: ACTIVE_SUBSCRIPTION_QUERY, variables: ids }),
      signal: AbortSignal.timeout(PARTNER_REQUEST_TIMEOUT_MS),
    },
  );
  const payload = await response.json().catch(() => null) as {
    data?: { activeSubscription: ActiveSubscription | null };
    errors?: { message?: string }[];
  } | null;
  if (!response.ok || !payload?.data || payload.errors?.length) {
    const reason = payload?.errors?.map((error) => error.message).join("; ") ?? "no data";
    throw new Error(`Shopify Partner API activeSubscription failed (${response.status}): ${reason}`);
  }
  return payload.data.activeSubscription;
}

/**
 * Reads the workspace's plan and stores it on the organization. Null when there
 * is nothing to ask (no Partner API client, no live store, or a grant that needs
 * reconnecting), which leaves the stored state as it was. A failed read throws
 * and also leaves it: a timeout never blocks a workspace.
 */
export async function syncShopifyBilling(organizationId: string): Promise<ShopifyBillingState | null> {
  const partner = shopifyPartnerApiConfig();
  if (!partner) return null;
  const [integration, org] = await Promise.all([
    db.integration.findFirst({
      where: { organizationId, platform: "shopify", lifecycleStatus: "active" },
      orderBy: { createdAt: "asc" },
      select: { ...SHOPIFY_ACCESS_SELECT, metadata: true },
    }),
    db.organization.findUnique({ where: { id: organizationId }, select: { shopifyBillingStatus: true } }),
  ]);
  if (!integration || !org || isSimulatedShopifyIntegration(integration.metadata)) return null;
  const ctx = await shopifyContextFor(integration);
  if (!ctx) return null;

  const ids = await shopifyGraphql<{
    shop: { id: string };
    currentAppInstallation: { app: { id: string } };
  }>(ctx, SUBSCRIPTION_IDS_QUERY, {}, { maxRetries: 1 });
  const subscription = await requestActiveSubscription(partner, {
    appId: ids.currentAppInstallation.app.id,
    shopId: ids.shop.id,
  });
  const state = deriveShopifyBillingState(subscription, org.shopifyBillingStatus);

  await db.organization.update({
    where: { id: organizationId },
    data: {
      shopifyBillingStatus: state.status,
      shopifyPlanName: state.planHandle,
      shopifyTrialEndsAt: state.trialEndsAt,
      shopifyBillingSyncedAt: new Date(),
    },
  });
  return state;
}
