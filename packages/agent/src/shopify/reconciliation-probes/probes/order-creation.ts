import type { CreateShopifyOrderInput } from "../../../tools/index.js";
import { shopifyRestJson, type ShopifyContext } from "../../client.js";
import type { ShopifyOrder } from "../../types.js";
import { operationTag, restOrderTags, sleep } from "../helpers.js";
import { committed, stillUnknown, type ShopifyReconciliationProbeResult } from "../types.js";

// Shopify's order search index lags writes, so reconciliation uses the required
// customer email to query orders directly and filters the result by operation
// tag. A miss remains unknown because visibility cannot prove non-creation.
const ORDER_LOOKUP_ATTEMPTS = 3;
const ORDER_LOOKUP_BACKOFF_MS = 2000;

async function findCreatedOrdersByEmail(
  ctx: ShopifyContext,
  email: string,
  tag: string,
): Promise<Array<{ id: string; name?: string }>> {
  const data = await shopifyRestJson<{ orders?: Array<ShopifyOrder & { tags?: string }> }>(
    ctx,
    "orders.json",
    { query: { email, status: "any", fields: "id,name,tags" }, maxRetries: 1 },
  );
  return (data.orders ?? [])
    .filter((order) => restOrderTags(order).includes(tag))
    .map((order) => ({ id: String(order.id), name: order.name }));
}

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
    const matches = await findCreatedOrdersByEmail(ctx, email, tag);
    if (matches.length === 1) {
      return committed(`Reconciled created order ${matches[0]!.name ?? matches[0]!.id}.`);
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
