import { formatShopifyToolError, type ShopifyContext } from "../client.js";
import { SHOPIFY_RECONCILIATION_PROBES } from "./registry.js";
import { stillUnknown, type ShopifyReconciliationProbeResult } from "./types.js";

export {
  CUSTOMER_STORE_CREDIT_TRANSACTIONS_QUERY,
  GIFT_CARDS_BY_CODE_QUERY,
  RECENT_GIFT_CARDS_QUERY,
  RETURN_RECONCILIATION_QUERY,
} from "./queries.js";
export { RECONCILABLE_SHOPIFY_MUTATION_TOOLS } from "./registry.js";
export type { ShopifyReconciliationProbeResult } from "./types.js";

export async function probeUnknownShopifyMutation(
  tool: string,
  input: unknown,
  ctx: ShopifyContext,
): Promise<ShopifyReconciliationProbeResult> {
  const probe = Object.prototype.hasOwnProperty.call(SHOPIFY_RECONCILIATION_PROBES, tool)
    ? SHOPIFY_RECONCILIATION_PROBES[tool as keyof typeof SHOPIFY_RECONCILIATION_PROBES]
    : undefined;
  if (!probe) {
    return stillUnknown(`Tool ${tool} does not have a Shopify reconciliation probe.`);
  }

  try {
    return await probe(input, ctx);
  } catch (error) {
    return stillUnknown(formatShopifyToolError(`${tool} reconciliation probe failed`, error));
  }
}
