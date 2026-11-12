import { NextResponse } from "next/server"
import { db } from "@shopkeeper/db"
import { BadRequestError, NotFoundError } from "@/lib/api/errors"
import { findShopifyOrders, type OrderSearch, type ShopifyContext } from "@shopkeeper/agent/shopify"
import { SHOPIFY_ACCESS_SELECT, shopifyContextFor } from "@shopkeeper/agent/shopify/access"
import { shopifyRouteErrorResponse } from "@/lib/server/shopify-integration"
import { decodeShopifyPageToken, encodeShopifyPageToken } from "@/lib/server/shopify-page-token"
import { normalizeCurrencyCode } from "@shopkeeper/agent/money"
import {
  type OrderRow,
  type OrdersPageResponse,
} from "@/lib/orders/order-contract"

type ShopifyOrder = Awaited<ReturnType<typeof findShopifyOrders>>["orders"][number]

export function normalizeOrder(order: ShopifyOrder): OrderRow {
  const customerName = order.customer
    ? [order.customer.first_name, order.customer.last_name].filter(Boolean).join(" ") || null
    : null
  return {
    id: Number(order.id),
    name: order.name ?? "",
    created_at: order.created_at ?? "",
    financial_status: order.financial_status ?? "",
    fulfillment_status: order.fulfillment_status ?? null,
    total_price: order.current_total_price ?? order.total_price ?? "0",
    currency: normalizeCurrencyCode(order.currency),
    customer: order.customer
      ? {
          id: Number(order.customer.id),
          name: customerName,
          email: order.customer.email || null,
        }
      : null,
    line_items: (order.line_items ?? []).flatMap(lineItem => (lineItem.current_quantity ?? lineItem.quantity) > 0
      ? [{
          title: lineItem.title,
          quantity: lineItem.current_quantity ?? lineItem.quantity,
          variant_title: lineItem.variant_title || null,
        }]
      : []),
  }
}

type ShopifyIntegration = {
  id: string
  organizationId: string
  shopify: ShopifyContext
}

export async function getOperationalShopifyIntegration(organizationId: string): Promise<ShopifyIntegration> {
  const integration = await db.integration.findFirst({
    where: { organizationId, platform: "shopify", accessToken: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { ...SHOPIFY_ACCESS_SELECT, organizationId: true },
  })
  const shopify = integration ? await shopifyContextFor(integration) : null
  if (!integration || !shopify) {
    throw new NotFoundError("no_integration")
  }

  return { id: integration.id, organizationId: integration.organizationId, shopify }
}

// An order number or a customer email, as the search box takes it.
function orderSearch(q: string): OrderSearch {
  if (!q) return {}
  return q.includes("@") ? { email: q } : { name: q }
}

export async function listShopifyOrders(
  integration: ShopifyIntegration,
  query: { q?: string; pageInfo?: string; limit?: number },
): Promise<OrdersPageResponse> {
  const ctx = integration.shopify
  const page = query.pageInfo ? decodeShopifyPageToken(query.pageInfo) : null
  if (query.pageInfo && !page) throw new BadRequestError("page_info is not a cursor this API issued")
  const q = page ? page.query : (query.q ?? "")

  const result = await findShopifyOrders(ctx, orderSearch(q), {
    first: Math.min(query.limit ?? 25, 50),
    after: page?.after ?? null,
    lineItems: 10,
    maxRetries: 0,
  })

  return {
    orders: result.orders.map(normalizeOrder),
    nextPageInfo: result.nextCursor ? encodeShopifyPageToken({ query: q, after: result.nextCursor }) : null,
    shop: ctx.shop,
  }
}

export async function shopifyOrdersErrorResponse(
  err: unknown,
  integration: ShopifyIntegration,
): Promise<NextResponse | null> {
  return shopifyRouteErrorResponse(err, integration, integration.organizationId)
}
