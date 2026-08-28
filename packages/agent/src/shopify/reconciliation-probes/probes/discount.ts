import type { IssueDiscountInput } from "../../../tools/index.js";
import { discountCodeForOperation, findDiscountsByCode } from "../../discounts.js";
import type { ShopifyContext } from "../../client.js";
import { committed, stillUnknown, type ShopifyReconciliationProbeResult } from "../types.js";

export async function probeDiscount(
  input: IssueDiscountInput,
  ctx: ShopifyContext,
): Promise<ShopifyReconciliationProbeResult> {
  if (!ctx.operationId) {
    return stillUnknown("Discount reconciliation requires a stable operation identity.");
  }
  const percentage = input.percentage;
  if (typeof percentage !== "number" || !Number.isFinite(percentage)) {
    return stillUnknown("Discount reconciliation requires the requested percentage.");
  }
  const code = discountCodeForOperation(percentage, ctx.operationId);
  const matches = await findDiscountsByCode(ctx, code);
  if (matches.length === 1) {
    return committed(`Reconciled discount code ${code}.`);
  }
  if (matches.length > 1) {
    return stillUnknown(`Multiple Shopify discounts use operation code ${code}.`);
  }
  // Even a direct read can be temporarily unavailable. Absence cannot safely
  // release the action because doing so invites a second customer-visible code.
  return stillUnknown(
    `No Shopify discount with operation code ${code} was found. This does not prove the discount was not created — review discounts before issuing another.`,
  );
}
