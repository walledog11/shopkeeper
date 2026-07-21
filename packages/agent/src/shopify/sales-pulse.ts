import { parseNextPageInfo, shopifyRest, type ShopifyContext } from "./client.js";
import type { ShopifyOrder } from "./types.js";

const ORDER_PAGE_LIMIT = 250;
const DEFAULT_MAX_PAGES = 5;
const DEFAULT_TIMEOUT_MS = 10_000;
const ORDER_FIELDS = "id,created_at,cancelled_at,current_total_price,total_price,currency,financial_status";

export interface OrderWindowSummary {
  orderCount: number;
  revenueTotal: number;
  currency: string | null;
}

export interface OrderWindowBounds {
  start: Date;
  end: Date;
}

function parseOrderRevenue(order: ShopifyOrder): number {
  const raw = order.current_total_price ?? order.total_price;
  if (raw == null) return 0;
  const parsed = Number.parseFloat(String(raw));
  return Number.isFinite(parsed) ? parsed : 0;
}

function shouldCountOrder(order: ShopifyOrder): boolean {
  if (order.cancelled_at) return false;
  if (order.financial_status === "voided") return false;
  return true;
}

export function summarizeOrders(orders: ShopifyOrder[]): OrderWindowSummary {
  let orderCount = 0;
  let revenueTotal = 0;
  let currency: string | null = null;

  for (const order of orders) {
    if (!shouldCountOrder(order)) continue;
    orderCount += 1;
    revenueTotal += parseOrderRevenue(order);
    if (!currency && order.currency) currency = order.currency;
  }

  return { orderCount, revenueTotal, currency };
}

export async function summarizeOrdersInWindow(
  ctx: ShopifyContext,
  window: OrderWindowBounds,
  options: { maxPages?: number; timeoutMs?: number } = {},
): Promise<OrderWindowSummary> {
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const collected: ShopifyOrder[] = [];

  let pageInfo: string | null = null;
  for (let page = 0; page < maxPages; page += 1) {
    const query = pageInfo
      ? { limit: ORDER_PAGE_LIMIT, page_info: pageInfo, fields: ORDER_FIELDS }
      : {
          status: "any",
          limit: ORDER_PAGE_LIMIT,
          fields: ORDER_FIELDS,
          created_at_min: window.start.toISOString(),
          created_at_max: window.end.toISOString(),
        };

    const { data, headers } = await shopifyRest<{ orders?: ShopifyOrder[] }>(ctx, "orders.json", {
      query,
      timeoutMs,
    });
    collected.push(...(data.orders ?? []));

    pageInfo = parseNextPageInfo(headers);
    if (!pageInfo) break;
  }

  return summarizeOrders(collected);
}

export function shiftWindowByDays(window: OrderWindowBounds, days: number): OrderWindowBounds {
  const deltaMs = days * 24 * 3_600_000;
  return {
    start: new Date(window.start.getTime() + deltaMs),
    end: new Date(window.end.getTime() + deltaMs),
  };
}

function formatMoney(amount: number, currency: string | null): string {
  const rounded = amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2);
  if (!currency || currency === "USD") return `$${rounded}`;
  return `${rounded} ${currency}`;
}

export function formatSalesPulseLine(
  current: OrderWindowSummary,
  prior?: OrderWindowSummary | null,
): string {
  const revenue = formatMoney(current.revenueTotal, current.currency);
  const orderLabel = `${current.orderCount} order${current.orderCount === 1 ? "" : "s"}`;
  let line = `Sales since your last briefing: ${orderLabel} · ${revenue}`;

  if (prior) {
    const priorRevenue = formatMoney(prior.revenueTotal, prior.currency ?? current.currency);
    const priorOrders = `${prior.orderCount} order${prior.orderCount === 1 ? "" : "s"}`;
    line += ` (vs ${priorOrders} · ${priorRevenue} last week)`;
  }

  return line;
}
