import type { CancelOrderInput } from "../tools/index.js";
import {
  toolError,
  toolNotFound,
  toolOk,
  toolPolicyBlock,
  toolUnknown,
  type ReceiptV1,
  type ToolResult,
} from "../tools/result.js";
import {
  formatShopifyToolError,
  isAmbiguousShopifyMutationError,
  shopifyRestJson,
  type ShopifyContext,
} from "./client.js";
import { quoteCancellationRefund } from "./refunds.js";
import type { ShopifyOrder } from "./types.js";
import { centsToMoney, moneyToCents, requireNumericId } from "./validation.js";
import { shopifyFailureReceipt, shopifyReceiptEnvelope } from "./receipts.js";

type RequestedRefund = { amount: string; currency: string } | null;

const CANCELLATION_ORDER_FIELDS =
  "id,name,currency,line_items,cancelled_at,cancel_reason,financial_status,fulfillment_status,refunds";

function refundPhrase(cents: number, currency: string | null): string {
  return cents === 0 ? "no refund" : `a refund of ${centsToMoney(cents)} ${currency ?? ""}`.trimEnd();
}

/**
 * Bind what cancelling the order refunds into the proposal (decision H), as the
 * refund tools bind their quotes, so the merchant approves an amount rather than
 * "refund payment". An order that cannot be cancelled, or whose refund Shopify
 * cannot price in one currency, is left unbound: execution refuses it with the
 * reason.
 */
export async function quoteCancellationForApproval(
  input: CancelOrderInput,
  ctx: ShopifyContext,
): Promise<CancelOrderInput> {
  // Only the runtime names the amount, so a value the model wrote is dropped.
  const call = { ...input };
  delete call.approval_amount;
  delete call.approval_currency;
  const orderId = requireNumericId(call.order_id, "order_id");
  const { order } = await shopifyRestJson<{ order?: ShopifyOrder }>(ctx, `orders/${orderId}.json`, {
    query: { fields: CANCELLATION_ORDER_FIELDS },
  });
  const shipped = order?.fulfillment_status && order.fulfillment_status !== "unfulfilled";
  if (!order || order.cancelled_at || shipped) return call;
  const quote = await quoteCancellationRefund(ctx, orderId, order);
  if (quote.kind === "currency_mismatch") return call;
  return quote.kind === "refund"
    ? { ...call, approval_amount: quote.amount, approval_currency: quote.currency }
    : { ...call, approval_amount: "0.00" };
}

/**
 * What this cancellation refunded: successful refund transactions on refunds
 * that did not exist before it. Null when none did.
 */
function cancellationRefund(
  order: ShopifyOrder,
  priorRefundIds: ReadonlySet<string>,
): { amount: string; currency: string } | null {
  const transactions = (order.refunds ?? [])
    .filter((refund) => refund.id === undefined || !priorRefundIds.has(String(refund.id)))
    .flatMap((refund) => refund.transactions ?? [])
    .filter((transaction) => transaction.kind === "refund" && transaction.status === "success");
  const cents = transactions.reduce((total, transaction) => total + moneyToCents(transaction.amount), 0);
  const currency = transactions.find((transaction) => transaction.currency)?.currency?.toUpperCase()
    ?? order.currency?.toUpperCase();
  return cents > 0 && currency ? { amount: centsToMoney(cents), currency } : null;
}

function cancellationNoEffect(
  ctx: ShopifyContext,
  orderId: string,
  result: ToolResult,
  outcome: "rejected" | "failed" | "not_found",
  code: string,
): ToolResult {
  const receipt = shopifyFailureReceipt(
    ctx,
    { kind: "order", id: orderId },
    "cancel_order",
    outcome,
    code,
  );
  return receipt ? { ...result, receipt } : result;
}

function unknownCancellationReceipt(
  ctx: ShopifyContext,
  orderId: string,
  code: string,
): ReceiptV1 | undefined {
  const envelope = shopifyReceiptEnvelope(ctx, { kind: "order", id: orderId });
  return envelope ? {
    ...envelope,
    tool: "cancel_order",
    outcome: "unknown",
    code,
    providerReference: null,
  } : undefined;
}

