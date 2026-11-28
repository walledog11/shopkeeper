import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { getSocialApiConnectConfig, resolveInstagramConnectTransport } from "./config"

function configureSocialApi() {
  vi.stubEnv("SOCIALAPI_API_KEY", "sapi-key")
  vi.stubEnv("SOCIALAPI_BRAND_ID", "brand_1")
}

describe("SocialAPI connect config", () => {
  beforeEach(() => {
    vi.stubEnv("SOCIALAPI_API_KEY", "")
    vi.stubEnv("SOCIALAPI_BRAND_ID", "")
    vi.stubEnv("SOCIALAPI_BASE_URL", "")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("is closed until the key and the brand are both present", () => {
    expect(getSocialApiConnectConfig()).toBeNull()

    vi.stubEnv("SOCIALAPI_API_KEY", "sapi-key")
    expect(getSocialApiConnectConfig()).toBeNull()

    vi.stubEnv("SOCIALAPI_BRAND_ID", "brand_1")
    expect(getSocialApiConnectConfig()).toEqual({
      apiKey: "sapi-key",
      baseUrl: "https://api.social-api.ai/v1",
      brandId: "brand_1",
    })
  })

  // A test origin in production would route merchant OAuth and DMs away from the
  // vendor, so the override exists only outside production.
  it("ignores a base-url override in production", () => {
    configureSocialApi()
    vi.stubEnv("SOCIALAPI_BASE_URL", "https://staging.example.com/v1")
    expect(getSocialApiConnectConfig()?.baseUrl).toBe("https://staging.example.com/v1")

    vi.stubEnv("NODE_ENV", "production")
    expect(getSocialApiConnectConfig()?.baseUrl).toBe("https://api.social-api.ai/v1")
  })
})

describe("resolveInstagramConnectTransport", () => {
  beforeEach(() => {
    vi.stubEnv("SOCIALAPI_API_KEY", "")
    vi.stubEnv("SOCIALAPI_BRAND_ID", "")
    vi.stubEnv("INSTAGRAM_INTEGRATION_ENABLED", "")
    vi.stubEnv("INSTAGRAM_BETA_ORG_IDS", "")
    vi.stubEnv("NODE_ENV", "production")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("opens SocialAPI to every workspace once it is configured", () => {
    configureSocialApi()
    vi.stubEnv("INSTAGRAM_INTEGRATION_ENABLED", "true")
    vi.stubEnv("INSTAGRAM_BETA_ORG_IDS", "org_a")

    expect(resolveInstagramConnectTransport("org_a")).toBe("socialapi")
    expect(resolveInstagramConnectTransport("org_b")).toBe("socialapi")
  })

  it("falls back to direct Meta only for a workspace still on that allowlist", () => {
    vi.stubEnv("INSTAGRAM_INTEGRATION_ENABLED", "true")
    vi.stubEnv("INSTAGRAM_BETA_ORG_IDS", "org_direct")

    expect(resolveInstagramConnectTransport("org_direct")).toBe("meta_direct")
    expect(resolveInstagramConnectTransport("org_other")).toBeNull()
  })

  it("is closed when neither transport is configured", () => {
    expect(resolveInstagramConnectTransport("org_a")).toBeNull()
  })
})
