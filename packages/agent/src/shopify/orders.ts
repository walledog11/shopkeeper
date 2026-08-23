import type {
  GetOrderByNameInput,
  GetOrderFulfillmentStatusInput,
  GetShopifyOrdersInput,
} from "../tools/index.js";
import { toolError, toolNotFound, toolOk, type ToolResult } from "../tools/result.js";
import { formatShopifyToolError, shopifyRestJson, type ShopifyContext } from "./client.js";
import { serializeOrder } from "./serializers.js";
import type { ShopifyFulfillment, ShopifyOrder } from "./types.js";
import { readFulfillmentTrackingNumbers } from "./tracking.js";
import { optionalString, requireNonEmptyString, requireNumericId } from "./validation.js";

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

// The one order read an unverified stranger can reach, so it is built from the
// opposite direction to every other order tool: an explicit allowlist of
// non-identifying fields rather than serializeOrder, which carries the shipping
// address, line items and totals. Knowing an order number must not become a way
// to learn who placed it, what they bought, or where it is going. Tracking
// numbers are excluded for the same reason — carrier sites resolve them to a
// delivery address.
//
// Anyone who supplies an order number gets its shipping state, so this does
// confirm an order exists. That is the disclosure this tier trades for being
// able to answer "has it shipped" at all; the value is bounded to shipping
// state, and passing an email narrows rather than widens it.
export async function getOrderFulfillmentStatus(
  input: GetOrderFulfillmentStatusInput,
  ctx: ShopifyContext
): Promise<ToolResult> {
  try {
    const rawName = optionalString(input.order_number);
    const email = optionalString(input.email);
    if (!rawName && !email) {
      return toolError("Provide an order number, the email used at checkout, or both.");
    }

    const fields = "id,name,created_at,fulfillment_status,cancelled_at,fulfillments,email";
    const query = rawName
      ? { name: rawName.startsWith("#") ? rawName : `#${rawName}`, status: "any", limit: 1, fields }
      : { email, status: "any", limit: 1, fields };
    const data = await shopifyRestJson<{ orders?: (ShopifyOrder & OrderStatusExtras)[] }>(
      ctx,
      "orders.json",
      { query }
    );

    const order = (data.orders ?? [])[0];
    // One response for "no such order" and "that email is not the one on it", so
    // a mismatch never confirms the order exists to someone guessing numbers.
    const emailMatches = !rawName || !email
      || (order?.email ?? "").trim().toLowerCase() === email.trim().toLowerCase();
    if (!order || !emailMatches) {
      return toolNotFound(
        "No order matches those details. Ask them to double-check the order number and the email used at checkout."
      );
    }

    return toolOk(JSON.stringify({
      order: order.name ?? rawName ?? null,
      placed_on: order.created_at ?? null,
      shipping_status: describeShippingStatus(order),
      shipped_on: order.fulfillments?.find((f) => f.created_at)?.created_at ?? null,
    }));
  } catch (err) {
    return toolError(formatShopifyToolError("could not look up that order", err));
  }
}

interface OrderStatusExtras {
  email?: string | null;
  fulfillments?: ShopifyFulfillment[] | null;
}

function describeShippingStatus(order: ShopifyOrder & OrderStatusExtras): string {
  if (order.cancelled_at) return "cancelled";
  const delivered = order.fulfillments?.some((f) => f.shipment_status === "delivered");
  if (delivered) return "delivered";
  switch (order.fulfillment_status) {
    case "fulfilled":
      return "shipped";
    case "partial":
      return "partially_shipped";
    default:
      return "not_shipped_yet";
  }
}

export async function listRecentUnfulfilledOrderIds(
  ctx: ShopifyContext,
  limit = 10,
  createdSince?: Date,
): Promise<string[]> {
  const data = await shopifyRestJson<{ orders?: { id: number }[] }>(ctx, "orders.json", {
    query: {
      status: "open",
      fulfillment_status: "unfulfilled",
      financial_status: "paid",
      limit,
      fields: "id",
      ...(createdSince ? { created_at_min: createdSince.toISOString() } : {}),
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

// Every shipment on a recently shipped order, whatever carrier moved it. This
// used to filter to USPS because USPS was the only carrier the monitor could
// look up; with that client gone the filter would only narrow what the next
// provider is handed.
export function extractShipmentsFromOrders(orders: ShippedOrderRow[]): ShippedOrderShipment[] {
  const shipments: ShippedOrderShipment[] = [];
  const seen = new Set<string>();

  for (const order of orders) {
    const orderId = String(order.id);
    const customerShopifyId = order.customer?.id != null ? String(order.customer.id) : null;
    const customerName = readCustomerName(order);

    for (const fulfillment of order.fulfillments ?? []) {
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

  return extractShipmentsFromOrders(data.orders ?? []);
}
