import { afterEach, describe, expect, it, vi } from "vitest";
import { getOrderTracking } from "./tracking.js";

const ctx = {
  shop: "test-store.myshopify.com",
  accessToken: "shpat_test",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function fulfillment(overrides: Record<string, unknown> = {}) {
  return {
    status: "success",
    shipment_status: "in_transit",
    tracking_number: "9400111899223856928499",
    tracking_company: "USPS",
    tracking_url: "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400",
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("getOrderTracking", () => {
  it("validates the order id without calling Shopify", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await getOrderTracking({ order_id: "not-an-id" }, ctx);

    expect(result.status).toBe("error");
    expect(result.message).toContain("order_id must be a numeric Shopify ID");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns not_found when the order has no fulfillments", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ fulfillments: [] })));

    const result = await getOrderTracking({ order_id: "123" }, ctx);

    expect(result).toEqual({
      status: "not_found",
      message: "This order has not been fulfilled yet - no tracking information is available.",
    });
  });

  it("serializes every tracking number and falls back to the first URL", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      fulfillments: [fulfillment({
        tracking_company: "UPS",
        tracking_number: null,
        tracking_numbers: ["1Z-ONE", "1Z-TWO"],
        tracking_url: null,
        tracking_urls: ["https://ups.example/one"],
      })],
    })));

    const result = await getOrderTracking({ order_id: "123" }, ctx);
    const payload = JSON.parse(result.message);

    expect(result.status).toBe("ok");
    expect(payload.shipments).toEqual([
      expect.objectContaining({ tracking_number: "1Z-ONE", tracking_url: "https://ups.example/one" }),
      expect.objectContaining({ tracking_number: "1Z-TWO", tracking_url: "https://ups.example/one" }),
    ]);
    expect(payload.note).toContain("only available for USPS");
  });

  it("preserves a fulfillment with no tracking number", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      fulfillments: [fulfillment({
        tracking_number: null,
        tracking_numbers: [],
        tracking_url: "https://carrier.example/order",
      })],
    })));

    const result = await getOrderTracking({ order_id: "123" }, ctx);

    expect(JSON.parse(result.message).shipments[0]).toMatchObject({
      tracking_number: null,
      tracking_url: "https://carrier.example/order",
      note: "Fulfillment has no tracking number.",
    });
  });

  it("reports missing USPS credentials without attempting authentication", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      fulfillments: [fulfillment()],
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getOrderTracking({ order_id: "123" }, ctx);

    expect(JSON.parse(result.message).note).toContain("USPS API is not configured");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("handles USPS authentication and tracking failures as non-fatal fallbacks", async () => {
    vi.stubEnv("USPS_CLIENT_ID", "client");
    vi.stubEnv("USPS_CLIENT_SECRET", "secret");
    const authFailure = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ fulfillments: [fulfillment()] }))
      .mockResolvedValueOnce(jsonResponse({ error: "invalid_client" }, 401));
    vi.stubGlobal("fetch", authFailure);

    const authResult = await getOrderTracking({ order_id: "123" }, ctx);
    expect(JSON.parse(authResult.message).note).toContain("USPS authentication failed");

    const trackingFailure = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ fulfillments: [fulfillment()] }))
      .mockResolvedValueOnce(jsonResponse({ access_token: "usps-token", expires_in: 0 }))
      .mockResolvedValueOnce(jsonResponse({ error: "unavailable" }, 503));
    vi.stubGlobal("fetch", trackingFailure);

    const trackingResult = await getOrderTracking({ order_id: "124" }, ctx);
    expect(JSON.parse(trackingResult.message).note).toContain("USPS data unavailable");
  });

  it("maps USPS events and reuses a valid access token", async () => {
    vi.stubEnv("USPS_CLIENT_ID", "cache-client");
    vi.stubEnv("USPS_CLIENT_SECRET", "cache-secret");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ fulfillments: [fulfillment()] }))
      .mockResolvedValueOnce(jsonResponse({ access_token: "cached-token", expires_in: 300 }))
      .mockResolvedValueOnce(jsonResponse({
        statusCategory: "In Transit",
        statusSummary: "Moving through network",
        trackingEvents: [{
          eventType: "Arrived at facility",
          eventTimestamp: "2026-06-27T10:00:00Z",
          eventCity: "Los Angeles",
          eventState: "CA",
          eventZIP: "90001",
        }],
      }))
      .mockResolvedValueOnce(jsonResponse({ fulfillments: [fulfillment({ tracking_number: "94002" })] }))
      .mockResolvedValueOnce(jsonResponse({ status: "Delivered", trackingEvents: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await getOrderTracking({ order_id: "123" }, ctx);
    const second = await getOrderTracking({ order_id: "124" }, ctx);

    expect(JSON.parse(first.message).live_usps_tracking).toMatchObject({
      status: "In Transit",
      events: [{
        message: "Arrived at facility",
        datetime: "2026-06-27T10:00:00Z",
        location: "Los Angeles, CA, 90001",
      }],
    });
    expect(JSON.parse(second.message).live_usps_tracking.status).toBe("Delivered");
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/oauth2/v3/token"))).toHaveLength(1);
    expect(fetchMock.mock.calls.at(-1)?.[1]).toMatchObject({
      headers: { Authorization: "Bearer cached-token" },
    });
  });

  it("surfaces Shopify provider errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ errors: "Order not found" }, 404)));

    const result = await getOrderTracking({ order_id: "999" }, ctx);

    expect(result).toEqual({
      status: "error",
      message: "Error: could not fetch fulfillments (404) - Order not found",
    });
  });
});
