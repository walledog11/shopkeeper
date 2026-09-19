import type { AddShopifyCustomerNoteInput } from "../../../tools/index.js";
import { shopifyRestJson, type ShopifyContext } from "../../client.js";
import type { ShopifyCustomer } from "../../types.js";
import { requireNonEmptyString, requireNumericId } from "../../validation.js";
import { stillUnknown, type ShopifyReconciliationProbeResult } from "../types.js";

export async function probeCustomerNote(
  input: AddShopifyCustomerNoteInput,
  ctx: ShopifyContext,
): Promise<ShopifyReconciliationProbeResult> {
  const customerId = requireNumericId(input.customer_id, "customer_id");
  const appendedNote = requireNonEmptyString(input.note, "note");
  const data = await shopifyRestJson<{ customer?: Pick<ShopifyCustomer, "id" | "note"> }>(
    ctx,
    `customers/${customerId}.json`,
    { query: { fields: "id,note" }, maxRetries: 1 },
  );
  const paragraphs = (data.customer?.note ?? "").split("\n\n");
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
