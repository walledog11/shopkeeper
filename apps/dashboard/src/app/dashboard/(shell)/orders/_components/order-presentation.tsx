import type { ComponentType } from "react"
import { CreditCard, Package, Truck } from "lucide-react"
import { classifyOrder, type OrderBoardColumnId, type OrderRow } from "@/lib/orders/order-contract"
import { PILL_DOT, PILL_TEXT, type PillTone } from "./orders-board-model"

export const ORDER_COLUMN_ICON: Record<OrderBoardColumnId, ComponentType<{ className?: string }>> = {
  needs_fulfillment: Package,
  unpaid: CreditCard,
  fulfilled: Truck,
}

export const ORDER_COLUMN_TONE: Record<OrderBoardColumnId, { icon: string; border: string }> = {
  needs_fulfillment: { icon: "border-amber-500/20 bg-amber-500/10 text-amber-700", border: "hover:border-amber-500/25" },
  unpaid: { icon: "border-rose-500/20 bg-rose-500/10 text-rose-700", border: "hover:border-rose-500/25" },
  fulfilled: { icon: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700", border: "hover:border-emerald-500/25" },
}

export function visibleOrderColumn(order: OrderRow): OrderBoardColumnId {
  const classification = classifyOrder(order)
  return classification === "excluded" ? "fulfilled" : classification
}

export function customerLabel(order: OrderRow): string {
  return order.customer?.name || order.customer?.email || "Guest checkout"
}

export function StatusPill({ label, tone }: { label: string; tone: PillTone }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${PILL_TEXT[tone]}`}>
      <span className={`size-1.5 shrink-0 rounded-full ${PILL_DOT[tone]}`} />
      {label}
    </span>
  )
}
