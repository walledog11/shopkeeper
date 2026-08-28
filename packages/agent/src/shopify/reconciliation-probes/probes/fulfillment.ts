import type { FulfillOrderInput } from "../../../tools/index.js";
import {
  fetchFulfillableFulfillmentOrders,
  fetchOrderFulfillmentTrackingNumbers,
} from "../../fulfillment.js";
import { optionalString, requireNumericId } from "../../validation.js";
import type { ShopifyContext } from "../../client.js";
import { committed, noEffect, stillUnknown, type ShopifyReconciliationProbeResult } from "../types.js";

export async function probeFulfillment(
  input: FulfillOrderInput,
  ctx: ShopifyContext,
): Promise<ShopifyReconciliationProbeResult> {
  const orderId = requireNumericId(input.order_id, "order_id");
  const orderGid = `gid://shopify/Order/${orderId}`;
  const trackingNumber = optionalString(input.tracking_number);

  // fulfillOrder does not reach fulfillmentCreate unless something was
  // fulfillable a moment earlier, so what is fulfillable now is what says
  // whether the mutation landed - read with the tool's own query, not a copy.
  const fulfillable = await fetchFulfillableFulfillmentOrders(ctx, orderGid);
  if (fulfillable === null) {
    return stillUnknown(`Order ${orderId} was not returned by Shopify during reconciliation.`);
  }

  if (trackingNumber) {
    const matches = (await fetchOrderFulfillmentTrackingNumbers(ctx, orderGid))
      .filter((number) => number === trackingNumber);
    if (matches.length === 1) {
      return committed(`Reconciled fulfillment with tracking ${trackingNumber} on order ${orderId}.`);
    }
    if (matches.length > 1) {
      return stillUnknown(`Multiple fulfillments on order ${orderId} carry tracking number ${trackingNumber}.`);
    }
    if (fulfillable.length > 0) {
      // Positive on both halves: no fulfillment carries this call's tracking
      // number, and the items it would have shipped are still awaiting
      // fulfillment. Neither alone would justify clearing the action.
      return noEffect(
        `Order ${orderId} has no fulfillment carrying tracking number ${trackingNumber} and its items are still awaiting fulfillment.`,
      );
    }
    // Something fulfilled this order, but not identifiably this call. Fulfilling
    // again would send the customer a second shipping notice.
    return stillUnknown(
      `Order ${orderId} has nothing left to fulfill, but no fulfillment carries tracking number ${trackingNumber}. Review the order before fulfilling again.`,
    );
  }

  if (fulfillable.length === 0) {
    // The tool stops at "nothing left to fulfill" before mutating, so this
    // reading cannot have pre-dated the call.
    return committed(`Reconciled fulfillment on order ${orderId}: nothing remains to fulfill.`);
  }
  return noEffect(`Order ${orderId} still has items awaiting fulfillment.`);
}
