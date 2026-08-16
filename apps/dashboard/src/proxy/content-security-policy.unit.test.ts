import { describe, expect, it } from "vitest";
import { cspDirectives } from "./content-security-policy";

describe("cspDirectives", () => {
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
});
