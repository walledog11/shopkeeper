import { db } from "@shopkeeper/db";
import { shopifyGraphql } from "./client.js";
import { SHOPIFY_ACCESS_SELECT, shopifyContextFor } from "./access.js";
import { isSimulatedShopifyIntegration } from "./integration-health.js";

/**
 * A workspace billed through Shopify's managed pricing: the plans live in the
 * Partner dashboard and Shopify hosts the page that picks one, so the app only
 * reads the store's subscription and stores what it found on the organization.
 * The billing write gate (`assertBillingWriteAllowed`) and plan limits read it.
 */
export type ShopifyBillingStatus = "active" | "frozen" | "inactive";

export interface ShopifyBillingState {
  /** Null when the store never had a plan. */
  status: ShopifyBillingStatus | null;
  planName: string | null;
  subscriptionId: string | null;
  trialEndsAt: Date | null;
  /** A development store's charge, which Shopify never bills. */
  test: boolean | null;
}

interface AppSubscriptionNode {
  id: string;
  name: string;
  status: string;
  test: boolean;
  trialDays: number | null;
  createdAt: string;
}

const BILLING_QUERY = `#graphql
  query ShopkeeperBilling {
    currentAppInstallation {
      allSubscriptions(first: 10, sortKey: CREATED_AT, reverse: true) {
        nodes { id name status test trialDays createdAt }
      }
    }
  }`;

const DAY_MS = 86_400_000;
// ACCEPTED is a subscription the merchant approved that Shopify has yet to mark ACTIVE.
const CURRENT_STATUSES = new Set(["ACTIVE", "ACCEPTED"]);
// A plan that ran and stopped. DECLINED and PENDING never ran: a merchant who
// declined a change keeps the plan they had, and one who never chose has none.
const LAPSED_STATUSES = new Set(["CANCELLED", "EXPIRED"]);

function trialEndsAt(subscription: AppSubscriptionNode): Date | null {
  const created = Date.parse(subscription.createdAt);
  if (!subscription.trialDays || subscription.trialDays <= 0 || !Number.isFinite(created)) return null;
  return new Date(created + subscription.trialDays * DAY_MS);
}

/** The store's billing from its subscriptions, newest first. */
export function deriveShopifyBillingState(subscriptions: readonly AppSubscriptionNode[]): ShopifyBillingState {
  const current = subscriptions.find((subscription) => CURRENT_STATUSES.has(subscription.status))
    ?? subscriptions.find((subscription) => subscription.status === "FROZEN");
  if (current) {
    return {
      status: current.status === "FROZEN" ? "frozen" : "active",
      planName: current.name,
      subscriptionId: current.id,
      trialEndsAt: trialEndsAt(current),
      test: current.test,
    };
  }
  const lapsed = subscriptions.find((subscription) => LAPSED_STATUSES.has(subscription.status));
  return lapsed
    ? { status: "inactive", planName: lapsed.name, subscriptionId: lapsed.id, trialEndsAt: null, test: lapsed.test }
    : { status: null, planName: null, subscriptionId: null, trialEndsAt: null, test: null };
}

const RESYNC_AFTER_MS = 60 * 60_000;

/**
 * Whether a page that shows billing should read Shopify again: the webhook keeps
 * an active plan current, so only a stale or missing one, or one that is not
 * active (which the merchant may have just fixed), is worth the round trip.
 */
export function shouldSyncShopifyBilling(
  org: { shopifyBillingStatus: string | null; shopifyBillingSyncedAt: Date | null },
  now = Date.now(),
): boolean {
  if (org.shopifyBillingStatus !== "active" || !org.shopifyBillingSyncedAt) return true;
  return now - org.shopifyBillingSyncedAt.getTime() > RESYNC_AFTER_MS;
}

/**
 * Reads the workspace's Shopify subscription and stores it on the organization.
 * Null when the workspace has no live Shopify store to ask (none, a simulated
 * one, or a grant that needs reconnecting), which leaves the stored state as it
 * was. A Shopify failure throws, also leaving it: a timeout never blocks writes.
 */
export async function syncShopifyBilling(organizationId: string): Promise<ShopifyBillingState | null> {
  const integration = await db.integration.findFirst({
    where: { organizationId, platform: "shopify", lifecycleStatus: "active" },
    orderBy: { createdAt: "asc" },
    select: { ...SHOPIFY_ACCESS_SELECT, metadata: true },
  });
  if (!integration || isSimulatedShopifyIntegration(integration.metadata)) return null;
  const ctx = await shopifyContextFor(integration);
  if (!ctx) return null;

  const data = await shopifyGraphql<{
    currentAppInstallation: { allSubscriptions: { nodes: AppSubscriptionNode[] } } | null;
  }>(ctx, BILLING_QUERY, {}, { maxRetries: 1 });
  const state = deriveShopifyBillingState(data.currentAppInstallation?.allSubscriptions.nodes ?? []);

  await db.organization.update({
    where: { id: organizationId },
    data: {
      shopifyBillingStatus: state.status,
      shopifyPlanName: state.planName,
      shopifySubscriptionId: state.subscriptionId,
      shopifyTrialEndsAt: state.trialEndsAt,
      shopifyBillingTest: state.test,
      shopifyBillingSyncedAt: new Date(),
    },
  });
  return state;
}
