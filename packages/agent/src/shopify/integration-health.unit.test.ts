import { describe, expect, it } from "vitest";

import {
  SHOPIFY_OAUTH_SCOPES,
  getShopifyConnectionState,
  grantCoversScopes,
  isShopifyIntegrationOperational,
  isShopifyIntegrationSweepable,
  isSimulatedShopifyIntegration,
  missingShopifyScopes,
  recordedShopifyScopes,
  unmetScopes,
} from "./integration-health.js";

const HOUR_MS = 3_600_000;

describe("getShopifyConnectionState", () => {
  it("reads a tokened integration with no expiry as active", () => {
    expect(getShopifyConnectionState({ accessToken: "tok", tokenExpiresAt: null })).toBe("active");
  });

  it("reads a missing token as incomplete", () => {
    expect(getShopifyConnectionState({ accessToken: null, tokenExpiresAt: null })).toBe("incomplete");
  });

  it("reads an expired token as invalid", () => {
    expect(
      getShopifyConnectionState({
        accessToken: "tok",
        tokenExpiresAt: new Date(Date.now() - HOUR_MS),
      }),
    ).toBe("invalid");
  });

  it("reads a future expiry as active", () => {
    expect(
      getShopifyConnectionState({
        accessToken: "tok",
        tokenExpiresAt: new Date(Date.now() + HOUR_MS),
      }),
    ).toBe("active");
  });
});

describe("isSimulatedShopifyIntegration", () => {
  it("detects the simulator marker", () => {
    expect(isSimulatedShopifyIntegration({ simulated: true, label: "demo" })).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isSimulatedShopifyIntegration({ simulated: false })).toBe(false);
    expect(isSimulatedShopifyIntegration({ simulated: "true" })).toBe(false);
    expect(isSimulatedShopifyIntegration({})).toBe(false);
    expect(isSimulatedShopifyIntegration(null)).toBe(false);
    expect(isSimulatedShopifyIntegration(undefined)).toBe(false);
    expect(isSimulatedShopifyIntegration("simulated")).toBe(false);
  });
});

describe("isShopifyIntegrationSweepable", () => {
  // The whole reason this predicate is not just the operational check: simulator
  // rows carry a live-looking token and no expiry, so they read as operational.
  it("excludes a simulated integration that is otherwise operational", () => {
    const simulated = {
      accessToken: "shopkeeper-development-simulator",
      tokenExpiresAt: null,
      metadata: { simulated: true, label: "Shopkeeper demo store" },
    };

    expect(isShopifyIntegrationOperational(simulated)).toBe(true);
    expect(isShopifyIntegrationSweepable(simulated)).toBe(false);
  });

  it("includes a real operational integration", () => {
    expect(
      isShopifyIntegrationSweepable({
        accessToken: "tok",
        tokenExpiresAt: null,
        metadata: { label: "palette-dev" },
      }),
    ).toBe(true);
  });

  it("excludes expired and tokenless integrations", () => {
    expect(
      isShopifyIntegrationSweepable({
        accessToken: "tok",
        tokenExpiresAt: new Date(Date.now() - HOUR_MS),
        metadata: null,
      }),
    ).toBe(false);
    expect(
      isShopifyIntegrationSweepable({ accessToken: null, tokenExpiresAt: null, metadata: null }),
    ).toBe(false);
  });

  it("treats an absent metadata field as not simulated", () => {
    expect(isShopifyIntegrationSweepable({ accessToken: "tok", tokenExpiresAt: null })).toBe(true);
  });
});

