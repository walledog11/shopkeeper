import type { GetOrderTrackingInput } from "../tools/index.js";
import { formatShopifyToolError, shopifyRestJson, type ShopifyContext } from "./client.js";
import { toolError, toolNotFound, toolOk, type ToolResult } from "../tools/result.js";
import type { ShopifyFulfillment } from "./types.js";
import { requireNumericId } from "./validation.js";

type TrackingShipment = {
  fulfillment_status: string;
  shipment_status: string | null;
  tracking_number: string | null;
  tracking_company: string | null;
  tracking_url: string | null;
  note?: string;
};

function fulfillmentTrackingNumbers(fulfillment: ShopifyFulfillment): string[] {
  const trackingNumbers = fulfillment.tracking_numbers?.filter(Boolean) ?? [];
  if (trackingNumbers.length > 0) return trackingNumbers;
  return fulfillment.tracking_number ? [fulfillment.tracking_number] : [];
}

function fulfillmentTrackingUrls(fulfillment: ShopifyFulfillment): string[] {
  const trackingUrls = fulfillment.tracking_urls?.filter(Boolean) ?? [];
  if (trackingUrls.length > 0) return trackingUrls;
  return fulfillment.tracking_url ? [fulfillment.tracking_url] : [];
}

export async function getOrderTracking(
  input: GetOrderTrackingInput,
  ctx: ShopifyContext
): Promise<ToolResult> {
  try {
    const orderId = requireNumericId(input.order_id, "order_id");
    const data = await shopifyRestJson<{ fulfillments?: ShopifyFulfillment[] }>(
      ctx,
      `orders/${orderId}/fulfillments.json`
    );

    const fulfillments = data.fulfillments ?? [];
    if (fulfillments.length === 0) {
      return toolNotFound("This order has not been fulfilled yet - no tracking information is available.");
    }

    const shipments: TrackingShipment[] = fulfillments.flatMap((fulfillment): TrackingShipment[] => {
      const numbers = fulfillmentTrackingNumbers(fulfillment);
      const urls = fulfillmentTrackingUrls(fulfillment);

      if (numbers.length === 0) {
        return [{
          fulfillment_status: fulfillment.status,
          shipment_status: fulfillment.shipment_status ?? null,
          tracking_number: null,
          tracking_company: fulfillment.tracking_company ?? null,
          tracking_url: urls[0] ?? null,
          note: "Fulfillment has no tracking number.",
        }];
      }

      return numbers.map((trackingNumber, index) => ({
        fulfillment_status: fulfillment.status,
        shipment_status: fulfillment.shipment_status ?? null,
        tracking_number: trackingNumber,
        tracking_company: fulfillment.tracking_company ?? null,
        tracking_url: urls[index] ?? urls[0] ?? null,
      }));
    });

    return toolOk(JSON.stringify({
      shipments,
      note: "This is Shopify's fulfillment record. There are no live carrier scan events here - open each tracking_url for the carrier's own updates.",
    }));
  } catch (err) {
    return toolError(formatShopifyToolError("could not fetch fulfillments", err));
  }
}
