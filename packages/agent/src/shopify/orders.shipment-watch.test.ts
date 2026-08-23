import { describe, expect, it } from "vitest";
import { extractShipmentsFromOrders } from "./orders.js";

describe("extractShipmentsFromOrders", () => {
  it("returns shipments with customer context", () => {
    expect(extractShipmentsFromOrders([{
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

  // The USPS-only filter came out with the USPS client: whatever carrier moved
  // the parcel, the shipment is handed to the provider that will look it up.
  it("keeps shipments from every carrier", () => {
    expect(extractShipmentsFromOrders([{
      id: 1002,
      customer: { id: 56 },
      fulfillments: [
        { status: "success", tracking_company: "UPS", tracking_number: "1Z-ONE" },
        { status: "success", tracking_company: "DHL", tracking_number: "DH-TWO" },
      ],
    }]).map(shipment => shipment.trackingCompany)).toEqual(["UPS", "DHL"]);
  });

  it("deduplicates repeated tracking numbers on the same order", () => {
    expect(extractShipmentsFromOrders([{
      id: 1001,
      customer: { id: 55 },
      fulfillments: [
        { status: "success", tracking_company: "USPS", tracking_number: "9400" },
        { status: "success", tracking_company: "USPS", tracking_number: "9400" },
      ],
    }])).toHaveLength(1);
  });
});
