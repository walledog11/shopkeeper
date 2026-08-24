import type { TicketCardMetaStatusTone } from "@/app/dashboard/_components/home/needs-you-card-ui"
import type { OrderRow } from "@/lib/orders/order-contract"
import { financialPill, fulfillmentPill } from "./orders-board-model"

export function customerLabel(order: OrderRow): string {
  return order.customer?.name || order.customer?.email || "Guest checkout"
}

export function shopifyAdminOrderHref(
  shop: string | null | undefined,
  orderId: string | number | null | undefined,
): string | null {
  if (!shop || orderId == null || orderId === "") return null
  return `https://${shop}/admin/orders/${orderId}`
}

export function orderStatusMeta(order: OrderRow): { label: string; tone: TicketCardMetaStatusTone } {
  const financial = financialPill(order.financial_status)
  if (financial.tone === "warn") {
    return { label: financial.label, tone: "caution" }
  }
  if (financial.tone === "info") {
    return { label: financial.label, tone: "neutral" }
  }

  const fulfillment = fulfillmentPill(order.fulfillment_status)
  if (fulfillment.tone === "warn") return { label: fulfillment.label, tone: "caution" }
  if (fulfillment.tone === "positive") return { label: fulfillment.label, tone: "neutral" }
  return { label: fulfillment.label, tone: "neutral" }
}

export function matchOrderFromSearch(orders: readonly OrderRow[], orderId: string | null): OrderRow | null {
  if (orderId) {
    const exact = orders.find(order => String(order.id) === orderId)
    if (exact) return exact
  }
  return orders[0] ?? null
}
