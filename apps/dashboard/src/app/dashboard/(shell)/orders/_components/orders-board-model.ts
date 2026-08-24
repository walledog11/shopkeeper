import type { OrderRow } from "@/lib/orders/order-contract"

export { classifyOrder } from "@/lib/orders/order-contract"
export type { OrderRow } from "@/lib/orders/order-contract"

export type PillTone = "positive" | "warn" | "muted" | "info"

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
