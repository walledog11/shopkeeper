import type { FulfillOrderInput } from "../tools/index.js";
import {
  formatShopifyToolError,
  formatUserErrors,
  isAmbiguousShopifyMutationError,
  shopifyGraphql,
  type ShopifyContext,
  type ShopifyGraphqlUserError,
} from "./client.js";
import { toolError, toolOk, toolUnknown, type ToolResult } from "../tools/result.js";
import { optionalString, requireNumericId, ShopifyInputError } from "./validation.js";

// Exported so the reconciliation probe decides "was this fulfillable?" with the
// same predicate the tool commits on rather than a second copy of it. SCHEDULED
// and ON_HOLD are deliberately absent: fulfillmentCreate rejects both, so
// treating them as fulfillable would send a mutation Shopify always refuses.
export const FULFILLABLE_FULFILLMENT_ORDER_STATUSES = new Set(["OPEN", "IN_PROGRESS"]);

export const ORDER_FULFILLMENT_ORDERS_QUERY = `query orderFulfillmentOrders($id: ID!) {
  order(id: $id) {
    id
    fulfillmentOrders(first: 20) {
      edges {
        node {
          id
          status
          lineItems(first: 50) {
            edges {
              node {
                id
                remainingQuantity
                lineItem { name }
              }
            }
          }
        }
      }
    }
  }
}`;

// Read by the reconciliation probe. `Order.fulfillments` is a plain list with a
// `first` argument in this API version, not a connection - it takes no `edges`.
export const ORDER_FULFILLMENTS_TRACKING_QUERY = `query orderFulfillmentsTracking($id: ID!) {
  order(id: $id) {
    fulfillments(first: 20) {
      id
      status
      trackingInfo { number }
    }
  }
}`;

export const FULFILLMENT_CREATE_MUTATION = `mutation fulfillmentCreate($fulfillment: FulfillmentInput!) {
      fulfillmentCreate(fulfillment: $fulfillment) {
        fulfillment {
          id
          status
          totalQuantity
          trackingInfo { number company url }
        }
        userErrors { field message }
      }
    }`;

interface OrderFulfillmentOrdersData {
  order?: {
    id: string;
    fulfillmentOrders?: {
      edges: {
        node: {
          id: string;
          status?: string | null;
          lineItems?: {
            edges: {
              node: {
                id: string;
                remainingQuantity?: number | null;
                lineItem?: { name?: string | null } | null;
              };
            }[];
          } | null;
        };
      }[];
    } | null;
  } | null;
}

interface FulfillmentCreateData {
  fulfillmentCreate?: {
    fulfillment?: {
      id: string;
      status?: string | null;
      totalQuantity?: number | null;
      trackingInfo?: { number?: string | null; company?: string | null; url?: string | null }[] | null;
    } | null;
    userErrors?: ShopifyGraphqlUserError[];
  } | null;
}

export interface FulfillableFulfillmentOrder {
  fulfillmentOrderId: string;
  lineItems: { id: string; quantity: number; name: string }[];
}

function optionalTrackingUrl(value: unknown): string | undefined {
  const url = optionalString(value);
  if (!url) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ShopifyInputError("tracking_url must be a valid URL.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new ShopifyInputError("tracking_url must be an http(s) URL.");
  }
  return url;
}

// Returns null when the order does not exist, so "order not found" stays
// distinguishable from "nothing left to fulfill".
export async function fetchFulfillableFulfillmentOrders(
  ctx: ShopifyContext,
  orderGid: string,
): Promise<FulfillableFulfillmentOrder[] | null> {
  const data = await shopifyGraphql<OrderFulfillmentOrdersData>(
    ctx,
    ORDER_FULFILLMENT_ORDERS_QUERY,
    { id: orderGid },
  );

  if (!data.order) return null;

  return (data.order.fulfillmentOrders?.edges ?? [])
    .map((edge) => edge.node)
    .filter((node) => FULFILLABLE_FULFILLMENT_ORDER_STATUSES.has(node.status ?? ""))
    .map((node) => ({
      fulfillmentOrderId: node.id,
      lineItems: (node.lineItems?.edges ?? [])
        .map((edge) => ({
          id: edge.node.id,
          quantity: edge.node.remainingQuantity ?? 0,
          name: edge.node.lineItem?.name ?? "item",
        }))
        .filter((item) => item.quantity > 0),
    }))
    .filter((entry) => entry.lineItems.length > 0);
}

