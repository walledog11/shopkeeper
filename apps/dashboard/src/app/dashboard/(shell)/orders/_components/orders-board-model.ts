export interface OrderRow {
  id: number
  name: string
  created_at: string
  financial_status: string
  fulfillment_status: string | null
  total_price: string
  customer: { id: number; name: string; email: string } | null
  line_items: { title: string; quantity: number; variant_title: string | null }[]
}

export type OrderColumnId = "needs_fulfillment" | "unpaid" | "fulfilled" | "refunded"

export interface OrderColumnConfig {
  id: OrderColumnId
  label: string
  description: string
  emptyTitle: string
  emptyBody: string
  /** Query string appended to /api/orders for this column's initial fetch. */
  query: string
}

export const ORDER_BOARD_COLUMNS: OrderColumnConfig[] = [
  {
    id: "needs_fulfillment",
    label: "Needs fulfillment",
    description: "Paid orders waiting to ship.",
    emptyTitle: "All shipped",
    emptyBody: "Paid orders that still need fulfillment will land here.",
    query: "fulfillment_status=unfulfilled",
  },
  {
    id: "unpaid",
    label: "Unpaid",
    description: "Payment pending or authorized.",
    emptyTitle: "Nothing unpaid",
    emptyBody: "Orders awaiting payment capture will appear here.",
    query: "financial_status=unpaid",
  },
  {
    id: "fulfilled",
    label: "Fulfilled",
    description: "Shipped and on the way.",
    emptyTitle: "Nothing shipped yet",
    emptyBody: "Fulfilled orders will appear here for reference.",
    query: "fulfillment_status=shipped",
  },
  {
    id: "refunded",
    label: "Refunded",
    description: "Refunded or voided orders.",
    emptyTitle: "No refunds",
    emptyBody: "Refunded and voided orders will appear here.",
    query: "financial_status=refunded",
  },
]

export const ORDER_COLUMN_IDS = ORDER_BOARD_COLUMNS.map(column => column.id)

const UNPAID_FINANCIAL = new Set(["pending", "authorized", "partially_paid"])
const CLOSED_FINANCIAL = new Set(["refunded", "voided"])
const OPEN_FULFILLMENT = new Set([null, "", "unfulfilled", "partial", "partially_fulfilled"])

/**
 * Assigns each order to exactly one board column. Column fetches overlap (an
 * unpaid order is also unfulfilled), so each column keeps only the orders whose
 * canonical classification matches it — the same dedupe approach the Review board
 * uses with classifyReviewItem.
 */
export function classifyOrder(order: OrderRow): OrderColumnId {
  if (CLOSED_FINANCIAL.has(order.financial_status)) return "refunded"
  if (UNPAID_FINANCIAL.has(order.financial_status)) return "unpaid"
  if (OPEN_FULFILLMENT.has(order.fulfillment_status)) return "needs_fulfillment"
  return "fulfilled"
}

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