function cancellationResult(
  ctx: ShopifyContext,
  order: ShopifyOrder,
  orderId: string,
  input: CancelOrderInput,
  requested: { refund: RequestedRefund; priorRefundIds: ReadonlySet<string> },
  reconciled = false,
): ToolResult {
  const cancelledAt = order.cancelled_at?.trim();
  const reason = order.cancel_reason?.trim();
  const financialStatus = order.financial_status?.trim();
  if (!cancelledAt || !reason || !financialStatus) {
    const receipt = unknownCancellationReceipt(ctx, orderId, "confirmed_state_incomplete");
    return {
      ...toolUnknown(
        `Unknown: Shopify cancelled order ${orderId}, but did not return complete confirmed cancellation state. Do not retry or confirm it to the customer until it is reconciled.`,
      ),
      ...(receipt ? { receipt } : {}),
    };
  }
  const refund = cancellationRefund(order, requested.priorRefundIds);
  // The cancellation committed, so it cannot be reported as failed; but a
  // refund that was asked for and is not in Shopify's answer is not a success
  // either. Unknown holds the approved message and sends the merchant to look.
  if (requested.refund && !refund) {
    const receipt = unknownCancellationReceipt(ctx, orderId, "confirmed_refund_missing");
    return {
      ...toolUnknown(
        `Unknown: Shopify cancelled order ${order.name ?? orderId}, but its answer shows no refund of the ${requested.refund.amount} ${requested.refund.currency} that was requested (financial_status "${financialStatus}"). Do not tell the customer a refund was made until it is reviewed.`,
      ),
      ...(receipt ? { receipt } : {}),
    };
  }
  const envelope = shopifyReceiptEnvelope(ctx, { kind: "order", id: orderId });
  const receipt: ReceiptV1 | undefined = envelope ? {
    ...envelope,
    tool: "cancel_order",
    outcome: "succeeded",
    providerReference: null,
    facts: {
      orderId,
      cancelledAt,
      reason,
      financialStatus,
      restockResult: null,
      refund,
    },
  } : undefined;
  const result = toolOk(
    `Order ${order.name ?? orderId} cancelled successfully${reconciled ? " (confirmed after an interrupted provider response)" : ""}. `
    + `Reason: ${reason}. Restock requested: ${input.restock !== false ? "yes" : "no"}. `
    + (refund ? `Refunded ${refund.amount} ${refund.currency}. ` : "No payment was refunded. ")
    + `Refund status: Shopify returned financial_status "${financialStatus}".`,
  );
  return receipt ? { ...result, receipt } : result;
}

async function reconcileCancellation(
  ctx: ShopifyContext,
  orderId: string,
  input: CancelOrderInput,
  requested: { refund: RequestedRefund; priorRefundIds: ReadonlySet<string> },
  mutationError: unknown,
): Promise<ToolResult> {
  try {
    const state = await shopifyRestJson<{ order?: ShopifyOrder }>(ctx, `orders/${orderId}.json`, {
      query: { fields: "id,name,currency,cancelled_at,cancel_reason,financial_status,refunds" },
    });
    if (state.order?.cancelled_at) {
      const actualReason = state.order.cancel_reason?.toLowerCase();
      const expectedReason = (input.reason ?? "other").toLowerCase();
      if (!actualReason || actualReason === expectedReason) {
        return cancellationResult(ctx, state.order, orderId, input, requested, true);
      }
      const result = toolUnknown(
        `Unknown: order ${orderId} is cancelled, but Shopify recorded reason "${actualReason}" instead of "${expectedReason}" after the provider response was interrupted. Do not retry or confirm the cancellation until it is reviewed.`,
      );
      const receipt = unknownCancellationReceipt(ctx, orderId, "confirmed_reason_mismatch");
      return receipt ? { ...result, receipt } : result;
    }
    const result = toolUnknown(
      `Unknown: the cancellation request for order ${orderId} may still have committed at Shopify, but a follow-up read did not confirm it. Do not retry or confirm it to the customer until it is reconciled. ${formatShopifyToolError("cancellation reconciliation failed", mutationError)}`,
    );
    const receipt = unknownCancellationReceipt(ctx, orderId, "reconciliation_not_confirmed");
    return receipt ? { ...result, receipt } : result;
  } catch (reconciliationError) {
    const result = toolUnknown(
      `Unknown: the cancellation request for order ${orderId} may have committed at Shopify and the follow-up read failed. Do not retry or confirm it to the customer until it is reconciled. ${formatShopifyToolError("cancellation reconciliation failed", reconciliationError)}`,
    );
    const receipt = unknownCancellationReceipt(ctx, orderId, "reconciliation_read_failed");
    return receipt ? { ...result, receipt } : result;
  }
}

