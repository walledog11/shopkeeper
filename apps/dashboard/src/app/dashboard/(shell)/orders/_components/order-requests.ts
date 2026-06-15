import { requestJson } from "@/lib/api/fetcher"
import type { OrderRow } from "./OrdersTable"

export interface OrdersResponse {
  orders: OrderRow[]
  nextPageInfo: string | null
  shop: string
}

export interface StartOrderThreadInput {
  shopifyCustomerId: string
  customerEmail: string
  customerName: string
  orderName: string
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string"
}

export async function fetchOrdersPage(pageInfo: string): Promise<OrdersResponse> {
  const fallback = "Unable to load more orders."
  const payload = await requestJson<Partial<OrdersResponse>>(
    `/api/orders?page_info=${encodeURIComponent(pageInfo)}`,
    {},
    fallback,
  )
  if (!Array.isArray(payload.orders) || !isNullableString(payload.nextPageInfo)) {
    throw new Error(fallback)
  }
  return {
    orders: payload.orders,
    nextPageInfo: payload.nextPageInfo,
    shop: typeof payload.shop === "string" ? payload.shop : "",
  }
}

export async function startOrderSupportThread(input: StartOrderThreadInput): Promise<string> {
  const fallback = "Failed to start support thread."
  const payload = await requestJson<{ threadId?: string }>(
    "/api/threads/shopify",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    fallback,
  )
  if (!payload.threadId) throw new Error(fallback)
  return payload.threadId
}
