import { describe, expect, it } from "vitest"
import {
  isEmailIntegrationConfigured,
  resolveOnboardingRedirectStep,
} from "./onboarding-setup"

describe("isEmailIntegrationConfigured", () => {
  it("accepts postmark forwarding without fromEmail", () => {
    expect(isEmailIntegrationConfigured({
      platform: "email",
      externalAccountId: "support@store.com",
      metadata: { provider: "postmark" },
    })).toBe(true)
  })

  it("requires support address for oauth email", () => {
    expect(isEmailIntegrationConfigured({
      platform: "email",
      externalAccountId: "",
      metadata: { provider: "gmail" },
    })).toBe(false)

    expect(isEmailIntegrationConfigured({
      platform: "email",
      externalAccountId: "support@store.com",
      metadata: { provider: "gmail" },
    })).toBe(true)
  })
})

describe("resolveOnboardingRedirectStep", () => {
  it("returns null when onboarding is complete", () => {
    expect(resolveOnboardingRedirectStep({
      onboardingCompletedAt: "2026-06-16T00:00:00.000Z",
      hasShopify: false,
      hasEmail: false,
      hasPhone: false,
    })).toBeNull()
  })

  it("prioritizes shopify, email, connect, then plan", () => {
    expect(resolveOnboardingRedirectStep({
      hasShopify: false,
      hasEmail: false,
      hasPhone: false,
    })).toBe("shopify")

    expect(resolveOnboardingRedirectStep({
      hasShopify: true,
      hasEmail: false,
      hasPhone: false,
    })).toBe("email")

    expect(resolveOnboardingRedirectStep({
      hasShopify: true,
      hasEmail: true,
      hasPhone: false,
    })).toBe("connect")

    expect(resolveOnboardingRedirectStep({
      hasShopify: true,
      hasEmail: true,
      hasPhone: true,
    })).toBe("plan")
  })
})