interface OrderFulfillmentsTrackingData {
  order?: {
    fulfillments?: {
      id: string;
      status?: string | null;
      trackingInfo?: { number?: string | null }[] | null;
    }[] | null;
  } | null;
}

// Tracking numbers on every fulfillment of the order, so the probe can identify
// this call's fulfillment rather than merely observing that one exists.
export async function fetchOrderFulfillmentTrackingNumbers(
  ctx: ShopifyContext,
  orderGid: string,
): Promise<string[]> {
  const data = await shopifyGraphql<OrderFulfillmentsTrackingData>(
    ctx,
    ORDER_FULFILLMENTS_TRACKING_QUERY,
    { id: orderGid },
  );

  return (data.order?.fulfillments ?? [])
    .flatMap((fulfillment) => fulfillment.trackingInfo ?? [])
    .map((info) => info.number)
    .filter((number): number is string => Boolean(number));
}

export async function fulfillOrder(
  input: FulfillOrderInput,
  ctx: ShopifyContext,
): Promise<ToolResult> {
  // Only fulfillmentCreate can mark the order shipped; the fulfillment-order
  // lookup above it commits nothing and keeps the ordinary error path.
  let mutationStarted = false;
  try {
    const orderId = requireNumericId(input.order_id, "order_id");
    const trackingNumber = optionalString(input.tracking_number);
    const trackingCompany = optionalString(input.tracking_company);
    const trackingUrl = optionalTrackingUrl(input.tracking_url);
    const notifyCustomer = input.notify_customer ?? true;
    const orderGid = `gid://shopify/Order/${orderId}`;

    const fulfillable = await fetchFulfillableFulfillmentOrders(ctx, orderGid);
    if (!fulfillable) {
      return toolError(`Error: failed to fulfill order - order ${orderId} was not found.`);
    }

    if (fulfillable.length === 0) {
      return toolError(
        `Error: order ${orderId} has nothing left to fulfill - every item is already fulfilled, or the order was cancelled or put on hold.`,
      );
    }

    const trackingInfo = trackingNumber || trackingCompany || trackingUrl
      ? {
          ...(trackingNumber ? { number: trackingNumber } : {}),
          ...(trackingCompany ? { company: trackingCompany } : {}),
          ...(trackingUrl ? { url: trackingUrl } : {}),
        }
      : null;

    mutationStarted = true;
    const created = await shopifyGraphql<FulfillmentCreateData>(
      ctx,
      FULFILLMENT_CREATE_MUTATION,
      {
        fulfillment: {
          lineItemsByFulfillmentOrder: fulfillable.map((entry) => ({
            fulfillmentOrderId: entry.fulfillmentOrderId,
            fulfillmentOrderLineItems: entry.lineItems.map((item) => ({
              id: item.id,
              quantity: item.quantity,
            })),
          })),
          notifyCustomer,
          ...(trackingInfo ? { trackingInfo } : {}),
        },
      },
    );

    const payload = created.fulfillmentCreate;
    const userErrors = formatUserErrors(payload?.userErrors);
    if (userErrors) return toolError(`Error: could not fulfill order - ${userErrors}`);

    if (!payload?.fulfillment) {
      return toolError("Error: could not fulfill order - Shopify did not return a fulfillment.");
    }

    const itemList = fulfillable
      .flatMap((entry) => entry.lineItems)
      .map((item) => `${item.quantity}x ${item.name}`)
      .join(", ");
    const trackingNote = trackingNumber
      ? ` Tracking ${trackingNumber}${trackingCompany ? ` via ${trackingCompany}` : ""}.`
      : "";
    const notifyNote = notifyCustomer
      ? " Shopify emailed the customer a shipping confirmation, so your reply should read as a follow-up, not as the first notice."
      : " Shopify did NOT email the customer, so your reply must be what tells them the order shipped.";

    return toolOk(
      `Marked order ${orderId} fulfilled (status ${payload.fulfillment.status ?? "SUCCESS"}) for: ${itemList}.${trackingNote}${notifyNote}`,
    );
  } catch (err) {
    if (mutationStarted && isAmbiguousShopifyMutationError(err)) {
      return toolUnknown(
        `Unknown: order ${input.order_id} may have been fulfilled at Shopify, but it could not be confirmed. Do not fulfill again, retry, or tell the customer the order shipped until the order is reviewed. ${formatShopifyToolError("fulfillment reconciliation failed", err)}`,
      );
    }
    return toolError(formatShopifyToolError("failed to fulfill order", err));
  }
}
