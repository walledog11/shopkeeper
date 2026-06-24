import type { CreateReturnInput } from "../tools/index.js";
import {
  formatShopifyToolError,
  formatUserErrors,
  shopifyGraphql,
  type ShopifyContext,
  type ShopifyGraphqlUserError,
} from "./client.js";
import { toolError, toolOk, type ToolResult } from "../tools/result.js";
import { optionalString, requireNumericId } from "./validation.js";

const RETURN_REASON_MAP: Record<string, string> = {
  unwanted: "UNWANTED",
  defective: "DEFECTIVE",
  wrong_item: "WRONG_ITEM",
  not_as_described: "NOT_AS_DESCRIBED",
  too_large: "SIZE_TOO_LARGE",
  too_small: "SIZE_TOO_SMALL",
  style: "STYLE",
  color: "COLOR",
  other: "OTHER",
};

interface ReturnableFulfillmentsData {
  order?: {
    returnableFulfillments?: {
      edges: {
        node: {
          returnableFulfillmentLineItems?: {
            edges: {
              node: {
                quantity: number;
                fulfillmentLineItem: {
                  id: string;
                  lineItem?: {
                    name?: string | null;
                    variant?: { id: string } | null;
                  } | null;
                };
              };
            }[];
          } | null;
        };
      }[];
    } | null;
  } | null;
}

interface ReturnCreateData {
  returnCreate?: {
    return?: {
      id: string;
      name?: string | null;
      status?: string | null;
    } | null;
    userErrors?: ShopifyGraphqlUserError[];
  } | null;
}

interface ReturnableLineItem {
  fulfillmentLineItemId: string;
  quantity: number;
  name: string;
  variantId: string | null;
}

export async function createReturn(
  input: CreateReturnInput,
  ctx: ShopifyContext
): Promise<ToolResult> {
  try {
    const orderId = requireNumericId(input.order_id, "order_id");
    const filterVariantId = optionalString(input.variant_id);
    const returnReason = input.reason ? RETURN_REASON_MAP[input.reason] ?? "OTHER" : "UNKNOWN";
    const orderGid = `gid://shopify/Order/${orderId}`;

    const data = await shopifyGraphql<ReturnableFulfillmentsData>(
      ctx,
      `query returnableFulfillments($id: ID!) {
        order(id: $id) {
          returnableFulfillments(first: 50) {
            edges {
              node {
                returnableFulfillmentLineItems(first: 50) {
                  edges {
                    node {
                      quantity
                      fulfillmentLineItem {
                        id
                        lineItem { name variant { id } }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }`,
      { id: orderGid }
    );

    if (!data.order) {
      return toolError(`Error: failed to create return - order ${orderId} was not found.`);
    }

    const returnable: ReturnableLineItem[] = (data.order.returnableFulfillments?.edges ?? [])
      .flatMap((fulfillment) => fulfillment.node.returnableFulfillmentLineItems?.edges ?? [])
      .map((edge) => ({
        fulfillmentLineItemId: edge.node.fulfillmentLineItem.id,
        quantity: edge.node.quantity,
        name: edge.node.fulfillmentLineItem.lineItem?.name ?? "item",
        variantId: edge.node.fulfillmentLineItem.lineItem?.variant?.id ?? null,
      }))
      .filter((item) => item.quantity > 0);

    if (returnable.length === 0) {
      return toolError("Error: this order has no returnable items - it may not have shipped yet, or the items were already returned.");
    }

    let selected = returnable;
    if (filterVariantId) {
      const variantGid = `gid://shopify/ProductVariant/${requireNumericId(filterVariantId, "variant_id")}`;
      selected = returnable.filter((item) => item.variantId === variantGid);
      if (selected.length === 0) {
        return toolError(`Error: could not open a return - variant ${filterVariantId} is not a returnable item on order ${orderId}.`);
      }
    }

    const createData = await shopifyGraphql<ReturnCreateData>(
      ctx,
      `mutation returnCreate($returnInput: ReturnInput!) {
        returnCreate(returnInput: $returnInput) {
          return { id name status }
          userErrors { field message }
        }
      }`,
      {
        returnInput: {
          orderId: orderGid,
          notifyCustomer: false,
          returnLineItems: selected.map((item) => ({
            fulfillmentLineItemId: item.fulfillmentLineItemId,
            quantity: item.quantity,
            returnReason,
          })),
        },
      }
    );

    const payload = createData.returnCreate;
    const userErrors = formatUserErrors(payload?.userErrors);
    if (userErrors) return toolError(`Error: could not create return - ${userErrors}`);

    const createdReturn = payload?.return;
    if (!createdReturn) {
      return toolError("Error: could not create return - Shopify did not return a return record.");
    }

    const itemList = selected.map((item) => `${item.quantity}x ${item.name}`).join(", ");
    const label = createdReturn.name ?? createdReturn.id;
    return toolOk(
      `Opened return ${label} (status ${createdReturn.status ?? "REQUESTED"}) on order ${orderId} for: ${itemList}. No refund was issued - this only authorizes the customer to send the items back. Tell the customer the return is set up and how to ship the items.`
    );
  } catch (err) {
    return toolError(formatShopifyToolError("failed to create return", err));
  }
}
