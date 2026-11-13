import type { CancelOrderInput } from "../../../tools/index.js";
import type { ShopifyContext } from "../../client.js";
import { fetchShopifyOrderSettlement } from "../../order-reads.js";
import { requireNumericId } from "../../validation.js";
import { committed, noEffect, stillUnknown, type ShopifyReconciliationProbeResult } from "../types.js";

export async function probeCancellation(
  input: CancelOrderInput,
  ctx: ShopifyContext,
): Promise<ShopifyReconciliationProbeResult> {
  const orderId = requireNumericId(input.order_id, "order_id");
  const order = await fetchShopifyOrderSettlement(ctx, orderId, { maxRetries: 1 });
  if (!order?.cancelled_at) {
    return noEffect(`Order ${orderId} is not cancelled at Shopify.`);
  }
  const expectedReason = (input.reason ?? "other").toLowerCase();
  const actualReason = order.cancel_reason?.toLowerCase();
  if (actualReason && actualReason !== expectedReason) {
    return stillUnknown(
      `Order ${orderId} is cancelled with reason "${actualReason}" instead of "${expectedReason}".`,
    );
  }
  return committed(`Reconciled cancellation for order ${order.name ?? orderId}.`);
}
