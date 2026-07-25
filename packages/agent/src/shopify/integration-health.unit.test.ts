import { describe, expect, it } from "vitest";

import {
  getShopifyConnectionState,
  isShopifyIntegrationOperational,
  isShopifyIntegrationSweepable,
  isSimulatedShopifyIntegration,
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
