import type { ShopifyOrderSummary } from "./agent-context.js";

export const ORDER_REFERENCE_RE = /(?:#?[A-Z]{1,4}\d{3,}|\border\s*#?\s*\d{4,}\b)/i;

export function normalizeOrderName(name: string): string {
  const withoutPrefix = name.trim().replace(/^#/, "");
  return `#${withoutPrefix}`.toUpperCase();
}

export function referencedOrderName(text: string): string | null {
  const match = text.match(ORDER_REFERENCE_RE);
  if (!match) return null;

  const raw = match[0];
  const orderNumberMatch = raw.match(/\border\s*#?\s*(\d+)/i);
  return normalizeOrderName(orderNumberMatch?.[1] ?? raw);
}

export function findOrderByName(
  orders: readonly ShopifyOrderSummary[],
  orderName: string,
): ShopifyOrderSummary | null {
  const target = normalizeOrderName(orderName);
  return orders.find((order) => normalizeOrderName(order.name) === target) ?? null;
}

export function findReferencedOrder(
  orders: readonly ShopifyOrderSummary[],
  text: string,
): ShopifyOrderSummary | null {
  const reference = referencedOrderName(text);
  return reference ? findOrderByName(orders, reference) : null;
}
