import type { UpdateShopifyOrderAddressInput } from "../../../tools/index.js";
import { shopifyRestJson, type ShopifyContext } from "../../client.js";
import type { ShopifyOrder } from "../../types.js";
import { addressMatches, buildOrderAddress } from "../../order-address.js";
import { requireNumericId } from "../../validation.js";
import { committed, noEffect, type ShopifyReconciliationProbeResult } from "../types.js";

export async function probeOrderAddress(
  input: UpdateShopifyOrderAddressInput,
  ctx: ShopifyContext,
): Promise<ShopifyReconciliationProbeResult> {
  const orderId = requireNumericId(input.order_id, "order_id");
  const expected = buildOrderAddress(input);
  const data = await shopifyRestJson<{ order?: ShopifyOrder }>(ctx, `orders/${orderId}.json`, {
    query: { fields: "id,name,shipping_address" },
    maxRetries: 1,
  });
  const actual = data.order?.shipping_address;
  if (!actual) {
    return noEffect(`Order ${orderId} has no shipping address at Shopify.`);
  }
  // Compare with the same predicate the tool itself commits on, not a second
  // copy of it: Shopify returns a country as "United States" while the input
  // carries "US", so a field-by-field string compare read every committed
  // update on a country-code input as a no-op.
  if (addressMatches(actual, expected)) {
    return committed(`Reconciled shipping-address update for order ${data.order?.name ?? orderId}.`);
  }
  return noEffect(`Order ${orderId} shipping address does not match the requested update.`);
}
