import type { CreateReturnInput } from "../tools/index.js";
import {
  formatShopifyToolError,
  formatUserErrors,
  isAmbiguousShopifyMutationError,
  shopifyGraphql,
  type ShopifyContext,
  type ShopifyGraphqlUserError,
} from "./client.js";
import { toolError, toolOk, toolUnknown, type ToolResult } from "../tools/result.js";
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

export function mapReturnReason(reason: string | undefined): string {
  return reason ? RETURN_REASON_MAP[reason] ?? "OTHER" : "UNKNOWN";
}

interface ReturnableFulfillmentsData {
  order?: { id: string } | null;
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

export const RETURN_CREATE_MUTATION = `mutation returnCreate($returnInput: ReturnInput!) {
      returnCreate(returnInput: $returnInput) {
        return { id name status }
        userErrors { field message }
      }
    }`;

// `returnableFulfillments` is a root query taking orderId, not a field on Order:
// it was removed from Order with no deprecation pointing anywhere, so the old
// `order { returnableFulfillments }` was a static validation error and every
// create_return and create_exchange died on it. `order { id }` rides along only
// to keep "order not found" distinguishable from "nothing to return", which the
// Order-nested form got for free.
export const RETURNABLE_FULFILLMENTS_QUERY = `query returnableFulfillments($orderId: ID!) {
  order(id: $orderId) { id }
  returnableFulfillments(orderId: $orderId, first: 50) {
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
}`;

export interface ReturnableLineItem {
  fulfillmentLineItemId: string;
  quantity: number;
  name: string;
  variantId: string | null;
}

export interface CreatedReturn {
  id: string;
  name?: string | null;
  status?: string | null;
}

export interface ReturnWatchToolData {
  returnWatch: {
    shopifyReturnId: string;
    returnName: string | null;
    orderId: string;
    tool: "create_return" | "create_exchange";
  };
}

// Returns null when the order does not exist.
export async function fetchReturnableLineItems(
  ctx: ShopifyContext,
  orderGid: string
): Promise<ReturnableLineItem[] | null> {
  const data = await shopifyGraphql<ReturnableFulfillmentsData>(
    ctx,
    RETURNABLE_FULFILLMENTS_QUERY,
    { orderId: orderGid }
  );

  if (!data.order) return null;

  return (data.returnableFulfillments?.edges ?? [])
    .flatMap((fulfillment) => fulfillment.node.returnableFulfillmentLineItems?.edges ?? [])
    .map((edge) => ({
      fulfillmentLineItemId: edge.node.fulfillmentLineItem.id,
      quantity: edge.node.quantity,
      name: edge.node.fulfillmentLineItem.lineItem?.name ?? "item",
      variantId: edge.node.fulfillmentLineItem.lineItem?.variant?.id ?? null,
    }))
    .filter((item) => item.quantity > 0);
}

export async function runReturnCreate(
  ctx: ShopifyContext,
  returnInput: Record<string, unknown>
): Promise<{ createdReturn: CreatedReturn } | { errorMessage: string }> {
  const createData = await shopifyGraphql<ReturnCreateData>(
    ctx,
    RETURN_CREATE_MUTATION,
    { returnInput }
  );

  const payload = createData.returnCreate;
  const userErrors = formatUserErrors(payload?.userErrors);
  if (userErrors) return { errorMessage: userErrors };

  const createdReturn = payload?.return;
  if (!createdReturn) {
    return { errorMessage: "Shopify did not return a return record." };
  }
  return { createdReturn };
}

export async function createReturn(
  input: CreateReturnInput,
  ctx: ShopifyContext
): Promise<ToolResult> {
  // Only returnCreate can open a return; the returnable-items lookup above it
  // commits nothing and keeps the ordinary error path.
  let mutationStarted = false;
  try {
    const orderId = requireNumericId(input.order_id, "order_id");
    const filterVariantId = optionalString(input.variant_id);
    const returnReason = mapReturnReason(input.reason);
    const orderGid = `gid://shopify/Order/${orderId}`;

    const returnable = await fetchReturnableLineItems(ctx, orderGid);
    if (!returnable) {
      return toolError(`Error: failed to create return - order ${orderId} was not found.`);
    }

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

    mutationStarted = true;
    const created = await runReturnCreate(ctx, {
      orderId: orderGid,
      notifyCustomer: false,
      returnLineItems: selected.map((item) => ({
        fulfillmentLineItemId: item.fulfillmentLineItemId,
        quantity: item.quantity,
        returnReason,
      })),
    });

    if ("errorMessage" in created) {
      return toolError(`Error: could not create return - ${created.errorMessage}`);
    }

    const itemList = selected.map((item) => `${item.quantity}x ${item.name}`).join(", ");
    const label = created.createdReturn.name ?? created.createdReturn.id;
    return toolOk(
      `Opened return ${label} (status ${created.createdReturn.status ?? "REQUESTED"}) on order ${orderId} for: ${itemList}. No refund was issued - this only authorizes the customer to send the items back. Tell the customer the return is set up and how to ship the items.`,
      {
        returnWatch: {
          shopifyReturnId: created.createdReturn.id,
          returnName: created.createdReturn.name ?? null,
          orderId,
          tool: "create_return",
        },
      } satisfies ReturnWatchToolData,
    );
  } catch (err) {
    if (mutationStarted && isAmbiguousShopifyMutationError(err)) {
      return toolUnknown(
        `Unknown: the return may have been opened at Shopify, but it could not be confirmed. Do not open another return, retry, or tell the customer the return is set up until order ${input.order_id} is reviewed. ${formatShopifyToolError("return reconciliation failed", err)}`,
      );
    }
    return toolError(formatShopifyToolError("failed to create return", err));
  }
}