export async function cancelOrder(
  input: CancelOrderInput,
  ctx: ShopifyContext
): Promise<ToolResult> {
  try {
    const orderId = requireNumericId(input.order_id, "order_id");
    const before = await shopifyRestJson<{ order?: ShopifyOrder }>(ctx, `orders/${orderId}.json`, {
      query: { fields: CANCELLATION_ORDER_FIELDS },
    });
    if (!before.order) {
      return cancellationNoEffect(
        ctx,
        orderId,
        toolNotFound(`Order ${orderId} was not returned by Shopify.`),
        "not_found",
        "order_not_found",
      );
    }
    if (before.order.cancelled_at) {
      return cancellationNoEffect(
        ctx,
        orderId,
        toolPolicyBlock(`Error: failed to cancel order - order ${before.order.name ?? orderId} is already cancelled.`),
        "rejected",
        "already_cancelled",
      );
    }
    if (before.order.fulfillment_status && before.order.fulfillment_status !== "unfulfilled") {
      return cancellationNoEffect(
        ctx,
        orderId,
        toolPolicyBlock(`Error: failed to cancel order - order ${before.order.name ?? orderId} has already shipped or partially shipped.`),
        "rejected",
        "order_already_fulfilled",
      );
    }

    // Decision H: cancelling a paid order refunds it. Shopify's cancel refunds
    // only the amount it is sent; without one it keeps the payment.
    const quote = await quoteCancellationRefund(ctx, orderId, before.order);
    if (quote.kind === "currency_mismatch") {
      return cancellationNoEffect(
        ctx,
        orderId,
        toolPolicyBlock(`Error: failed to cancel order - Shopify could not price the refund for order ${before.order.name ?? orderId} in one currency.`, { code: "currency_mismatch" }),
        "rejected",
        "currency_mismatch",
      );
    }
    const requested = {
      refund: quote.kind === "refund" ? { amount: quote.amount, currency: quote.currency } : null,
      priorRefundIds: new Set((before.order.refunds ?? []).flatMap((refund) => (
        refund.id === undefined ? [] : [String(refund.id)]
      ))),
    };
    // The approval named an amount; a different one needs approving again. A
    // call with no bound quote predates binding or never went through a card.
    if (input.approval_amount !== undefined) {
      const approvedCents = moneyToCents(input.approval_amount);
      const approvedCurrency = input.approval_currency?.trim().toUpperCase() || null;
      const quotedCents = requested.refund ? moneyToCents(requested.refund.amount) : 0;
      const quotedCurrency = requested.refund?.currency ?? null;
      if (approvedCents !== quotedCents || (quotedCents > 0 && approvedCurrency !== quotedCurrency)) {
        return cancellationNoEffect(
          ctx,
          orderId,
          toolPolicyBlock(
            `Error: failed to cancel order - Shopify now calculates ${refundPhrase(quotedCents, quotedCurrency)} for order ${before.order.name ?? orderId}, but ${refundPhrase(approvedCents, approvedCurrency)} was approved; ask for approval again.`,
            { code: "amount_mismatch", approvedCents, quotedCents },
          ),
          "rejected",
          "amount_mismatch",
        );
      }
    }

    let data: { order?: ShopifyOrder };
    try {
      data = await shopifyRestJson<{ order?: ShopifyOrder }>(ctx, `orders/${orderId}/cancel.json`, {
        method: "POST",
        body: {
          reason: input.reason ?? "other",
          restock: input.restock ?? true,
          email: false,
          ...(requested.refund ? requested.refund : {}),
        },
      });
    } catch (err) {
      if (isAmbiguousShopifyMutationError(err)) {
        return reconcileCancellation(ctx, orderId, input, requested, err);
      }
      throw err;
    }

    if (!data.order) {
      const result = toolUnknown(`Unknown: Shopify accepted the cancellation request for order ${orderId} but did not return the cancelled order. Do not retry or confirm it to the customer until it is reconciled.`);
      const receipt = unknownCancellationReceipt(ctx, orderId, "provider_order_missing");
      return receipt ? { ...result, receipt } : result;
    }

    return cancellationResult(ctx, data.order, orderId, input, requested);
  } catch (err) {
    return cancellationNoEffect(
      ctx,
      input.order_id.trim() || "invalid",
      toolError(formatShopifyToolError("failed to cancel order", err)),
      "failed",
      "definite_failure",
    );
  }
}
