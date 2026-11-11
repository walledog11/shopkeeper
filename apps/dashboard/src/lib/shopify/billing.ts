import { db } from '@shopkeeper/db';
import { isSimulatedShopifyIntegration } from '@shopkeeper/agent/shopify/integration-health';
import {
  shopifyPartnerApiConfig,
  shouldSyncShopifyBilling,
  syncShopifyBilling,
} from '@shopkeeper/agent/shopify/billing';
import { PLANS } from '@/lib/billing/plans';
import { getShopifyAppHandle } from '@/lib/env';
import logger from '@/lib/server/logger';

/** What Usage & billing and the Shopify app home show for a workspace billed through Shopify. */
export interface ShopifyBillingView {
  status: 'active' | 'inactive' | null;
  planName: string | null;
  trialEndsAt: string | null;
  /** Shopify's own page for choosing or changing the plan, inside the store's admin. */
  planPageUrl: string;
}

/** Shopify's hosted plan page for the store, in its admin (Shopify App Pricing). */
function shopifyPlanPageUrl(shop: string, appHandle: string): string {
  const storeHandle = shop.replace(/\.myshopify\.com$/, '');
  return `https://admin.shopify.com/store/${encodeURIComponent(storeHandle)}/charges/${encodeURIComponent(appHandle)}/pricing_plans`;
}

/** Shopify reports a plan by its handle; the pricing page's name for it reads better. */
function planName(handle: string | null): string | null {
  if (!handle) return null;
  return PLANS.find((plan) => plan.tier === handle.toLowerCase())?.name ?? handle;
}

/**
 * A workspace is billed through Shopify once the plans exist in the Partner
 * dashboard (`SHOPIFY_APP_HANDLE`), the Partner API can read them
 * (`shopifyPartnerApiConfig`), and it has a live store. The plan is read again
 * when it may have changed (`shouldSyncShopifyBilling`); a failed read shows what
 * was stored. Null means Shopify doesn't bill this workspace.
 */
export async function loadShopifyBilling(organizationId: string): Promise<ShopifyBillingView | null> {
  const appHandle = getShopifyAppHandle();
  if (!appHandle || !shopifyPartnerApiConfig()) return null;
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
      shopifyBillingSyncedAt: true,
    },
  });
  let billing = {
    status: org.shopifyBillingStatus,
    planHandle: org.shopifyPlanName,
    trialEndsAt: org.shopifyTrialEndsAt,
  };
  if (shouldSyncShopifyBilling(org)) {
    const synced = await syncShopifyBilling(organizationId).catch((error: unknown) => {
      logger.warn({ err: error, orgId: organizationId }, '[Shopify billing] Could not read the plan');
      return null;
    });
    if (synced) billing = synced;
  }

  return {
    status: billing.status === 'active' || billing.status === 'inactive' ? billing.status : null,
    planName: planName(billing.planHandle),
    trialEndsAt: billing.trialEndsAt?.toISOString() ?? null,
    planPageUrl: shopifyPlanPageUrl(store.externalAccountId, appHandle),
  };
}
