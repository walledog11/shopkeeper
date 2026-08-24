import { requestJson } from "@/lib/api/fetcher"
import {
  isOrdersPageResponse,
  type OrdersPageResponse,
} from "@/lib/orders/order-contract"

export type { OrdersPageResponse as OrdersResponse }

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
