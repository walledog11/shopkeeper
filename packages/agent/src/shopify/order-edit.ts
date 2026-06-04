import type { EditShopifyOrderInput } from "../tools/index.js";
import { toolError, toolOk, type ToolResult } from "../tools/result.js";
import {
  formatShopifyToolError,
  formatUserErrors,
  shopifyGraphql,
  type ShopifyContext,
  type ShopifyGraphqlUserError,
} from "./client.js";
import { optionalPositiveInteger, optionalString, requireNumericId } from "./validation.js";

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
): Promise<ToolResult> {
  try {
    const orderId = requireNumericId(input.order_id, "order_id");
    const addVariantId = optionalString(input.variant_id);
    const removeVariantId = optionalString(input.remove_variant_id);

    if (!addVariantId && !removeVariantId) {
      return toolError("Error: edit_shopify_order requires at least variant_id (to add) or remove_variant_id (to remove).");
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
    if (beginErrors) return toolError(`Error: could not begin order edit - ${beginErrors}`);

    const calculatedOrder = beginPayload?.calculatedOrder;
    const calculatedOrderId = calculatedOrder?.id;
    if (!calculatedOrderId) {
      return toolError("Error: failed to begin order edit - Shopify did not return a calculated order.");
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
        return toolError(`Error: could not remove old item - variant ${removeVariantId} was not found on order ${orderId}.${paginationNote}`);
      }

      if (matches.length > 1) {
        return toolError(`Error: could not remove old item - variant ${removeVariantId} appears multiple times on order ${orderId}; manual review is required.`);
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
      if (addErrors) return toolError(`Error: could not add item to order - ${addErrors}`);
      if (!addPayload?.calculatedOrder) {
        return toolError("Error: could not add item to order - Shopify did not return a calculated order.");
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
      if (setQtyErrors) return toolError(`Error: could not remove old item - ${setQtyErrors}`);
      if (!setQtyPayload?.calculatedOrder) {
        return toolError("Error: could not remove old item - Shopify did not return a calculated order.");
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
    if (commitErrors) return toolError(`Error: could not commit order edit - ${commitErrors}`);

    const order = commitPayload?.order;
    if (!order) return toolError("Error: could not commit order edit - Shopify did not return the updated order.");

    const itemList = order.lineItems.edges.flatMap(({ node }) => {
        if (node.quantity <= 0) return [];
        const variantTitle = node.variant?.title && node.variant.title !== "Default Title"
          ? ` (${node.variant.title})`
          : "";
        return [`${node.quantity}x ${node.title}${variantTitle}`];
      })
      .join(", ");

    const action = addVariantId && removeVariantId
      ? "swapped item on"
      : removeVariantId
        ? "removed item from"
        : "added item to";

    return toolOk(`Successfully ${action} order ${order.name ?? `#${orderId}`}. Current order items: ${itemList || "none"}.`);
  } catch (err) {
    return toolError(formatShopifyToolError("failed to edit order", err));
  }
}
