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
    expect(payload.note).toContain("tracking_url");
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

  // The USPS client this tool used to call is gone. One Shopify request, and no
  // second hop to a carrier — a USPS shipment is now read exactly like a UPS one.
  it("makes exactly one request and never calls a carrier API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      fulfillments: [fulfillment()],
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getOrderTracking({ order_id: "123" }, ctx);
    const payload = JSON.parse(result.message);

    expect(result.status).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("test-store.myshopify.com");
    expect(payload).not.toHaveProperty("live_usps_tracking");
    expect(payload.shipments[0]).toMatchObject({
      tracking_number: "9400111899223856928499",
      tracking_company: "USPS",
      shipment_status: "in_transit",
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
