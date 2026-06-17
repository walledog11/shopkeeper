import { getEmailProvider } from "@shopkeeper/email/providers"

export type EmailIntegrationLike = {
  platform?: string
  fromEmail?: string | null
  externalAccountId?: string
  metadata?: unknown | null
} | null | undefined

export type OnboardingResumeStep = "shopify" | "email" | "plan"

export const ONBOARDING_ESSENTIALS_TOTAL = 3

export function isEmailIntegrationConfigured(integration: EmailIntegrationLike): boolean {
  if (!integration || integration.platform !== "email") return false
  if (getEmailProvider(integration) === "postmark") return true
  return !!((integration.fromEmail ?? integration.externalAccountId)?.trim())
}

export function resolveOnboardingRedirectStep(args: {
  onboardingCompletedAt?: string
  hasShopify: boolean
  hasEmail: boolean
}): OnboardingResumeStep | null {
  if (args.onboardingCompletedAt) return null
  if (!args.hasShopify) return "shopify"
  if (!args.hasEmail) return "email"
  return "plan"
}

export function countOnboardingEssentials(args: {
  storeBriefed: boolean
  hasShopify: boolean
  hasEmail: boolean
}): number {
  return [args.storeBriefed, args.hasShopify, args.hasEmail].filter(Boolean).length
}

export function resolveOnboardingStepIndex(
  stepId: OnboardingResumeStep | null | undefined,
  fallbackIdx: number,
  stepIds: readonly string[],
): number {
  if (!stepId) return fallbackIdx
  const idx = stepIds.indexOf(stepId)
  return idx >= 0 ? idx : fallbackIdx
}
