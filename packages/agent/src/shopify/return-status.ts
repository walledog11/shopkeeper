import { shopifyGraphql, type ShopifyContext } from "./client.js";

export interface MonitoredReturnStatus {
  returnId: string;
  returnName: string | null;
  returnStatus: string | null;
}

interface OrderReturnsData {
  order?: {
    returns?: {
      edges: Array<{
        node: {
          id: string;
          name?: string | null;
          status?: string | null;
        };
      }>;
    } | null;
  } | null;
}

// Shopify exposes the return lifecycle state, but no reverse-shipment transit
// state. The monitor therefore reacts to CLOSED and describes that exact fact;
// it must never claim a carrier-confirmed warehouse arrival.
export const ORDER_RETURN_STATUSES_QUERY = `query OrderReturnStatuses($id: ID!) {
  order(id: $id) {
    returns(first: 10) {
      edges {
        node {
          id
          name
          status
        }
      }
    }
  }
}`;

export async function fetchOrderReturnStatuses(
  ctx: ShopifyContext,
  orderId: string,
  options: { timeoutMs?: number } = {},
): Promise<MonitoredReturnStatus[]> {
  const orderGid = `gid://shopify/Order/${orderId}`;
  const data = await shopifyGraphql<OrderReturnsData>(ctx, ORDER_RETURN_STATUSES_QUERY, { id: orderGid }, options);

  return (data.order?.returns?.edges ?? []).map((edge) => ({
    returnId: edge.node.id,
    returnName: edge.node.name ?? null,
    returnStatus: edge.node.status ?? null,
  }));
}

export async function safeFetchOrderReturnStatuses(
  ctx: ShopifyContext,
  orderId: string,
): Promise<MonitoredReturnStatus[] | null> {
  try {
    return await fetchOrderReturnStatuses(ctx, orderId, { timeoutMs: 10_000 });
  } catch {
    return null;
  }
}

export function formatReturnClosedNotification(input: {
  customerName: string | null;
  orderId: string;
  returnName: string | null;
  refundAmount?: string | null;
}): string {
  const customer = input.customerName?.trim() || "A customer";
  const returnLabel = input.returnName?.trim() || `order ${input.orderId}`;
  const reviewHint = input.refundAmount
    ? ` Review whether the ${input.refundAmount} refund is still due.`
    : " Review whether any refund or exchange action is still due.";
  return `${customer}'s return ${returnLabel} is marked closed in Shopify.${reviewHint} Verify that the returned goods were received before approving the dashboard plan, or text me to review it.`;
}
