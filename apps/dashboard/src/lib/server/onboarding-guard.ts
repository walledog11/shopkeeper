import { normalizeStoredOrgSettings } from "@shopkeeper/agent/settings"
import { db } from "@shopkeeper/db"
import {
  isEmailIntegrationConfigured,
  resolveOnboardingRedirectStep,
} from "@/lib/integrations/onboarding-setup"
import { isShopifyIntegrationOperational } from "@/lib/server/shopify-integration"

export async function getIncompleteOnboardingRedirect(
  organizationId: string,
  settings: unknown,
): Promise<string | null> {
  const normalized = normalizeStoredOrgSettings(settings)
  const integrations = await db.integration.findMany({
    where: { organizationId },
    select: {
      platform: true,
      accessToken: true,
      tokenExpiresAt: true,
      fromEmail: true,
      externalAccountId: true,
      metadata: true,
    },
  })

  const shopify = integrations.find(integration => integration.platform === "shopify")
  const email = integrations.find(integration => integration.platform === "email")
  const step = resolveOnboardingRedirectStep({
    onboardingCompletedAt: normalized.onboardingCompletedAt,
    hasShopify: shopify ? isShopifyIntegrationOperational(shopify) : false,
    hasEmail: isEmailIntegrationConfigured(email),
  })

  return step ? `/onboarding?step=${step}` : null
}
