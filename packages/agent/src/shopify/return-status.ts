import { formatShopifyToolError, shopifyGraphql, type ShopifyContext } from "./client.js";

export type ReturnDeliveryState = "pending" | "in_transit" | "delivered" | "unknown";

export interface MonitoredReturnStatus {
  returnId: string;
  returnName: string | null;
  returnStatus: string | null;
  deliveryState: ReturnDeliveryState;
}

interface OrderReturnsData {
  order?: {
    returns?: {
      edges: Array<{
        node: {
          id: string;
          name?: string | null;
          status?: string | null;
          reverseFulfillmentOrders?: {
            edges: Array<{
              node: {
                status?: string | null;
                reverseDeliveries?: {
                  edges: Array<{
                    node: {
                      status?: string | null;
                    };
                  }>;
                } | null;
              };
            }>;
          } | null;
        };
      }>;
    } | null;
  } | null;
}

function classifyDeliveryState(returnNode: {
  reverseFulfillmentOrders?: {
    edges: Array<{
      node: {
        reverseDeliveries?: {
          edges: Array<{
            node: {
              status?: string | null;
            };
          }>;
        } | null;
      };
    }>;
  } | null;
}): ReturnDeliveryState {
  const deliveries = (returnNode.reverseFulfillmentOrders?.edges ?? []).flatMap((edge) => (
    edge.node.reverseDeliveries?.edges ?? []
  ));

  if (deliveries.some((edge) => edge.node.status === "DELIVERED")) {
    return "delivered";
  }
  if (deliveries.some((edge) => edge.node.status === "IN_TRANSIT" || edge.node.status === "OUT_FOR_DELIVERY")) {
    return "in_transit";
  }
  if (deliveries.length > 0) {
    return "pending";
  }
  return "unknown";
}

export async function fetchOrderReturnStatuses(
  ctx: ShopifyContext,
  orderId: string,
  options: { timeoutMs?: number } = {},
): Promise<MonitoredReturnStatus[]> {
  const orderGid = `gid://shopify/Order/${orderId}`;
  const data = await shopifyGraphql<OrderReturnsData>(ctx, `
    query OrderReturnStatuses($id: ID!) {
      order(id: $id) {
        returns(first: 10) {
          edges {
            node {
              id
              name
              status
              reverseFulfillmentOrders(first: 5) {
                edges {
                  node {
                    status
                    reverseDeliveries(first: 5) {
                      edges {
                        node {
                          status
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `, { id: orderGid }, options);

  return (data.order?.returns?.edges ?? []).map((edge) => ({
    returnId: edge.node.id,
    returnName: edge.node.name ?? null,
    returnStatus: edge.node.status ?? null,
    deliveryState: classifyDeliveryState(edge.node),
  }));
}

export async function safeFetchOrderReturnStatuses(
  ctx: ShopifyContext,
  orderId: string,
): Promise<MonitoredReturnStatus[] | null> {
  try {
    return await fetchOrderReturnStatuses(ctx, orderId, { timeoutMs: 10_000 });
  } catch (error) {
    return null;
  }
}

export function formatReturnArrivedNotification(input: {
  customerName: string | null;
  orderId: string;
  returnName: string | null;
  refundAmount?: string | null;
}): string {
  const customer = input.customerName?.trim() || "A customer";
  const returnLabel = input.returnName?.trim() || `order ${input.orderId}`;
  const refundHint = input.refundAmount
    ? ` Ready to approve the ${input.refundAmount} refund when you are.`
    : " Ready for you to approve the refund when you are.";
  return `${customer}'s return ${returnLabel} arrived back.${refundHint} Reply yes on the dashboard plan when it lands, or text me to review it.`;
}
