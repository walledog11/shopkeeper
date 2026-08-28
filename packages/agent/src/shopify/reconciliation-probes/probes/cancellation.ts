import type { CancelOrderInput } from "../../../tools/index.js";
import { shopifyRestJson, type ShopifyContext } from "../../client.js";
import type { ShopifyOrder } from "../../types.js";
import { requireNumericId } from "../../validation.js";
import { committed, noEffect, stillUnknown, type ShopifyReconciliationProbeResult } from "../types.js";

export async function probeCancellation(
  input: CancelOrderInput,
  ctx: ShopifyContext,
): Promise<ShopifyReconciliationProbeResult> {
  const orderId = requireNumericId(input.order_id, "order_id");
  const data = await shopifyRestJson<{ order?: ShopifyOrder }>(ctx, `orders/${orderId}.json`, {
    query: { fields: "id,name,cancelled_at,cancel_reason,financial_status" },
    maxRetries: 1,
  });
  if (!data.order?.cancelled_at) {
    return noEffect(`Order ${orderId} is not cancelled at Shopify.`);
  }
  const expectedReason = (input.reason ?? "other").toLowerCase();
  const actualReason = data.order.cancel_reason?.toLowerCase();
  if (actualReason && actualReason !== expectedReason) {
    return stillUnknown(
      `Order ${orderId} is cancelled with reason "${actualReason}" instead of "${expectedReason}".`,
    );
  }
  return committed(`Reconciled cancellation for order ${data.order.name ?? orderId}.`);
}
