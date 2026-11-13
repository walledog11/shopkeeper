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
  formatUserErrors,
  isAmbiguousShopifyMutationError,
  shopifyGraphql,
  type ShopifyContext,
  type ShopifyGraphqlUserError,
} from "./client.js";
import { fetchShopifyOrderSettlement } from "./order-reads.js";
import { quoteCancellationRefund } from "./refunds.js";
import type { ShopifyOrder } from "./types.js";
import { centsToMoney, moneyToCents, requireNumericId } from "./validation.js";
import { shopifyReceiptResults, shopifyReceiptEnvelope } from "./receipts.js";

const cancellationReceipts = shopifyReceiptResults("cancel_order", "order");

type RequestedRefund = { amount: string; currency: string } | null;

// Shopify cancels in the background: the mutation answers with a job, and the
// order says what happened once the job is done. Refunding to the original
// payment methods returns the order's whole refundable balance, the amount the
// quote priced and the merchant approved, and the outcome is checked against it.
export const ORDER_CANCEL_MUTATION = `mutation ShopkeeperOrderCancel($orderId: ID!, $reason: OrderCancelReason!, $restock: Boolean!, $refundMethod: OrderCancelRefundMethodInput!) {
  orderCancel(orderId: $orderId, reason: $reason, restock: $restock, refundMethod: $refundMethod, notifyCustomer: false) {
    job { id done }
    orderCancelUserErrors { code field message }
  }
}`;

export const JOB_QUERY = `query ShopkeeperJob($id: ID!) {
  job(id: $id) { id done }
}`;

interface OrderCancelData {
  orderCancel: {
    job: { id: string; done: boolean } | null;
    orderCancelUserErrors: ShopifyGraphqlUserError[];
  };
}

// How long a cancellation job is waited on, in pauses between checks. A job
// still running after them is an unknown outcome for reconciliation, never a
// failure: Shopify accepted it.
const CANCEL_JOB_WAITS_MS = [500, 1000, 1500, 2000, 2500];

