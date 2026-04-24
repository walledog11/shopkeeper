import type {
  CancelOrderInput,
  CreateShopifyOrderInput,
  EditShopifyOrderInput,
  GetOrderByNameInput,
  GetShopifyOrdersInput,
  UpdateShopifyOrderAddressInput,
} from "../tools";
import {
  formatShopifyToolError,
  formatUserErrors,
  shopifyGraphql,
  shopifyRestJson,
  type ShopifyContext,
  type ShopifyGraphqlUserError,
} from "./client";
import { formatAddressForMessage, serializeOrder } from "./serializers";
import type { ShopifyCustomer, ShopifyCustomerAddress, ShopifyOrder } from "./types";
import {
  optionalPositiveInteger,
  optionalString,
  requireAmount,
  requireEmail,
  requireNonEmptyString,
  requireNumericId,
  ShopifyInputError,
} from "./validation";

export interface CreateShopifyOrderOptions {
  allowCustomLineItems?: boolean;
}

function buildAddress(input: {
  first_name?: unknown;
  last_name?: unknown;
  address1: unknown;
  address2?: unknown;
  city: unknown;
  province: unknown;
  zip: unknown;
  country: unknown;
}): Record<string, string> {
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

function orderFields(): string {
  return "id,name,created_at,financial_status,fulfillment_status,total_price,current_total_price,currency,line_items";
}

export async function getShopifyOrders(
  input: GetShopifyOrdersInput,
  ctx: ShopifyContext
): Promise<string> {
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
    if (orders.length === 0) return "No orders found for this customer.";

    return JSON.stringify(orders.map(serializeOrder));
  } catch (err) {
    return formatShopifyToolError("could not fetch orders", err);
  }
}

export async function getOrderByName(
  input: GetOrderByNameInput,
  ctx: ShopifyContext
): Promise<string> {
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
    if (orders.length === 0) return `No order found with number ${name}.`;

    return JSON.stringify(serializeOrder(orders[0]));
  } catch (err) {
    return formatShopifyToolError("could not search orders", err);
  }
}

export async function updateShopifyOrderAddress(
  input: UpdateShopifyOrderAddressInput,
  ctx: ShopifyContext
): Promise<string> {
  try {
    const orderId = requireNumericId(input.order_id, "order_id");
    const customerId = requireNumericId(input.customer_id, "customer_id");
    const addressPayload = buildAddress(input);

    const orderData = await shopifyRestJson<{ order?: ShopifyOrder }>(ctx, `orders/${orderId}.json`, {
      method: "PUT",
      body: { order: { id: orderId, shipping_address: addressPayload } },
    });

    const addr = orderData.order?.shipping_address;
    if (!orderData.order || !addr) {
      return `Error: order ${orderId} not found or shipping address was not returned after update.`;
    }

    let customerSync = "Customer profile was not updated because no default address exists.";
    try {
      const customerData = await shopifyRestJson<{ customer?: Pick<ShopifyCustomer, "default_address"> }>(
        ctx,
        `customers/${customerId}.json`,
        { query: { fields: "id,default_address" } }
      );
      const defaultAddressId = customerData.customer?.default_address?.id;

      if (defaultAddressId !== undefined && defaultAddressId !== null) {
        await shopifyRestJson<{ customer_address?: ShopifyCustomerAddress }>(
          ctx,
          `customers/${customerId}/addresses/${defaultAddressId}.json`,
          {
            method: "PUT",
            body: { address: addressPayload },
          }
        );
        customerSync = "Customer profile also updated.";
      }
    } catch (syncErr) {
      customerSync = formatShopifyToolError("customer profile sync failed", syncErr).replace(/^Error: /, "");
    }

    return `Order #${orderData.order.order_number ?? orderId} shipping address updated to: ${formatAddressForMessage(addr)}. ${customerSync}`;
  } catch (err) {
    return formatShopifyToolError("failed to update order shipping address", err);
  }
}

