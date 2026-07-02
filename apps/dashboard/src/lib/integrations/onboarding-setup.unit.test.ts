import { describe, expect, it } from "vitest"
import {
  isEmailIntegrationConfigured,
  resolveOnboardingRedirectStep,
  resolveOnboardingStepIndex,
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
    })).toBeNull()
  })

  it("prioritizes shopify before email", () => {
    expect(resolveOnboardingRedirectStep({
      hasShopify: false,
      hasEmail: false,
    })).toBe("shopify")

    expect(resolveOnboardingRedirectStep({
      hasShopify: true,
      hasEmail: false,
    })).toBe("email")

    expect(resolveOnboardingRedirectStep({
      hasShopify: true,
      hasEmail: true,
    })).toBe("plan")
  })
})

describe("resolveOnboardingStepIndex", () => {
  it("maps step query params to onboarding indices", () => {
    const ids = ["intro", "shopify", "email", "connect", "plan"]
    expect(resolveOnboardingStepIndex("email", 0, ids)).toBe(2)
    expect(resolveOnboardingStepIndex("plan", 0, ids)).toBe(4)
    expect(resolveOnboardingStepIndex(null, 2, ids)).toBe(2)
  })
})
