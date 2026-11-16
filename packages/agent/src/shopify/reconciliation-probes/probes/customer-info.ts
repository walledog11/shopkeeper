import type { UpdateShopifyCustomerInfoInput } from "../../../tools/index.js";
import type { ShopifyContext } from "../../client.js";
import { fetchShopifyCustomer } from "../../customer-reads.js";
import {
  buildCustomerInfoUpdate,
  customerInfoUpdates,
} from "../../customers.js";
import { committed, stillUnknown, type ShopifyReconciliationProbeResult } from "../types.js";

export async function probeCustomerInfo(
  input: UpdateShopifyCustomerInfoInput,
  ctx: ShopifyContext,
): Promise<ShopifyReconciliationProbeResult> {
  const update = buildCustomerInfoUpdate(input);
  const customer = await fetchShopifyCustomer(ctx, update.customerId, { maxRetries: 1 });
  if (customerInfoUpdates(customer, update)) {
    return committed(`Reconciled customer-info update for customer ${update.customerId}.`);
  }
  // A mismatch does not prove no effect: Shopify could have committed only a
  // subset before the response was lost, or another actor could have changed a
  // field after the write. Keep the action unknown rather than inviting replay.
  return stillUnknown(
    `Customer ${update.customerId} does not match every requested profile field; the update remains unknown.`,
  );
}
