import { db } from "@shopkeeper/db"
import { normalizeStoredOrgSettings } from "@shopkeeper/agent/settings"
import { isShopifyIntegrationOperational } from "@shopkeeper/agent/shopify/integration-health"

/**
 * Where a workspace that hasn't finished setup goes instead of the dashboard:
 * the store step until Shopify is connected, after which setup resumes wherever
 * the merchant left it. Null once setup is finished.
 */
export async function getIncompleteOnboardingRedirect(
  organizationId: string,
  settings: unknown,
): Promise<string | null> {
  if (normalizeStoredOrgSettings(settings).onboardingCompletedAt) return null
  const stores = await db.integration.findMany({
    where: { organizationId, platform: "shopify", lifecycleStatus: "active" },
    select: { accessToken: true, tokenExpiresAt: true },
  })
  return stores.some(isShopifyIntegrationOperational) ? "/onboarding" : "/onboarding?step=shopify"
}
