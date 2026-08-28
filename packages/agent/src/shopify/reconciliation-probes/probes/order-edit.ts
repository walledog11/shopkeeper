import type { EditShopifyOrderInput } from "../../../tools/index.js";
import { shopifyRestJson, type ShopifyContext } from "../../client.js";
import type { ShopifyOrder, ShopifyOrderLineItem } from "../../types.js";
import { optionalString, requireNumericId } from "../../validation.js";
import { committed, noEffect, stillUnknown, type ShopifyReconciliationProbeResult } from "../types.js";

function lineItemQuantity(item: ShopifyOrderLineItem): number {
  const quantity = item.current_quantity ?? item.quantity;
  return Number.isFinite(quantity) ? Math.max(quantity, 0) : 0;
}

function variantQuantities(order: ShopifyOrder): Map<string, number> {
  const quantities = new Map<string, number>();
  for (const item of order.line_items ?? []) {
    if (item.variant_id == null) continue;
    const key = String(item.variant_id);
    quantities.set(key, (quantities.get(key) ?? 0) + lineItemQuantity(item));
  }
  return quantities;
}

export async function probeOrderEdit(
  input: EditShopifyOrderInput,
  ctx: ShopifyContext,
): Promise<ShopifyReconciliationProbeResult> {
  const orderId = requireNumericId(input.order_id, "order_id");
  const data = await shopifyRestJson<{ order?: ShopifyOrder }>(ctx, `orders/${orderId}.json`, {
    query: { fields: "id,name,line_items" },
    maxRetries: 1,
  });
  if (!data.order) {
    return stillUnknown(`Order ${orderId} was not returned by Shopify during reconciliation.`);
  }
  const current = variantQuantities(data.order);
  const addVariantId = optionalString(input.variant_id);
  const removeVariantId = optionalString(input.remove_variant_id);
  if (!addVariantId && !removeVariantId) {
    return stillUnknown("Order-edit reconciliation requires variant_id or remove_variant_id.");
  }

  // `edit_shopify_order` adds a *delta*, so the order as it stands cannot say on
  // its own whether that delta was applied: order-edit.ts:290 compares against
  // pre-edit quantity plus the delta, and the probe has no pre-edit reading. A
  // quantity that merely satisfies the request is therefore not evidence the
  // request ran — an order that already held enough of the variant read as
  // committed for an edit that never happened. `null` is "cannot tell".
  const legs: Array<boolean | null> = [];
  if (removeVariantId) {
    // The tool refuses to remove a variant the order does not carry, so the line
    // existed when the mutation went out: absent now means the removal ran.
    const key = requireNumericId(removeVariantId, "remove_variant_id");
    legs.push((current.get(key) ?? 0) === 0);
  }
  if (addVariantId) {
    // Only the negative is conclusive. A committed add leaves at least the
    // requested quantity behind, so nothing at all rules it out; any other count
    // is indistinguishable from a line that was already there.
    const key = requireNumericId(addVariantId, "variant_id");
    legs.push((current.get(key) ?? 0) === 0 ? false : null);
  }

  if (legs.every((leg) => leg === false)) {
    return noEffect(`Order ${orderId} does not reflect the requested edit at Shopify.`);
  }
  if (legs.every((leg) => leg === true)) {
    return committed(`Reconciled order edit for order ${data.order.name ?? orderId}.`);
  }
  // A swap whose halves disagree lands here too, which is the point: half an
  // edit is not a committed edit and must not read as one.
  return stillUnknown(
    `Order ${orderId} cannot be reconciled against the requested edit from its current line items alone.`,
  );
}
