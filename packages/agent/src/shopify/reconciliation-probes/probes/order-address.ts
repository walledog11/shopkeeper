import type { UpdateShopifyOrderAddressInput } from "../../../tools/index.js";
import type { ShopifyContext } from "../../client.js";
import { fetchShopifyOrder } from "../../order-reads.js";
import { addressMatches, buildOrderAddress } from "../../order-address.js";
import { requireNumericId } from "../../validation.js";
import { committed, noEffect, type ShopifyReconciliationProbeResult } from "../types.js";

export async function probeOrderAddress(
  input: UpdateShopifyOrderAddressInput,
  ctx: ShopifyContext,
): Promise<ShopifyReconciliationProbeResult> {
  const orderId = requireNumericId(input.order_id, "order_id");
  const expected = buildOrderAddress(input);
  const order = await fetchShopifyOrder(ctx, orderId, { lineItems: 1, maxRetries: 1 });
  const actual = order?.shipping_address;
  if (!actual) {
    return noEffect(`Order ${orderId} has no shipping address at Shopify.`);
  }
  // Compare with the same predicate the tool itself commits on, not a second
  // copy of it: Shopify returns a country as "United States" while the input
  // carries "US", so a field-by-field string compare read every committed
  // update on a country-code input as a no-op.
  if (addressMatches(actual, expected)) {
    return committed(`Reconciled shipping-address update for order ${order?.name ?? orderId}.`);
  }
  return noEffect(`Order ${orderId} shipping address does not match the requested update.`);
}
