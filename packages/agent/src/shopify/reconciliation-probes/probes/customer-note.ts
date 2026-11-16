import type { AddShopifyCustomerNoteInput } from "../../../tools/index.js";
import type { ShopifyContext } from "../../client.js";
import { fetchShopifyCustomer } from "../../customer-reads.js";
import { requireNonEmptyString, requireNumericId } from "../../validation.js";
import { stillUnknown, type ShopifyReconciliationProbeResult } from "../types.js";

export async function probeCustomerNote(
  input: AddShopifyCustomerNoteInput,
  ctx: ShopifyContext,
): Promise<ShopifyReconciliationProbeResult> {
  const customerId = requireNumericId(input.customer_id, "customer_id");
  const appendedNote = requireNonEmptyString(input.note, "note");
  const customer = await fetchShopifyCustomer(ctx, customerId, { maxRetries: 1 });
  const paragraphs = (customer?.note ?? "").split("\n\n");
  const observation = paragraphs.includes(appendedNote)
    ? "The requested note text is present"
    : "The requested note text is not present";
  // Presence cannot prove this operation appended it: the same note might have
  // predated the attempt. Absence also cannot prove no effect after a later
  // edit. Only the adapter's exact old/new hash receipt can settle the write.
  return stillUnknown(
    `${observation} for customer ${customerId}, but the append receipt cannot be reconstructed.`,
  );
}
