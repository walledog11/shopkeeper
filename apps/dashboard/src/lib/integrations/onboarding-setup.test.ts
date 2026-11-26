import { describe, expect, it } from "vitest"
import { isEmailIntegrationConfigured } from "./onboarding-setup"

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
