import { normalizeStoredOrgSettings } from "@shopkeeper/agent/settings"
import { resolveOnboardingRedirectStep } from "@/lib/integrations/onboarding-setup"
import { getHomeChannelState } from "@/lib/server/home-summary"

export async function getIncompleteOnboardingRedirect(
  organizationId: string,
  settings: unknown,
  clerkUserId: string | null,
): Promise<string | null> {
  const normalized = normalizeStoredOrgSettings(settings)
  const channels = await getHomeChannelState(organizationId, clerkUserId)

  const step = resolveOnboardingRedirectStep({
    onboardingCompletedAt: normalized.onboardingCompletedAt,
    hasShopify: channels.hasShopify,
    hasEmail: channels.hasEmailForwarding,
    hasPhone: clerkUserId ? channels.hasPhoneBound : true,
  })

  return step ? `/onboarding?step=${step}` : null
}
