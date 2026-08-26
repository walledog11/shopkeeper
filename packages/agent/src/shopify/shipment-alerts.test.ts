import { describe, expect, it } from "vitest";
import { classifyShipmentAlert, formatDeliveryExceptionNotification } from "./shipment-alerts.js";

describe("classifyShipmentAlert", () => {
  const now = new Date("2026-07-20T12:00:00.000Z");

  it("flags carrier exceptions from status text", () => {
    expect(classifyShipmentAlert({
      status: "Alert",
      statusSummary: "Return to Sender",
      events: [],
    }, { now })).toBe("exception");
  });

  it("flags exception events in the scan timeline", () => {
    expect(classifyShipmentAlert({
      status: "In Transit",
      statusSummary: null,
      events: [{ message: "Delivery attempt failed", datetime: "2026-07-19T10:00:00.000Z" }],
    }, { now })).toBe("exception");
  });

  it("flags stalled in-transit shipments with stale scans", () => {
    expect(classifyShipmentAlert({
      status: "In Transit",
      statusSummary: "Moving through network",
      events: [{ message: "Arrived at facility", datetime: "2026-07-10T10:00:00.000Z" }],
    }, { now, stalledAfterMs: 5 * 24 * 3_600_000 })).toBe("stalled");
  });

  it("flags Shopify failure statuses as exceptions", () => {
    expect(classifyShipmentAlert({
      status: "failure",
      statusSummary: "Shopify fulfillment record via USPS: failure (no carrier scan history)",
      events: [],
    }, { now })).toBe("exception");
  });

  it("ignores delivered shipments", () => {
    expect(classifyShipmentAlert({
      status: "Delivered",
      statusSummary: "Delivered, In/At Mailbox",
      events: [],
    }, { now })).toBeNull();
  });
});

describe("formatDeliveryExceptionNotification", () => {
  it("describes degraded stalled shipments plainly", () => {
    expect(formatDeliveryExceptionNotification({
      customerName: "Sarah Jones",
      orderId: "1001",
      trackingNumber: "9400",
      issueKind: "stalled",
      statusSummary: null,
      trackingSource: "shopify_degraded",
    })).toContain("Shopify's fulfillment record");
  });

  it("describes stalled shipments plainly", () => {
    expect(formatDeliveryExceptionNotification({
      customerName: "Sarah Jones",
      orderId: "1001",
      trackingNumber: "9400",
      issueKind: "stalled",
      statusSummary: null,
    })).toContain("looks stalled");
  });

  it("includes exception detail when available", () => {
    expect(formatDeliveryExceptionNotification({
      customerName: "Sarah Jones",
      orderId: "1001",
      trackingNumber: "9400",
      issueKind: "exception",
      statusSummary: "Return to Sender",
    })).toContain("Return to Sender");
  });
});
