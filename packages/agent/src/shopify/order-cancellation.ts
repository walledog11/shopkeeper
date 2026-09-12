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
import type { ShopifyOrder } from "./types.js";
import { requireNumericId } from "./validation.js";
import { shopifyFailureReceipt, shopifyReceiptEnvelope } from "./receipts.js";

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
    },
  } : undefined;
  const result = toolOk(
    `Order ${order.name ?? orderId} cancelled successfully${reconciled ? " (confirmed after an interrupted provider response)" : ""}. `
    + `Reason: ${reason}. Restock requested: ${input.restock !== false ? "yes" : "no"}. `
    + `Refund status: Shopify returned financial_status "${financialStatus}".`,
  );
  return receipt ? { ...result, receipt } : result;
}

async function reconcileCancellation(
  ctx: ShopifyContext,
  orderId: string,
  input: CancelOrderInput,
  mutationError: unknown,
): Promise<ToolResult> {
  try {
    const state = await shopifyRestJson<{ order?: ShopifyOrder }>(ctx, `orders/${orderId}.json`, {
      query: { fields: "id,name,cancelled_at,cancel_reason,financial_status" },
    });
    if (state.order?.cancelled_at) {
      const actualReason = state.order.cancel_reason?.toLowerCase();
      const expectedReason = (input.reason ?? "other").toLowerCase();
      if (!actualReason || actualReason === expectedReason) {
        return cancellationResult(ctx, state.order, orderId, input, true);
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
      query: { fields: "id,name,cancelled_at,cancel_reason,financial_status" },
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

    let data: { order?: ShopifyOrder };
    try {
      data = await shopifyRestJson<{ order?: ShopifyOrder }>(ctx, `orders/${orderId}/cancel.json`, {
        method: "POST",
        body: {
          reason: input.reason ?? "other",
          restock: input.restock ?? true,
          email: false,
        },
      });
    } catch (err) {
      if (isAmbiguousShopifyMutationError(err)) {
        return reconcileCancellation(ctx, orderId, input, err);
      }
      throw err;
    }

    if (!data.order) {
      const result = toolUnknown(`Unknown: Shopify accepted the cancellation request for order ${orderId} but did not return the cancelled order. Do not retry or confirm it to the customer until it is reconciled.`);
      const receipt = unknownCancellationReceipt(ctx, orderId, "provider_order_missing");
      return receipt ? { ...result, receipt } : result;
    }

    return cancellationResult(ctx, data.order, orderId, input);
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
