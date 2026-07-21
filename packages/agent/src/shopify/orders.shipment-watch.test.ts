import { describe, expect, it } from "vitest";
import { extractUspsShipmentsFromOrders } from "./orders.js";

describe("extractUspsShipmentsFromOrders", () => {
  it("returns USPS shipments with customer context", () => {
    expect(extractUspsShipmentsFromOrders([{
      id: 1001,
      customer: { id: 55, first_name: "Sarah", last_name: "Jones" },
      fulfillments: [{
        status: "success",
        tracking_company: "USPS",
        tracking_number: "9400",
      }],
    }])).toEqual([{
      orderId: "1001",
      customerShopifyId: "55",
      customerName: "Sarah Jones",
      customerEmail: null,
      trackingNumber: "9400",
      trackingCompany: "USPS",
    }]);
  });

  it("deduplicates repeated tracking numbers on the same order", () => {
    expect(extractUspsShipmentsFromOrders([{
      id: 1001,
      customer: { id: 55 },
      fulfillments: [
        { status: "success", tracking_company: "USPS", tracking_number: "9400" },
        { status: "success", tracking_company: "USPS", tracking_number: "9400" },
      ],
    }])).toHaveLength(1);
  });
});
