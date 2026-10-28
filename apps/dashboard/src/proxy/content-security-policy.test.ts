import { afterEach, describe, expect, it, vi } from "vitest";
import { cspDirectives } from "./content-security-policy";

describe("cspDirectives", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Chrome checks every redirect hop of a form submission against `form-action`.
  // The OAuth popup shell POSTs same-origin and 303s to the provider, so a
  // missing origin here blocks the connect with no visible error.
  it("allows the provider authorize origins each connect flow redirects to", () => {
    expect(cspDirectives["form-action"]).toEqual(
      expect.arrayContaining([
        "'self'",
        "https://accounts.google.com",
        "https://*.myshopify.com",
        "https://admin.shopify.com",
        "https://www.instagram.com",
        "https://www.facebook.com",
      ]),
    );
  });

  // SocialAPI mints the authorize URL at connect time, so its host cannot be
  // hardcoded. Without the vendor domain the connect dies on the popup spinner
  // with no console error — the 2026-08-15 CSP failure, one provider later.
  // The directives are built at import, so each case needs a fresh module.
  it("omits the SocialAPI authorize hop while that transport is switched off", async () => {
    expect((await freshDirectives())["form-action"]).not.toContain("https://*.social-api.ai");
  });

  it("allows the SocialAPI authorize hop and a non-production base origin", async () => {
    vi.stubEnv("SOCIALAPI_ENABLED", "true");
    vi.stubEnv("SOCIALAPI_BASE_URL", "https://staging.social-api.test/v1");

    expect((await freshDirectives())["form-action"]).toEqual(
      expect.arrayContaining([
        "https://social-api.ai",
        "https://*.social-api.ai",
        "https://staging.social-api.test",
      ]),
    );
  });
});

async function freshDirectives() {
  vi.resetModules();
  return (await import("./content-security-policy")).cspDirectives;
}
