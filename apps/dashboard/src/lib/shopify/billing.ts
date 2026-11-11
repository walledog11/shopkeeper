import { db } from '@shopkeeper/db';
import { isSimulatedShopifyIntegration } from '@shopkeeper/agent/shopify/integration-health';
import { shouldSyncShopifyBilling, syncShopifyBilling } from '@shopkeeper/agent/shopify/billing';
import { getShopifyAppHandle } from '@/lib/env';
import logger from '@/lib/server/logger';

/** What Usage & billing and the Shopify app home show for a workspace billed through Shopify. */
export interface ShopifyBillingView {
  status: 'active' | 'frozen' | 'inactive' | null;
  planName: string | null;
  trialEndsAt: string | null;
  /** A development store's plan, which Shopify never charges. */
  test: boolean;
  /** Shopify's own page for choosing or changing the plan, inside the store's admin. */
  planPageUrl: string;
}

/** Shopify's hosted plan page for the store, in its admin (managed pricing). */
function shopifyPlanPageUrl(shop: string, appHandle: string): string {
  const storeHandle = shop.replace(/\.myshopify\.com$/, '');
  return `https://admin.shopify.com/store/${encodeURIComponent(storeHandle)}/charges/${encodeURIComponent(appHandle)}/pricing_plans`;
}

/**
 * A workspace is billed through Shopify once the plans exist in the Partner
 * dashboard (`SHOPIFY_APP_HANDLE`) and it has a live store. The subscription is
 * read again when it may have changed (`shouldSyncShopifyBilling`); a failed
 * read shows what was stored. Null means Shopify doesn't bill this workspace.
 */
export async function loadShopifyBilling(organizationId: string): Promise<ShopifyBillingView | null> {
  const appHandle = getShopifyAppHandle();
  if (!appHandle) return null;
  const store = await db.integration.findFirst({
    where: { organizationId, platform: 'shopify', lifecycleStatus: 'active' },
    orderBy: { createdAt: 'asc' },
    select: { externalAccountId: true, metadata: true },
  });
  if (!store || isSimulatedShopifyIntegration(store.metadata)) return null;

  const org = await db.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: {
      shopifyBillingStatus: true,
      shopifyPlanName: true,
      shopifyTrialEndsAt: true,
      shopifyBillingTest: true,
      shopifyBillingSyncedAt: true,
    },
  });
  let billing = {
    status: org.shopifyBillingStatus,
    planName: org.shopifyPlanName,
    trialEndsAt: org.shopifyTrialEndsAt,
    test: org.shopifyBillingTest,
  };
  if (shouldSyncShopifyBilling(org)) {
    const synced = await syncShopifyBilling(organizationId).catch((error: unknown) => {
      logger.warn({ err: error, orgId: organizationId }, '[Shopify billing] Could not read the subscription');
      return null;
    });
    if (synced) billing = synced;
  }

  return {
    status: isShopifyBillingStatus(billing.status) ? billing.status : null,
    planName: billing.planName,
    trialEndsAt: billing.trialEndsAt?.toISOString() ?? null,
    test: billing.test === true,
    planPageUrl: shopifyPlanPageUrl(store.externalAccountId, appHandle),
  };
}

function isShopifyBillingStatus(value: string | null): value is ShopifyBillingView['status'] & string {
  return value === 'active' || value === 'frozen' || value === 'inactive';
}
