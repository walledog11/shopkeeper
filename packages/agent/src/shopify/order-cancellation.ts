import type { CancelOrderInput } from "../tools/index.js";
import { toolError, toolOk, toolUnknown, type ToolResult } from "../tools/result.js";
import {
  formatShopifyToolError,
  isAmbiguousShopifyMutationError,
  shopifyRestJson,
  type ShopifyContext,
} from "./client.js";
import type { ShopifyOrder } from "./types.js";
import { requireNumericId } from "./validation.js";

function cancellationResult(
  order: ShopifyOrder,
  orderId: string,
  input: CancelOrderInput,
  reconciled = false,
): ToolResult {
  return toolOk(
    `Order ${order.name ?? orderId} cancelled successfully${reconciled ? " (confirmed after an interrupted provider response)" : ""}. `
    + `Reason: ${input.reason ?? "other"}. Restock requested: ${input.restock !== false ? "yes" : "no"}. `
    + `Refund status: Shopify returned financial_status "${order.financial_status ?? "unknown"}".`,
  );
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
        return cancellationResult(state.order, orderId, input, true);
      }
      return toolUnknown(
        `Unknown: order ${orderId} is cancelled, but Shopify recorded reason "${actualReason}" instead of "${expectedReason}" after the provider response was interrupted. Do not retry or confirm the cancellation until it is reviewed.`,
      );
    }
    return toolUnknown(
      `Unknown: the cancellation request for order ${orderId} may still have committed at Shopify, but a follow-up read did not confirm it. Do not retry or confirm it to the customer until it is reconciled. ${formatShopifyToolError("cancellation reconciliation failed", mutationError)}`,
    );
  } catch (reconciliationError) {
    return toolUnknown(
      `Unknown: the cancellation request for order ${orderId} may have committed at Shopify and the follow-up read failed. Do not retry or confirm it to the customer until it is reconciled. ${formatShopifyToolError("cancellation reconciliation failed", reconciliationError)}`,
    );
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
      return toolError(`Error: failed to cancel order - order ${orderId} was not returned by Shopify.`);
    }
    if (before.order.cancelled_at) {
      return toolError(`Error: failed to cancel order - order ${before.order.name ?? orderId} is already cancelled.`);
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
      return toolUnknown(`Unknown: Shopify accepted the cancellation request for order ${orderId} but did not return the cancelled order. Do not retry or confirm it to the customer until it is reconciled.`);
    }

    return cancellationResult(data.order, orderId, input);
  } catch (err) {
    return toolError(formatShopifyToolError("failed to cancel order", err));
  }
}