export async function cancelOrder(
  input: CancelOrderInput,
  ctx: ShopifyContext
): Promise<string> {
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
      return `Error: failed to cancel order - order ${orderId} was not returned by Shopify.`;
    }

    return `Order ${data.order.name ?? orderId} cancelled successfully. Reason: ${input.reason ?? "other"}. Items ${input.restock !== false ? "restocked" : "not restocked"}. Refund status: Shopify returned financial_status "${data.order.financial_status ?? "unknown"}".`;
  } catch (err) {
    return formatShopifyToolError("failed to cancel order", err);
  }
}

export async function createShopifyOrder(
  input: CreateShopifyOrderInput,
  ctx: ShopifyContext,
  options: CreateShopifyOrderOptions = {}
): Promise<string> {
  try {
    const email = requireEmail(input.email, "email");
    const shippingAddress = buildAddress({
      first_name: input.first_name,
      last_name: input.last_name,
      address1: input.address1,
      address2: input.address2,
      city: input.city,
      province: input.province,
      zip: input.zip,
      country: input.country,
    });

    if (!Array.isArray(input.line_items) || input.line_items.length === 0) {
      throw new ShopifyInputError("line_items must include at least one item.");
    }

    const lineItems = input.line_items.map((item, index) => {
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
      return "Error: failed to create order - Shopify did not return an order.";
    }

    const orderName = data.order.name ?? `#${data.order.id}`;
    const total = data.order.total_price ? `$${data.order.total_price}` : "unknown total";
    const adminUrl = `https://${ctx.shop}/admin/orders/${data.order.id}`;
    return `Done — order ${orderName} is in for ${email}, total ${total}.\n\n[View in Shopify](${adminUrl})`;
  } catch (err) {
    return formatShopifyToolError("failed to create order", err);
  }
}

type CalculatedLineItemEdge = {
  node: {
    id: string;
    quantity: number;
    title: string;
    variant?: { id: string } | null;
  };
};

interface OrderEditBeginData {
  orderEditBegin?: {
    calculatedOrder?: {
      id: string;
      lineItems: {
        edges: CalculatedLineItemEdge[];
        pageInfo: { hasNextPage: boolean };
      };
    } | null;
    userErrors?: ShopifyGraphqlUserError[];
  } | null;
}

interface OrderEditMutationData {
  orderEditAddVariant?: {
    calculatedOrder?: { id: string } | null;
    userErrors?: ShopifyGraphqlUserError[];
  } | null;
  orderEditSetQuantity?: {
    calculatedOrder?: { id: string } | null;
    userErrors?: ShopifyGraphqlUserError[];
  } | null;
  orderEditCommit?: {
    order?: {
      name?: string;
      lineItems: {
        edges: { node: { title: string; quantity: number; variant?: { title: string } | null } }[];
      };
    } | null;
    userErrors?: ShopifyGraphqlUserError[];
  } | null;
}

export async function editShopifyOrder(
  input: EditShopifyOrderInput,
  ctx: ShopifyContext
): Promise<string> {
  try {
    const orderId = requireNumericId(input.order_id, "order_id");
    const addVariantId = optionalString(input.variant_id);
    const removeVariantId = optionalString(input.remove_variant_id);

    if (!addVariantId && !removeVariantId) {
      return "Error: edit_shopify_order requires at least variant_id (to add) or remove_variant_id (to remove).";
    }

    const productVariantIdPrefix = "gid://shopify/ProductVariant/";
    const orderGid = `gid://shopify/Order/${orderId}`;

    const beginData = await shopifyGraphql<OrderEditBeginData>(
      ctx,
      `mutation orderEditBegin($id: ID!) {
        orderEditBegin(id: $id) {
          calculatedOrder {
            id
            lineItems(first: 250) {
              edges { node { id quantity variant { id } title } }
              pageInfo { hasNextPage }
            }
          }
          userErrors { field message }
        }
      }`,
      { id: orderGid }
    );

    const beginPayload = beginData.orderEditBegin;
    const beginErrors = formatUserErrors(beginPayload?.userErrors);
    if (beginErrors) return `Error: could not begin order edit - ${beginErrors}`;

    const calculatedOrder = beginPayload?.calculatedOrder;
    const calculatedOrderId = calculatedOrder?.id;
    if (!calculatedOrderId) {
      return "Error: failed to begin order edit - Shopify did not return a calculated order.";
    }

    let itemToRemove: CalculatedLineItemEdge | undefined;
    if (removeVariantId) {
      const removeVariantGid = `${productVariantIdPrefix}${requireNumericId(removeVariantId, "remove_variant_id")}`;
      const matches = (calculatedOrder.lineItems.edges ?? []).filter(
        (edge) => edge.node.quantity > 0 && edge.node.variant?.id === removeVariantGid
      );

      if (matches.length === 0) {
        const paginationNote = calculatedOrder.lineItems.pageInfo.hasNextPage
          ? " The order has more than 250 line items, so the target item may be outside the fetched page."
          : "";
        return `Error: could not remove old item - variant ${removeVariantId} was not found on order ${orderId}.${paginationNote}`;
      }

      if (matches.length > 1) {
        return `Error: could not remove old item - variant ${removeVariantId} appears multiple times on order ${orderId}; manual review is required.`;
      }

      itemToRemove = matches[0];
    }

    if (addVariantId) {
      const addData = await shopifyGraphql<OrderEditMutationData>(
        ctx,
        `mutation orderEditAddVariant($id: ID!, $variantId: ID!, $quantity: Int!) {
          orderEditAddVariant(id: $id, variantId: $variantId, quantity: $quantity) {
            calculatedOrder { id }
            userErrors { field message }
          }
        }`,
        {
          id: calculatedOrderId,
          variantId: `${productVariantIdPrefix}${requireNumericId(addVariantId, "variant_id")}`,
          quantity: optionalPositiveInteger(input.quantity, "quantity", 1),
        }
      );

      const addPayload = addData.orderEditAddVariant;
      const addErrors = formatUserErrors(addPayload?.userErrors);
      if (addErrors) return `Error: could not add item to order - ${addErrors}`;
      if (!addPayload?.calculatedOrder) {
        return "Error: could not add item to order - Shopify did not return a calculated order.";
      }
    }

    if (itemToRemove) {
      const setQtyData = await shopifyGraphql<OrderEditMutationData>(
        ctx,
        `mutation orderEditSetQuantity($id: ID!, $lineItemId: ID!, $quantity: Int!) {
          orderEditSetQuantity(id: $id, lineItemId: $lineItemId, quantity: $quantity) {
            calculatedOrder { id }
            userErrors { field message }
          }
        }`,
        { id: calculatedOrderId, lineItemId: itemToRemove.node.id, quantity: 0 }
      );

      const setQtyPayload = setQtyData.orderEditSetQuantity;
      const setQtyErrors = formatUserErrors(setQtyPayload?.userErrors);
      if (setQtyErrors) return `Error: could not remove old item - ${setQtyErrors}`;
      if (!setQtyPayload?.calculatedOrder) {
        return "Error: could not remove old item - Shopify did not return a calculated order.";
      }
    }

    const commitData = await shopifyGraphql<OrderEditMutationData>(
      ctx,
      `mutation orderEditCommit($id: ID!) {
        orderEditCommit(id: $id, notifyCustomer: false) {
          order {
            name
            lineItems(first: 250) {
              edges { node { title quantity variant { title } } }
            }
          }
          userErrors { field message }
        }
      }`,
      { id: calculatedOrderId }
    );

    const commitPayload = commitData.orderEditCommit;
    const commitErrors = formatUserErrors(commitPayload?.userErrors);
    if (commitErrors) return `Error: could not commit order edit - ${commitErrors}`;

    const order = commitPayload?.order;
    if (!order) return "Error: could not commit order edit - Shopify did not return the updated order.";

    const itemList = order.lineItems.edges
      .filter(({ node }) => node.quantity > 0)
      .map(({ node }) => {
        const variantTitle = node.variant?.title && node.variant.title !== "Default Title"
          ? ` (${node.variant.title})`
          : "";
        return `${node.quantity}x ${node.title}${variantTitle}`;
      })
      .join(", ");

    const action = addVariantId && removeVariantId
      ? "swapped item on"
      : removeVariantId
        ? "removed item from"
        : "added item to";

    return `Successfully ${action} order ${order.name ?? `#${orderId}`}. Current order items: ${itemList || "none"}.`;
  } catch (err) {
    return formatShopifyToolError("failed to edit order", err);
  }
}
