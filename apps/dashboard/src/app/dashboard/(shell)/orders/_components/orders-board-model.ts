import type { OrderBoardColumnId, OrderRow } from "@/lib/orders/order-contract"

export { classifyOrder } from "@/lib/orders/order-contract"
export type { OrderRow } from "@/lib/orders/order-contract"
export type BoardColumnId = OrderBoardColumnId
export type OrderColumnId = OrderBoardColumnId

export interface OrderColumnState {
  entries: OrderRow[]
  error: unknown
  hasMore: boolean
  isLoading: boolean
  isLoadingMore: boolean
  loadMoreError: string | null
  onLoadMore: () => void
  onRetry: () => void
}

export type OrdersBoardState = Record<BoardColumnId, OrderColumnState>

export interface OrderColumnConfig {
  id: BoardColumnId
  label: string
  emptyTitle: string
  emptyBody: string
}

export const ORDER_BOARD_COLUMNS: OrderColumnConfig[] = [
  {
    id: "needs_fulfillment",
    label: "Unfulfilled",
    emptyTitle: "All shipped",
    emptyBody: "Paid orders that still need fulfillment will land here.",
  },
  {
    id: "unpaid",
    label: "Unpaid",
    emptyTitle: "Nothing unpaid",
    emptyBody: "Orders awaiting payment capture will appear here.",
  },
  {
    id: "fulfilled",
    label: "Fulfilled",
    emptyTitle: "Nothing shipped yet",
    emptyBody: "Fulfilled orders will appear here for reference.",
  },
]

// ── Status pills ────────────────────────────────────────────────────────────────

export type PillTone = "positive" | "warn" | "muted" | "info"

export const PILL_TEXT: Record<PillTone, string> = {
  positive: "text-emerald-600",
  warn: "text-amber-600",
  muted: "text-muted-foreground",
  info: "text-blue-600",
}

export const PILL_DOT: Record<PillTone, string> = {
  positive: "bg-emerald-500",
  warn: "bg-amber-500",
  muted: "bg-muted-foreground/40",
  info: "bg-blue-500",
}

export function financialPill(status: string): { label: string; tone: PillTone } {
  switch (status) {
    case "paid":               return { label: "Paid", tone: "positive" }
    case "pending":            return { label: "Payment pending", tone: "warn" }
    case "authorized":         return { label: "Authorized", tone: "warn" }
    case "partially_paid":     return { label: "Partially paid", tone: "warn" }
    case "refunded":           return { label: "Refunded", tone: "muted" }
    case "partially_refunded": return { label: "Partial refund", tone: "info" }
    case "voided":             return { label: "Voided", tone: "muted" }
    default:                   return { label: status, tone: "muted" }
  }
}

export function fulfillmentPill(status: string | null): { label: string; tone: PillTone } {
  switch (status) {
    case "fulfilled":  return { label: "Fulfilled", tone: "positive" }
    case "partial":    return { label: "Partially fulfilled", tone: "warn" }
    case "restocked":  return { label: "Restocked", tone: "muted" }
    default:           return { label: "Unfulfilled", tone: "warn" }
  }
}

export function lineItemsSummary(items: OrderRow["line_items"]): string | null {
  if (items.length === 0) return null
  const shown = items.slice(0, 2).map(li => `${li.quantity}× ${li.title}`)
  const remaining = items.length - 2
  return remaining > 0 ? `${shown.join(" · ")} · +${remaining} more` : shown.join(" · ")
}

export function orderItemCount(order: OrderRow): number {
  return order.line_items.reduce((sum, li) => sum + li.quantity, 0)
}

export function dedupeOrders(orders: readonly OrderRow[]): OrderRow[] {
  const seen = new Set<number>()
  return orders.filter((order) => {
    if (seen.has(order.id)) return false
    seen.add(order.id)
    return true
  })
}
