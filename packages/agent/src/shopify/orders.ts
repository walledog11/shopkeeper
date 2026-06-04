import type { GetOrderByNameInput, GetShopifyOrdersInput } from "../tools/index.js";
import { toolError, toolNotFound, toolOk, type ToolResult } from "../tools/result.js";
import { formatShopifyToolError, shopifyRestJson, type ShopifyContext } from "./client.js";
import { serializeOrder } from "./serializers.js";
import type { ShopifyOrder } from "./types.js";
import { requireNonEmptyString, requireNumericId } from "./validation.js";

function orderFields(): string {
  return "id,name,created_at,financial_status,fulfillment_status,total_price,current_total_price,currency,line_items,shipping_address";
}

export async function getShopifyOrders(
  input: GetShopifyOrdersInput,
  ctx: ShopifyContext
): Promise<ToolResult> {
  try {
    const customerId = requireNumericId(input.customer_id, "customer_id");
    const data = await shopifyRestJson<{ orders?: ShopifyOrder[] }>(ctx, "orders.json", {
      query: {
        customer_id: customerId,
        status: "any",
        limit: 5,
        fields: orderFields(),
      },
    });

    const orders = data.orders ?? [];
    if (orders.length === 0) return toolNotFound("No orders found for this customer.");

    return toolOk(JSON.stringify(orders.map(serializeOrder)));
  } catch (err) {
    return toolError(formatShopifyToolError("could not fetch orders", err));
  }
}

export async function getOrderByName(
  input: GetOrderByNameInput,
  ctx: ShopifyContext
): Promise<ToolResult> {
  try {
    const rawName = requireNonEmptyString(input.order_name, "order_name");
    const name = rawName.startsWith("#") ? rawName : `#${rawName}`;
    const data = await shopifyRestJson<{ orders?: ShopifyOrder[] }>(ctx, "orders.json", {
      query: {
        name,
        status: "any",
        limit: 1,
        fields: orderFields(),
      },
    });

    const orders = data.orders ?? [];
    if (orders.length === 0) return toolNotFound(`No order found with number ${name}.`);

    return toolOk(JSON.stringify(serializeOrder(orders[0])));
  } catch (err) {
    return toolError(formatShopifyToolError("could not search orders", err));
  }
}
