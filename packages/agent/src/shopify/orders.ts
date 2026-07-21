import type { GetOrderByNameInput, GetShopifyOrdersInput } from "../tools/index.js";
import { toolError, toolNotFound, toolOk, type ToolResult } from "../tools/result.js";
import { formatShopifyToolError, shopifyRestJson, type ShopifyContext } from "./client.js";
import { serializeOrder } from "./serializers.js";
import type { ShopifyFulfillment, ShopifyOrder } from "./types.js";
import { isUspsCarrier, readFulfillmentTrackingNumbers } from "./tracking.js";
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

export async function listRecentUnfulfilledOrderIds(
  ctx: ShopifyContext,
  limit = 10,
): Promise<string[]> {
  const data = await shopifyRestJson<{ orders?: { id: number }[] }>(ctx, "orders.json", {
    query: {
      status: "open",
      fulfillment_status: "unfulfilled",
      financial_status: "paid",
      limit,
      fields: "id",
    },
  });

  return (data.orders ?? []).map((order) => String(order.id));
}

export interface ShippedOrderShipment {
  orderId: string;
  customerShopifyId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  trackingNumber: string;
  trackingCompany: string | null;
}

type ShippedOrderRow = ShopifyOrder & { fulfillments?: ShopifyFulfillment[] };

function readCustomerName(order: ShippedOrderRow): string | null {
  const customer = order.customer as {
    id?: number | string;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
  } | null | undefined;
  if (!customer) return null;
  const name = [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim();
  return name || null;
}

function readCustomerEmail(order: ShippedOrderRow): string | null {
  const customer = order.customer as { email?: string | null } | null | undefined;
  const email = customer?.email?.trim();
  return email || null;
}

export function extractUspsShipmentsFromOrders(orders: ShippedOrderRow[]): ShippedOrderShipment[] {
  const shipments: ShippedOrderShipment[] = [];
  const seen = new Set<string>();

  for (const order of orders) {
    const orderId = String(order.id);
    const customerShopifyId = order.customer?.id != null ? String(order.customer.id) : null;
    const customerName = readCustomerName(order);

    for (const fulfillment of order.fulfillments ?? []) {
      if (!isUspsCarrier(fulfillment.tracking_company)) continue;
      for (const trackingNumber of readFulfillmentTrackingNumbers(fulfillment)) {
        const key = `${orderId}:${trackingNumber}`;
        if (seen.has(key)) continue;
        seen.add(key);
        shipments.push({
          orderId,
          customerShopifyId,
          customerName,
          customerEmail: readCustomerEmail(order),
          trackingNumber,
          trackingCompany: fulfillment.tracking_company ?? null,
        });
      }
    }
  }

  return shipments;
}

export async function listRecentShippedOrderShipments(
  ctx: ShopifyContext,
  limit = 25,
): Promise<ShippedOrderShipment[]> {
  const data = await shopifyRestJson<{ orders?: ShippedOrderRow[] }>(ctx, "orders.json", {
    query: {
      status: "any",
      fulfillment_status: "shipped",
      limit,
      fields: "id,customer,fulfillments",
    },
    timeoutMs: 10_000,
  });

  return extractUspsShipmentsFromOrders(data.orders ?? []);
}
