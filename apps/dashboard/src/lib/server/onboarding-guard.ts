import { db } from "@shopkeeper/db"
import { normalizeStoredOrgSettings } from "@shopkeeper/agent/settings"
import { isShopifyIntegrationOperational } from "@shopkeeper/agent/shopify/integration-health"
import { isStorefrontChatEnabledForIntegration, isStorefrontChatGloballyEnabled } from "@/lib/storefront-chat/enabled"
import { isEmailIntegrationConfigured, resolveOnboardingRedirectStep } from "@/lib/integrations/onboarding-setup"

export async function getIncompleteOnboardingRedirect(
  organizationId: string,
  settings: unknown,
  clerkUserId: string | null,
): Promise<string | null> {
  const normalized = normalizeStoredOrgSettings(settings)
  if (normalized.onboardingCompletedAt) return null
  const [integrations, member] = await Promise.all([
    db.integration.findMany({
      where: { organizationId, lifecycleStatus: "active" },
      select: { platform: true, accessToken: true, tokenExpiresAt: true, externalAccountId: true, fromEmail: true, emailProvider: true, metadata: true },
    }),
    clerkUserId ? db.orgMember.findUnique({ where: { organizationId_clerkUserId: { organizationId, clerkUserId } }, select: { _count: { select: { imessageBindings: true } } } }) : null,
  ])
  const store = integrations.find(integration => integration.platform === "shopify")
  const hasShopify = Boolean(store && isShopifyIntegrationOperational(store))
  const step = resolveOnboardingRedirectStep({
    hasShopify,
    hasEmail: integrations.some(isEmailIntegrationConfigured),
    hasInstagram: integrations.some(integration => integration.platform === "ig_dm" && integration.externalAccountId.trim()),
    hasStorefrontChat: isStorefrontChatGloballyEnabled() && hasShopify && isStorefrontChatEnabledForIntegration(store?.metadata),
    hasPhone: clerkUserId ? (member?._count.imessageBindings ?? 0) > 0 : true,
  })
  return step ? `/onboarding?step=${step}` : null
}
