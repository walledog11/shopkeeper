import type { CreateShopifyOrderInput, CreateShopifyOrderLineItem } from "../tools/index.js";
import { toolError, toolOk, type ToolResult } from "../tools/result.js";
import { formatShopifyToolError, shopifyRestJson, type ShopifyContext } from "./client.js";
import { buildOrderAddress } from "./order-address.js";
import type { ShopifyOrder } from "./types.js";
import {
  optionalPositiveInteger,
  optionalString,
  requireAmount,
  requireEmail,
  requireNonEmptyString,
  requireNumericId,
  ShopifyInputError,
} from "./validation.js";

export interface CreateShopifyOrderOptions {
  allowCustomLineItems?: boolean;
}

function buildLineItems(
  lineItems: CreateShopifyOrderLineItem[],
  options: CreateShopifyOrderOptions
) {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    throw new ShopifyInputError("line_items must include at least one item.");
  }

  return lineItems.map((item, index) => {
    const quantity = optionalPositiveInteger(item.quantity, `line_items[${index}].quantity`, 1);
    const variantId = optionalString(item.variant_id);

    if (variantId) {
      return { variant_id: Number(requireNumericId(variantId, `line_items[${index}].variant_id`)), quantity };
    }

    if (!options.allowCustomLineItems) {
      throw new ShopifyInputError("Custom line items are disabled. Each line item must include a variant_id.");
    }

    return {
      title: requireNonEmptyString(item.title, `line_items[${index}].title`),
      price: requireAmount(item.price, `line_items[${index}].price`),
      quantity,
      requires_shipping: true,
    };
  });
}

export async function createShopifyOrder(
  input: CreateShopifyOrderInput,
  ctx: ShopifyContext,
  options: CreateShopifyOrderOptions = {}
): Promise<ToolResult> {
  try {
    const email = requireEmail(input.email, "email");
    const shippingAddress = buildOrderAddress({
      first_name: input.first_name,
      last_name: input.last_name,
      address1: input.address1,
      address2: input.address2,
      city: input.city,
      province: input.province,
      zip: input.zip,
      country: input.country,
    });
    const lineItems = buildLineItems(input.line_items, options);
    const note = optionalString(input.note);

    const data = await shopifyRestJson<{ order?: ShopifyOrder }>(ctx, "orders.json", {
      method: "POST",
      body: {
        order: {
          email,
          financial_status: "pending",
          send_receipt: false,
          send_fulfillment_receipt: false,
          line_items: lineItems,
          shipping_address: shippingAddress,
          billing_address: shippingAddress,
          ...(note ? { note } : {}),
        },
      },
    });

    if (!data.order) {
      return toolError("Error: failed to create order - Shopify did not return an order.");
    }

    const orderName = data.order.name ?? `#${data.order.id}`;
    const total = data.order.total_price ? `$${data.order.total_price}` : "unknown total";
    const adminUrl = `https://${ctx.shop}/admin/orders/${data.order.id}`;
    return toolOk(`Done — order ${orderName} is in for ${email}, total ${total}.\n\n[View in Shopify](${adminUrl})`);
  } catch (err) {
    return toolError(formatShopifyToolError("failed to create order", err));
  }
}
