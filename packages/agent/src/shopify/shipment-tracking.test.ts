import { describe, expect, it } from "vitest";
import { classifyShipmentAlert } from "./shipment-alerts.js";
import {
  buildShopifyDegradedTrackingSnapshot,
  DEGRADED_STALL_AFTER_MS,
  isFullTierCarrier,
  isUspsCarrier,
  resolveShipmentTrackingTier,
} from "./shipment-tracking.js";

describe("isUspsCarrier", () => {
  it("recognizes common USPS labels", () => {
    expect(isUspsCarrier("USPS")).toBe(true);
    expect(isUspsCarrier("United States Postal Service")).toBe(true);
    expect(isUspsCarrier("UPS")).toBe(false);
  });
});

describe("resolveShipmentTrackingTier", () => {
  it("routes USPS through the degraded tier", () => {
    expect(resolveShipmentTrackingTier("USPS")).toBe("degraded");
  });

  it("routes supported carriers to full tier only when a provider is configured", () => {
    expect(resolveShipmentTrackingTier("UPS", false)).toBe("degraded");
    expect(resolveShipmentTrackingTier("UPS", true)).toBe("full");
    expect(isFullTierCarrier("FedEx")).toBe(true);
  });
});

describe("buildShopifyDegradedTrackingSnapshot", () => {
  it("maps Shopify fulfillment fields without inventing carrier scan events", () => {
    expect(buildShopifyDegradedTrackingSnapshot({
      shipmentStatus: "in_transit",
      statusUpdatedAt: "2026-07-10T10:00:00.000Z",
      fulfillmentCreatedAt: "2026-07-08T10:00:00.000Z",
      trackingCompany: "USPS",
    })).toEqual({
      status: "in_transit",
      statusSummary: "Shopify fulfillment record via USPS: in transit (no carrier scan history)",
      events: [{
        message: "Last Shopify fulfillment update",
        datetime: "2026-07-10T10:00:00.000Z",
      }],
    });
  });

  it("returns null for delivered fulfillments", () => {
    expect(buildShopifyDegradedTrackingSnapshot({
      shipmentStatus: "delivered",
      statusUpdatedAt: "2026-07-20T10:00:00.000Z",
      fulfillmentCreatedAt: "2026-07-08T10:00:00.000Z",
      trackingCompany: "USPS",
    })).toBeNull();
  });

  it("flags a six-day degraded stall through classifyShipmentAlert", () => {
    const snapshot = buildShopifyDegradedTrackingSnapshot({
      shipmentStatus: "in_transit",
      statusUpdatedAt: "2026-07-10T10:00:00.000Z",
      fulfillmentCreatedAt: "2026-07-08T10:00:00.000Z",
      trackingCompany: "USPS",
    });
    expect(snapshot).not.toBeNull();
    expect(classifyShipmentAlert(snapshot!, {
      now: new Date("2026-07-20T12:00:00.000Z"),
      stalledAfterMs: DEGRADED_STALL_AFTER_MS,
    })).toBe("stalled");
  });

  it("flags Shopify failure statuses as exceptions", () => {
    const snapshot = buildShopifyDegradedTrackingSnapshot({
      shipmentStatus: "failure",
      statusUpdatedAt: "2026-07-19T10:00:00.000Z",
      fulfillmentCreatedAt: "2026-07-08T10:00:00.000Z",
      trackingCompany: "USPS",
    });
    expect(classifyShipmentAlert(snapshot!, {
      now: new Date("2026-07-20T12:00:00.000Z"),
      stalledAfterMs: DEGRADED_STALL_AFTER_MS,
    })).toBe("exception");
  });
});
