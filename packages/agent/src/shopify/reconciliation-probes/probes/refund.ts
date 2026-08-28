import type { CreateRefundInput } from "../../../tools/index.js";
import { shopifyRestJson, type ShopifyContext } from "../../client.js";
import { moneyToCents, requireAmount, requireNumericId } from "../../validation.js";
import { committed, noEffect, stillUnknown, type ShopifyReconciliationProbeResult } from "../types.js";

export async function probeRefund(
  input: CreateRefundInput,
  ctx: ShopifyContext,
): Promise<ShopifyReconciliationProbeResult> {
  const orderId = requireNumericId(input.order_id, "order_id");
  const requestedAmount = input.amount !== undefined ? requireAmount(input.amount, "amount") : null;
  const requestedCents = requestedAmount ? moneyToCents(requestedAmount) : null;

  const data = await shopifyRestJson<{ refunds?: Array<{ id: number; transactions?: Array<{ status?: string; amount?: string }> }> }>(
    ctx,
    `orders/${orderId}/refunds.json`,
    { maxRetries: 1 },
  );
  const refunds = data.refunds ?? [];
  const successful = refunds.filter((refund) => (
    (refund.transactions ?? []).some((transaction) => transaction.status?.toUpperCase() === "SUCCESS")
  ));
  const matches = successful.filter((refund) => {
    if (requestedCents === null) return true;
    const total = (refund.transactions ?? [])
      .filter((transaction) => transaction.status?.toUpperCase() === "SUCCESS")
      .reduce((sum, transaction) => sum + moneyToCents(transaction.amount ?? "0"), 0);
    return total === requestedCents;
  });

  if (matches.length === 1) {
    const total = (matches[0]!.transactions ?? [])
      .filter((transaction) => transaction.status?.toUpperCase() === "SUCCESS")
      .reduce((sum, transaction) => sum + moneyToCents(transaction.amount ?? "0"), 0);
    return committed(
      `Reconciled refund on order ${orderId} for $${(total / 100).toFixed(2)}.`,
      total,
    );
  }
  if (matches.length > 1) {
    return stillUnknown(`Multiple successful refunds match order ${orderId}; manual review required.`);
  }
  if (successful.length > 0 && requestedCents === null) {
    return stillUnknown(`Order ${orderId} has successful refunds but the requested amount is unknown.`);
  }
  return noEffect(`No successful refund matching order ${orderId} was found at Shopify.`);
}
