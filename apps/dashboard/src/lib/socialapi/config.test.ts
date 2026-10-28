import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  getSocialApiConnectConfig,
  resolveInstagramConnectTransport,
  resolveSocialApiBrandForOrg,
} from "./config"

function enableSocialApi(assignments: string) {
  vi.stubEnv("SOCIALAPI_ENABLED", "true")
  vi.stubEnv("SOCIALAPI_API_KEY", "sapi-key")
  vi.stubEnv("SOCIALAPI_BRAND_ASSIGNMENTS", assignments)
}

describe("SocialAPI connect config", () => {
  beforeEach(() => {
    vi.stubEnv("SOCIALAPI_ENABLED", "")
    vi.stubEnv("SOCIALAPI_API_KEY", "")
    vi.stubEnv("SOCIALAPI_BRAND_ASSIGNMENTS", "")
    vi.stubEnv("SOCIALAPI_MAX_ACTIVE_ORGS", "")
    vi.stubEnv("SOCIALAPI_BASE_URL", "")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("is closed until the switch and a key are both present", () => {
    expect(getSocialApiConnectConfig()).toBeNull()

    vi.stubEnv("SOCIALAPI_ENABLED", "true")
    expect(getSocialApiConnectConfig()).toBeNull()

    vi.stubEnv("SOCIALAPI_API_KEY", "sapi-key")
    expect(getSocialApiConnectConfig()).not.toBeNull()
  })

  it("resolves the brand an operator assigned to the workspace", () => {
    enableSocialApi("org_a:brand_1, org_b:brand_2")

    expect(resolveSocialApiBrandForOrg("org_b")).toEqual({
      apiKey: "sapi-key",
      baseUrl: "https://api.social-api.ai/v1",
      brandId: "brand_2",
    })
    expect(resolveSocialApiBrandForOrg("org_c")).toBeNull()
    expect(resolveSocialApiBrandForOrg(null)).toBeNull()
  })

  // The assignment map is the slot allocation, so a map larger than the cap is a
  // provisioning mistake that must close connect rather than overfill the vendor
  // account quietly.
  it("closes connect when assignments exceed the slot cap", () => {
    enableSocialApi("org_a:brand_1, org_b:brand_2, org_c:brand_3")
    vi.stubEnv("SOCIALAPI_MAX_ACTIVE_ORGS", "2")

    expect(getSocialApiConnectConfig()).toBeNull()
    expect(resolveSocialApiBrandForOrg("org_a")).toBeNull()
  })

  it("refuses a cap above the vendor ceiling and a malformed assignment", () => {
    enableSocialApi("org_a:brand_1")
    vi.stubEnv("SOCIALAPI_MAX_ACTIVE_ORGS", "9")
    expect(() => getSocialApiConnectConfig()).toThrow(/SOCIALAPI_MAX_ACTIVE_ORGS/)

    vi.stubEnv("SOCIALAPI_MAX_ACTIVE_ORGS", "")
    vi.stubEnv("SOCIALAPI_BRAND_ASSIGNMENTS", "org_a")
    expect(() => getSocialApiConnectConfig()).toThrow(/clerk_org_id:brand_id/)

    vi.stubEnv("SOCIALAPI_BRAND_ASSIGNMENTS", "org_a:brand_1,org_a:brand_2")
    expect(() => getSocialApiConnectConfig()).toThrow(/two brands/)
  })

  // A test origin in production would route merchant OAuth and DMs away from the
  // vendor, so the override exists only outside production.
  it("ignores a base-url override in production", () => {
    enableSocialApi("org_a:brand_1")
    vi.stubEnv("SOCIALAPI_BASE_URL", "https://staging.example.com/v1")
    expect(getSocialApiConnectConfig()?.baseUrl).toBe("https://staging.example.com/v1")

    vi.stubEnv("NODE_ENV", "production")
    expect(getSocialApiConnectConfig()?.baseUrl).toBe("https://api.social-api.ai/v1")
  })
})

describe("resolveInstagramConnectTransport", () => {
  beforeEach(() => {
    vi.stubEnv("SOCIALAPI_ENABLED", "")
    vi.stubEnv("SOCIALAPI_API_KEY", "")
    vi.stubEnv("SOCIALAPI_BRAND_ASSIGNMENTS", "")
    vi.stubEnv("INSTAGRAM_INTEGRATION_ENABLED", "")
    vi.stubEnv("INSTAGRAM_BETA_ORG_IDS", "")
    vi.stubEnv("NODE_ENV", "production")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("prefers SocialAPI for an assigned workspace", () => {
    enableSocialApi("org_a:brand_1")
    vi.stubEnv("INSTAGRAM_INTEGRATION_ENABLED", "true")
    vi.stubEnv("INSTAGRAM_BETA_ORG_IDS", "org_a")

    expect(resolveInstagramConnectTransport("org_a")).toBe("socialapi")
  })

  it("falls back to direct Meta only for a workspace still on that allowlist", () => {
    vi.stubEnv("INSTAGRAM_INTEGRATION_ENABLED", "true")
    vi.stubEnv("INSTAGRAM_BETA_ORG_IDS", "org_direct")

    expect(resolveInstagramConnectTransport("org_direct")).toBe("meta_direct")
    expect(resolveInstagramConnectTransport("org_other")).toBeNull()
  })

  it("is closed when neither transport is open to the workspace", () => {
    expect(resolveInstagramConnectTransport("org_a")).toBeNull()
  })
})
