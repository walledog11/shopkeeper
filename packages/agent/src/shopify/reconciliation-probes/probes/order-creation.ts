import type { CreateShopifyOrderInput } from "../../../tools/index.js";
import type { ShopifyContext } from "../../client.js";
import { findCreatedOrders } from "../../order-creation.js";
import { operationTag, sleep } from "../helpers.js";
import { committed, stillUnknown, type ShopifyReconciliationProbeResult } from "../types.js";

// Shopify's order search index lags writes. Measured on palette-dev: order
// #1008 was unfindable by `tag:` after three attempts across four seconds, so
// the lookup also scans the newest orders for the tag, and the probe tries
// more than once. A miss remains unknown because visibility cannot prove
// non-creation.
const ORDER_LOOKUP_ATTEMPTS = 3;
const ORDER_LOOKUP_BACKOFF_MS = 2000;

export async function probeCreatedOrder(
  input: CreateShopifyOrderInput,
  ctx: ShopifyContext,
): Promise<ShopifyReconciliationProbeResult> {
  const tag = operationTag(ctx.operationId);
  if (!tag) {
    return stillUnknown("Order creation reconciliation requires a stable operation identity.");
  }
  const email = input.email;

  for (let attempt = 0; attempt < ORDER_LOOKUP_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await sleep(ORDER_LOOKUP_BACKOFF_MS);
    const matches = await findCreatedOrders(ctx, tag);
    if (matches.length === 1) {
      return committed(`Reconciled created order ${matches[0]!.name ?? matches[0]!.legacyResourceId ?? matches[0]!.id}.`);
    }
    if (matches.length > 1) {
      return stillUnknown(`Multiple Shopify orders match operation tag ${tag}.`);
    }
  }

  // Deliberately not `no_effect`. An exhausted lookup cannot distinguish "never
  // created" from "created and not yet visible", and the two call for opposite
  // moves: no_effect releases the hold and invites a second create, which for
  // this tool means a duplicate real order against a customer.
  // `order-creation.ts`'s own post-failure reconciliation already refuses to
  // conclude from the same miss; this matches it.
  return stillUnknown(
    `No Shopify order with operation tag ${tag} was found for ${email} after ${ORDER_LOOKUP_ATTEMPTS} attempts. This does not prove the order was not created — review it before creating another.`,
  );
}