describe("missingShopifyScopes", () => {
  it("reports nothing for a grant that matches the requested set", () => {
    expect(missingShopifyScopes([...SHOPIFY_OAUTH_SCOPES])).toEqual([]);
  });

  it("reports every requested scope for an empty grant", () => {
    expect(missingShopifyScopes([])).toEqual([...SHOPIFY_OAUTH_SCOPES]);
  });

  // The case this probe exists for: an install predating the 2026-07-06
  // capability expansion, where gift cards and store credit fail as 403s.
  it("reports the scopes an older install never received", () => {
    const older = SHOPIFY_OAUTH_SCOPES.filter((scope) => (
      scope !== "write_gift_cards"
      && scope !== "read_store_credit_accounts"
      && scope !== "write_store_credit_account_transactions"
    ));

    expect(missingShopifyScopes(older)).toEqual([
      "write_gift_cards",
      "read_store_credit_accounts",
      "write_store_credit_account_transactions",
    ]);
  });

  it("reports the fulfillment-order scopes required by fulfill_order", () => {
    const withoutFulfillment = SHOPIFY_OAUTH_SCOPES.filter(
      (scope) => !scope.endsWith("_merchant_managed_fulfillment_orders"),
    );

    expect(missingShopifyScopes(withoutFulfillment)).toEqual([
      "read_merchant_managed_fulfillment_orders",
      "write_merchant_managed_fulfillment_orders",
    ]);
  });

  it("reports the discount scope required by issue_discount", () => {
    const withoutDiscounts = SHOPIFY_OAUTH_SCOPES.filter((scope) => scope !== "write_discounts");

    expect(missingShopifyScopes(withoutDiscounts)).toEqual(["write_discounts"]);
  });

  // The reads left over are the ones with no matching write in the requested
  // set. `read_products` dropped off this list when `write_products` joined it
  // for enumerated-variant repricing, because a write grant implies its read.
  it("accepts a write grant in place of the implied read", () => {
    const impliedReads = SHOPIFY_OAUTH_SCOPES.filter((scope) => !scope.startsWith("read_"));

    expect(missingShopifyScopes(impliedReads)).toEqual([
      "read_content",
      "read_store_credit_accounts",
    ]);
  });

  it("ignores case and surrounding whitespace in the granted list", () => {
    expect(missingShopifyScopes(SHOPIFY_OAUTH_SCOPES.map((scope) => ` ${scope.toUpperCase()} `))).toEqual([]);
  });
});

describe("grantCoversScopes", () => {
  it("covers a capability that asks for nothing", () => {
    expect(grantCoversScopes([], [])).toBe(true);
  });

  it("withholds a capability from a grant that predates it", () => {
    const older = SHOPIFY_OAUTH_SCOPES.filter((scope) => scope !== "write_products");
    expect(grantCoversScopes(older, ["write_products"])).toBe(false);
    expect(unmetScopes(older, ["write_products"])).toEqual(["write_products"]);
  });

  it("accepts an implied read from the matching write grant", () => {
    expect(grantCoversScopes(["write_products"], ["read_products"])).toBe(true);
    expect(unmetScopes(["write_products"], ["read_products"])).toEqual([]);
  });

  // The implication runs one way only: holding a read never confers the write.
  it("does not let a read grant stand in for a write", () => {
    expect(grantCoversScopes(["read_products"], ["write_products"])).toBe(false);
  });

  it("ignores casing and padding the provider may return", () => {
    expect(grantCoversScopes([" WRITE_PRODUCTS "], ["write_products"])).toBe(true);
  });

  it("needs every required scope, not just one", () => {
    expect(grantCoversScopes(["write_discounts"], ["write_discounts", "write_products"]))
      .toBe(false);
    expect(unmetScopes(["write_discounts"], ["write_discounts", "write_products"]))
      .toEqual(["write_products"]);
  });
});

describe("recordedShopifyScopes", () => {
  it("distinguishes an unrecorded grant from an empty one", () => {
    expect(recordedShopifyScopes(null)).toBeNull();
    expect(recordedShopifyScopes({})).toBeNull();
    expect(recordedShopifyScopes({ oauthScopes: [] })).toEqual([]);
  });

  it("keeps only string entries", () => {
    expect(recordedShopifyScopes({ oauthScopes: ["read_orders", 7, null] }))
      .toEqual(["read_orders"]);
  });
});
