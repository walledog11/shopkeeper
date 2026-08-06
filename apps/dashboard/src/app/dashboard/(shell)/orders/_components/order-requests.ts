import { requestJson } from "@/lib/api/fetcher"
import type { BoardColumnId, OrderRow } from "./orders-board-model"

export interface OrdersResponse {
  orders: OrderRow[]
  nextPageInfo: string | null
  shop: string
}

export interface OrdersBoardColumnResponse {
  orders: OrderRow[]
  nextPageInfo: string | null
}

export interface OrdersBoardResponse {
  shop: string
  columns: Record<BoardColumnId, OrdersBoardColumnResponse>
}

export const ORDERS_BOARD_SWR_KEY = "/api/orders/board"

export interface StartOrderThreadInput {
  shopifyCustomerId: string
  customerEmail: string
  customerName: string
  orderName: string
}

export interface OrderAttentionFinding {
  id: string
  orderId: string | null
  orderName: string
  reason: string
  at: string
}

export interface OrderAttentionReturn {
  threadId: string
  customerName: string
  summary: string | null
  at: string
}

export interface OrderAttentionResponse {
  findings: OrderAttentionFinding[]
  returns: OrderAttentionReturn[]
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string"
}

export async function fetchOrdersBoard(): Promise<OrdersBoardResponse> {
  const fallback = "Unable to load orders."
  const payload = await requestJson<Partial<OrdersBoardResponse>>(
    ORDERS_BOARD_SWR_KEY,
    {},
    fallback,
  )
  if (
    typeof payload.shop !== "string"
    || !payload.columns
    || typeof payload.columns !== "object"
  ) {
    throw new Error(fallback)
  }
  for (const columnId of ["needs_fulfillment", "unpaid", "fulfilled"] as const) {
    const column = payload.columns[columnId]
    if (!column || !Array.isArray(column.orders) || !isNullableString(column.nextPageInfo)) {
      throw new Error(fallback)
    }
  }
  return payload as OrdersBoardResponse
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