async function cancellationJobDone(ctx: ShopifyContext, jobId: string): Promise<boolean> {
  for (const wait of CANCEL_JOB_WAITS_MS) {
    await new Promise((resolve) => setTimeout(resolve, wait));
    try {
      const data = await shopifyGraphql<{ job: { done: boolean } | null }>(ctx, JOB_QUERY, { id: jobId });
      if (data.job?.done) return true;
    } catch {
      // The job keeps running whether or not this check is answered.
    }
  }
  return false;
}

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
  const order = await fetchShopifyOrderSettlement(ctx, orderId);
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
    const receipt = cancellationReceipts.unknown(ctx, orderId, "confirmed_state_incomplete");
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
    const receipt = cancellationReceipts.unknown(ctx, orderId, "confirmed_refund_missing");
    return {
      ...toolUnknown(
        `Unknown: Shopify cancelled order ${order.name ?? orderId}, but its answer shows no refund of the ${requested.refund.amount} ${requested.refund.currency} that was requested (financial_status "${financialStatus}"). Do not tell the customer a refund was made until it is reviewed.`,
      ),
      ...(receipt ? { receipt } : {}),
    };
  }
  // Shopify refunds the balance it holds, not an amount it is sent, so the
  // amount is a fact to check: anything but the approved figure is reviewed.
  if (requested.refund && refund && (
    moneyToCents(refund.amount) !== moneyToCents(requested.refund.amount) || refund.currency !== requested.refund.currency
  )) {
    const receipt = cancellationReceipts.unknown(ctx, orderId, "confirmed_refund_mismatch");
    return {
      ...toolUnknown(
        `Unknown: Shopify cancelled order ${order.name ?? orderId} and refunded ${refund.amount} ${refund.currency}, not the ${requested.refund.amount} ${requested.refund.currency} that was approved. Do not tell the customer a refund amount until it is reviewed.`,
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
    const state = await fetchShopifyOrderSettlement(ctx, orderId);
    if (state?.cancelled_at) {
      const actualReason = state.cancel_reason?.toLowerCase();
      const expectedReason = (input.reason ?? "other").toLowerCase();
      if (!actualReason || actualReason === expectedReason) {
        return cancellationResult(ctx, state, orderId, input, requested, true);
      }
      const result = toolUnknown(
        `Unknown: order ${orderId} is cancelled, but Shopify recorded reason "${actualReason}" instead of "${expectedReason}" after the provider response was interrupted. Do not retry or confirm the cancellation until it is reviewed.`,
      );
      const receipt = cancellationReceipts.unknown(ctx, orderId, "confirmed_reason_mismatch");
      return receipt ? { ...result, receipt } : result;
    }
    const result = toolUnknown(
      `Unknown: the cancellation request for order ${orderId} may still have committed at Shopify, but a follow-up read did not confirm it. Do not retry or confirm it to the customer until it is reconciled. ${formatShopifyToolError("cancellation reconciliation failed", mutationError)}`,
    );
    const receipt = cancellationReceipts.unknown(ctx, orderId, "reconciliation_not_confirmed");
    return receipt ? { ...result, receipt } : result;
  } catch (reconciliationError) {
    const result = toolUnknown(
      `Unknown: the cancellation request for order ${orderId} may have committed at Shopify and the follow-up read failed. Do not retry or confirm it to the customer until it is reconciled. ${formatShopifyToolError("cancellation reconciliation failed", reconciliationError)}`,
    );
    const receipt = cancellationReceipts.unknown(ctx, orderId, "reconciliation_read_failed");
    return receipt ? { ...result, receipt } : result;
  }
}

export async function cancelOrder(
  input: CancelOrderInput,
  ctx: ShopifyContext
): Promise<ToolResult> {
  try {
    const orderId = requireNumericId(input.order_id, "order_id");
    const before = await fetchShopifyOrderSettlement(ctx, orderId);
    if (!before) {
      return cancellationReceipts.failure(
        ctx,
        orderId,
        toolNotFound(`Order ${orderId} was not returned by Shopify.`),
        "not_found",
        "order_not_found",
      );
    }
    if (before.cancelled_at) {
      return cancellationReceipts.failure(
        ctx,
        orderId,
        toolPolicyBlock(`Error: failed to cancel order - order ${before.name ?? orderId} is already cancelled.`),
        "rejected",
        "already_cancelled",
      );
    }
    if (before.fulfillment_status && before.fulfillment_status !== "unfulfilled") {
      return cancellationReceipts.failure(
        ctx,
        orderId,
        toolPolicyBlock(`Error: failed to cancel order - order ${before.name ?? orderId} has already shipped or partially shipped.`),
        "rejected",
        "order_already_fulfilled",
      );
    }

    // Decision H: cancelling a paid order refunds it: the whole balance Shopify
    // holds, which this quote prices so the approval names the amount.
    const quote = await quoteCancellationRefund(ctx, orderId, before);
    if (quote.kind === "currency_mismatch") {
      return cancellationReceipts.failure(
        ctx,
        orderId,
        toolPolicyBlock(`Error: failed to cancel order - Shopify could not price the refund for order ${before.name ?? orderId} in one currency.`, { code: "currency_mismatch" }),
        "rejected",
        "currency_mismatch",
      );
    }
    const requested = {
      refund: quote.kind === "refund" ? { amount: quote.amount, currency: quote.currency } : null,
      priorRefundIds: new Set((before.refunds ?? []).flatMap((refund) => (
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
        return cancellationReceipts.failure(
          ctx,
          orderId,
          toolPolicyBlock(
            `Error: failed to cancel order - Shopify now calculates ${refundPhrase(quotedCents, quotedCurrency)} for order ${before.name ?? orderId}, but ${refundPhrase(approvedCents, approvedCurrency)} was approved; ask for approval again.`,
            { code: "amount_mismatch", approvedCents, quotedCents },
          ),
          "rejected",
          "amount_mismatch",
        );
      }
    }

    let data: OrderCancelData;
    try {
      data = await shopifyGraphql<OrderCancelData>(ctx, ORDER_CANCEL_MUTATION, {
        orderId: `gid://shopify/Order/${orderId}`,
        reason: (input.reason ?? "other").toUpperCase(),
        restock: input.restock ?? true,
        refundMethod: { originalPaymentMethodsRefund: requested.refund !== null },
      });
    } catch (err) {
      if (isAmbiguousShopifyMutationError(err)) {
        return reconcileCancellation(ctx, orderId, input, requested, err);
      }
      throw err;
    }

    const userError = formatUserErrors(data.orderCancel.orderCancelUserErrors);
    if (userError) {
      return cancellationReceipts.failure(
        ctx,
        orderId,
        toolError(`Error: failed to cancel order - ${userError}`),
        "failed",
        "provider_rejected",
      );
    }
    const job = data.orderCancel.job;
    if (!job) {
      const result = toolUnknown(`Unknown: Shopify accepted the cancellation request for order ${orderId} but did not return its job. Do not retry or confirm it to the customer until it is reconciled.`);
      const receipt = cancellationReceipts.unknown(ctx, orderId, "provider_job_missing");
      return receipt ? { ...result, receipt } : result;
    }
    if (!job.done && !(await cancellationJobDone(ctx, job.id))) {
      const result = toolUnknown(`Unknown: Shopify accepted the cancellation of order ${orderId} and is still processing it. Do not retry or confirm it to the customer until it is reconciled.`);
      const receipt = cancellationReceipts.unknown(ctx, orderId, "provider_job_pending");
      return receipt ? { ...result, receipt } : result;
    }

    let after: ShopifyOrder | null;
    try {
      after = await fetchShopifyOrderSettlement(ctx, orderId, { maxRetries: 2 });
    } catch (err) {
      const result = toolUnknown(`Unknown: Shopify finished cancelling order ${orderId}, but reading the result failed. Do not retry or confirm it to the customer until it is reconciled. ${formatShopifyToolError("cancellation confirmation failed", err)}`);
      const receipt = cancellationReceipts.unknown(ctx, orderId, "confirmation_read_failed");
      return receipt ? { ...result, receipt } : result;
    }
    if (!after?.cancelled_at) {
      const result = toolUnknown(`Unknown: Shopify finished the cancellation job for order ${orderId}, but the order does not show as cancelled. Do not retry or confirm it to the customer until it is reconciled.`);
      const receipt = cancellationReceipts.unknown(ctx, orderId, "cancellation_not_confirmed");
      return receipt ? { ...result, receipt } : result;
    }

    return cancellationResult(ctx, after, orderId, input, requested);
  } catch (err) {
    return cancellationReceipts.failure(
      ctx,
      input.order_id.trim() || "invalid",
      toolError(formatShopifyToolError("failed to cancel order", err)),
      "failed",
      "definite_failure",
    );
  }
}
