import type { UpdateShopifyOrderAddressInput } from "../tools/index.js";
import { toolError, toolOk, type ToolResult } from "../tools/result.js";
import { formatShopifyToolError, shopifyRestJson, type ShopifyContext } from "./client.js";
import { formatAddressForMessage } from "./serializers.js";
import type { ShopifyCustomer, ShopifyCustomerAddress, ShopifyOrder } from "./types.js";
import { optionalString, requireNonEmptyString, requireNumericId } from "./validation.js";

interface OrderAddressInput {
  first_name?: unknown;
  last_name?: unknown;
  address1: unknown;
  address2?: unknown;
  city: unknown;
  province: unknown;
  zip: unknown;
  country: unknown;
}

export function buildOrderAddress(input: OrderAddressInput): Record<string, string> {
  const address2 = optionalString(input.address2);

  return {
    ...(input.first_name !== undefined ? { first_name: requireNonEmptyString(input.first_name, "first_name") } : {}),
    ...(input.last_name !== undefined ? { last_name: requireNonEmptyString(input.last_name, "last_name") } : {}),
    address1: requireNonEmptyString(input.address1, "address1"),
    ...(address2 ? { address2 } : {}),
    city: requireNonEmptyString(input.city, "city"),
    province: requireNonEmptyString(input.province, "province"),
    zip: requireNonEmptyString(input.zip, "zip"),
    country: requireNonEmptyString(input.country, "country"),
  };
}

async function syncCustomerDefaultAddress(
  ctx: ShopifyContext,
  customerId: string,
  addressPayload: Record<string, string>
): Promise<string> {
  try {
    const customerData = await shopifyRestJson<{ customer?: Pick<ShopifyCustomer, "default_address"> }>(
      ctx,
      `customers/${customerId}.json`,
      { query: { fields: "id,default_address" } }
    );
    const defaultAddressId = customerData.customer?.default_address?.id;

    if (defaultAddressId === undefined || defaultAddressId === null) {
      return "Customer profile was not updated because no default address exists.";
    }

    await shopifyRestJson<{ customer_address?: ShopifyCustomerAddress }>(
      ctx,
      `customers/${customerId}/addresses/${defaultAddressId}.json`,
      {
        method: "PUT",
        body: { address: addressPayload },
      }
    );
    return "Customer profile also updated.";
  } catch (err) {
    return formatShopifyToolError("customer profile sync failed", err).replace(/^Error: /, "");
  }
}

export async function updateShopifyOrderAddress(
  input: UpdateShopifyOrderAddressInput,
  ctx: ShopifyContext
): Promise<ToolResult> {
  try {
    const orderId = requireNumericId(input.order_id, "order_id");
    const customerId = requireNumericId(input.customer_id, "customer_id");
    const addressPayload = buildOrderAddress(input);

    const orderData = await shopifyRestJson<{ order?: ShopifyOrder }>(ctx, `orders/${orderId}.json`, {
      method: "PUT",
      body: { order: { id: orderId, shipping_address: addressPayload } },
    });

    const addr = orderData.order?.shipping_address;
    if (!orderData.order || !addr) {
      return toolError(`Error: order ${orderId} not found or shipping address was not returned after update.`);
    }

    const customerSync = await syncCustomerDefaultAddress(ctx, customerId, addressPayload);
    return toolOk(`Order #${orderData.order.order_number ?? orderId} shipping address updated to: ${formatAddressForMessage(addr)}. ${customerSync}`);
  } catch (err) {
    return toolError(formatShopifyToolError("failed to update order shipping address", err));
  }
}
