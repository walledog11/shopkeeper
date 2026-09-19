import type { UpdateShopifyCustomerInfoInput } from "../../../tools/index.js";
import { shopifyRestJson, type ShopifyContext } from "../../client.js";
import {
  buildCustomerInfoUpdate,
  customerInfoUpdates,
} from "../../customers.js";
import type { ShopifyCustomer } from "../../types.js";
import { committed, stillUnknown, type ShopifyReconciliationProbeResult } from "../types.js";

export async function probeCustomerInfo(
  input: UpdateShopifyCustomerInfoInput,
  ctx: ShopifyContext,
): Promise<ShopifyReconciliationProbeResult> {
  const update = buildCustomerInfoUpdate(input);
  const data = await shopifyRestJson<{ customer?: ShopifyCustomer }>(
    ctx,
    `customers/${update.customerId}.json`,
    { query: { fields: "id,first_name,last_name,email,phone" }, maxRetries: 1 },
  );
  if (customerInfoUpdates(data.customer, update)) {
    return committed(`Reconciled customer-info update for customer ${update.customerId}.`);
  }
  // A mismatch does not prove no effect: Shopify could have committed only a
  // subset before the response was lost, or another actor could have changed a
  // field after the write. Keep the action unknown rather than inviting replay.
  return stillUnknown(
    `Customer ${update.customerId} does not match every requested profile field; the update remains unknown.`,
  );
}
