import { NextResponse } from "next/server"
import { db } from "@shopkeeper/db"
import { NotFoundError } from "@/lib/api/errors"
import { parseNextPageInfo, shopifyRest } from "@shopkeeper/agent/shopify"
import {
  isShopifyIntegrationOperational,
  shopifyRouteErrorResponse,
} from "@/lib/server/shopify-integration"
import { normalizeCurrencyCode } from "@/lib/format/currency"
import {
  classifyOrder,
  type OrderBoardColumnId,
  type OrderRow,
  type OrdersPageResponse,
} from "@/lib/orders/order-contract"

export const ORDER_FIELDS =
  "id,name,created_at,financial_status,fulfillment_status,total_price,current_total_price,currency,customer,line_items"

export interface ShopifyOrderRaw {
  id: number
  name: string
  created_at: string
  financial_status: string
  fulfillment_status: string | null
  total_price: string
  current_total_price: string
  currency: string | null
  customer: {
    id: number
    first_name: string | null
    last_name: string | null
    email: string | null
  } | null
  line_items: {
    title: string
    quantity: number
    current_quantity: number
    variant_title: string | null
  }[]
}

export interface ShopifyOrdersQuery {
  fulfillmentStatus?: string
  financialStatus?: string
  q?: string
  pageInfo?: string
  limit?: number
}

export function normalizeOrder(order: ShopifyOrderRaw): OrderRow {
  const customerName = order.customer
    ? [order.customer.first_name, order.customer.last_name].filter(Boolean).join(" ") || null
    : null
  return {
    id: order.id,
    name: order.name,
    created_at: order.created_at,
    financial_status: order.financial_status,
    fulfillment_status: order.fulfillment_status,
    total_price: order.current_total_price ?? order.total_price,
    currency: normalizeCurrencyCode(order.currency),
    customer: order.customer
      ? {
          id: order.customer.id,
          name: customerName,
          email: order.customer.email || null,
        }
      : null,
    line_items: order.line_items.flatMap(lineItem => lineItem.current_quantity > 0
      ? [{
          title: lineItem.title,
          quantity: lineItem.current_quantity,
          variant_title: lineItem.variant_title || null,
        }]
      : []),
  }
}

type ShopifyIntegration = {
  id: string
  organizationId: string
  externalAccountId: string
  accessToken: string
}

export async function getOperationalShopifyIntegration(organizationId: string): Promise<ShopifyIntegration> {
  const integration = await db.integration.findFirst({
    where: { organizationId, platform: "shopify", accessToken: { not: null } },
    orderBy: { createdAt: "desc" },
  })

  if (!integration?.accessToken || !isShopifyIntegrationOperational(integration)) {
    throw new NotFoundError("no_integration")
  }

  return {
    id: integration.id,
    organizationId: integration.organizationId,
    externalAccountId: integration.externalAccountId,
    accessToken: integration.accessToken,
  }
}

function buildShopifyOrdersQuery(query: ShopifyOrdersQuery): Record<string, string | number> {
  const limit = Math.min(query.limit ?? 25, 50)
  const fulfillmentStatus = query.fulfillmentStatus ?? "any"
  const financialStatus = query.financialStatus ?? "any"
  const q = query.q ?? ""
  const pageInfo = query.pageInfo ?? ""

  if (pageInfo) {
    return { page_info: pageInfo, limit, fields: ORDER_FIELDS }
  }
  if (q) {
    return q.includes("@")
      ? { status: "any", limit, fields: ORDER_FIELDS, email: q }
      : { status: "any", limit, fields: ORDER_FIELDS, name: q.startsWith("#") ? q : `#${q}` }
  }
  return {
    status: "any",
    limit,
    fields: ORDER_FIELDS,
    ...(fulfillmentStatus !== "any" ? { fulfillment_status: fulfillmentStatus } : {}),
    ...(financialStatus !== "any" ? { financial_status: financialStatus } : {}),
  }
}

export async function listShopifyOrders(
  integration: ShopifyIntegration,
  query: ShopifyOrdersQuery,
): Promise<OrdersPageResponse> {
  const shop = integration.externalAccountId
  const ctx = { shop, accessToken: integration.accessToken }
  const shopifyQuery = buildShopifyOrdersQuery(query)

  const { data, headers } = await shopifyRest<{ orders?: ShopifyOrderRaw[] }>(
    ctx,
    "orders.json",
    { query: shopifyQuery, maxRetries: 0 },
  )

  const orders = (data.orders ?? []).map(normalizeOrder)
  return {
    orders,
    nextPageInfo: parseNextPageInfo(headers),
    shop,
  }
}

const BOARD_PROVIDER_QUERY: Record<OrderBoardColumnId, ShopifyOrdersQuery> = {
  needs_fulfillment: { fulfillmentStatus: "unfulfilled" },
  unpaid: { financialStatus: "unpaid" },
  fulfilled: { fulfillmentStatus: "shipped" },
}

const MAX_BOARD_PROVIDER_PAGES = 5

/**
 * Shopify's status filters overlap, so skip provider pages until a page has
 * rows belonging to the requested canonical column. A bounded empty page may
 * still carry a cursor; callers must expose that cursor rather than treating
 * the column as exhausted.
 */
export async function listCanonicalOrderColumnPage(
  integration: ShopifyIntegration,
  columnId: OrderBoardColumnId,
  options: { pageInfo?: string | null; limit?: number } = {},
): Promise<OrdersPageResponse> {
  let pageInfo = options.pageInfo ?? null
  let latestPage: OrdersPageResponse | null = null

  for (let scanned = 0; scanned < MAX_BOARD_PROVIDER_PAGES; scanned += 1) {
    const page = await listShopifyOrders(integration, {
      ...(pageInfo ? { pageInfo } : BOARD_PROVIDER_QUERY[columnId]),
      limit: options.limit,
    })
    latestPage = page
    const orders = page.orders.filter(order => classifyOrder(order) === columnId)
    if (orders.length > 0 || !page.nextPageInfo) return { ...page, orders }
    pageInfo = page.nextPageInfo
  }

  return latestPage
    ? { ...latestPage, orders: [] }
    : { orders: [], nextPageInfo: null, shop: integration.externalAccountId }
}

export async function listShopifyOrdersForOrg(
  organizationId: string,
  query: ShopifyOrdersQuery,
): Promise<OrdersPageResponse> {
  const integration = await getOperationalShopifyIntegration(organizationId)
  return listShopifyOrders(integration, query)
}

export async function shopifyOrdersErrorResponse(
  err: unknown,
  integration: ShopifyIntegration,
): Promise<NextResponse | null> {
  return shopifyRouteErrorResponse(err, integration, integration.organizationId)
}
