import type { CancelOrderInput } from "../tools";
import { toolError, toolOk, type ToolResult } from "../tools/result";
import { formatShopifyToolError, shopifyRestJson, type ShopifyContext } from "./client";
import type { ShopifyOrder } from "./types";
import { requireNumericId } from "./validation";

export async function cancelOrder(
  input: CancelOrderInput,
  ctx: ShopifyContext
): Promise<ToolResult> {
  try {
    const orderId = requireNumericId(input.order_id, "order_id");
    const data = await shopifyRestJson<{ order?: ShopifyOrder }>(ctx, `orders/${orderId}/cancel.json`, {
      method: "POST",
      body: {
        reason: input.reason ?? "other",
        restock: input.restock ?? true,
        email: false,
      },
    });

    if (!data.order) {
      return toolError(`Error: failed to cancel order - order ${orderId} was not returned by Shopify.`);
    }

    return toolOk(`Order ${data.order.name ?? orderId} cancelled successfully. Reason: ${input.reason ?? "other"}. Items ${input.restock !== false ? "restocked" : "not restocked"}. Refund status: Shopify returned financial_status "${data.order.financial_status ?? "unknown"}".`);
  } catch (err) {
    return toolError(formatShopifyToolError("failed to cancel order", err));
  }
}
