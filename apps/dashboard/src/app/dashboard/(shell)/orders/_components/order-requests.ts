import { requestJson } from "@/lib/api/fetcher"
import {
  isOrdersBoardResponse,
  isOrdersPageResponse,
  type OrderBoardColumnId,
  type OrdersBoardResponse,
  type OrdersPageResponse,
} from "@/lib/orders/order-contract"

export type { OrdersBoardResponse, OrdersPageResponse as OrdersResponse }

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

export async function fetchOrdersBoard(): Promise<OrdersBoardResponse> {
  const fallback = "Unable to load orders."
  const payload = await requestJson<unknown>(
    ORDERS_BOARD_SWR_KEY,
    {},
    fallback,
  )
  if (!isOrdersBoardResponse(payload)) throw new Error(fallback)
  return payload
}

export async function fetchOrdersPage(pageInfo: string): Promise<OrdersPageResponse> {
  const fallback = "Unable to load more orders."
  const payload = await requestJson<unknown>(
    `/api/orders?page_info=${encodeURIComponent(pageInfo)}`,
    {},
    fallback,
  )
  if (!isOrdersPageResponse(payload)) throw new Error(fallback)
  return payload
}

export async function fetchOrdersSearch(url: string): Promise<OrdersPageResponse> {
  const fallback = "Unable to search orders."
  const payload = await requestJson<unknown>(url, {}, fallback)
  if (!isOrdersPageResponse(payload)) throw new Error(fallback)
  return payload
}

export async function fetchOrdersColumnPage(
  columnId: OrderBoardColumnId,
  pageInfo: string,
): Promise<OrdersPageResponse> {
  const fallback = "Unable to load more orders."
  const payload = await requestJson<unknown>(
    `/api/orders/board/${columnId}?page_info=${encodeURIComponent(pageInfo)}`,
    {},
    fallback,
  )
  if (!isOrdersPageResponse(payload)) throw new Error(fallback)
  return payload
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
