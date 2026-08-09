"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Clock3, ExternalLink, Loader2, MessageSquarePlus, User } from "lucide-react"
import { DashboardDetailDialog } from "@/app/dashboard/_components/board/DashboardDetailDialog"
import { errorMessageFromUnknown } from "@/lib/api/fetcher"
import { formatCurrency } from "@/lib/format/currency"
import { formatShortDate } from "@/lib/format/date"
import type { OrderRow } from "@/lib/orders/order-contract"
import { financialPill, fulfillmentPill, orderItemCount } from "./orders-board-model"
import { startOrderSupportThread } from "./order-requests"
import {
  ORDER_COLUMN_ICON,
  ORDER_COLUMN_TONE,
  StatusPill,
  visibleOrderColumn,
} from "./order-presentation"

function NewTicketButton({ order }: { order: OrderRow }) {
  const { push } = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const customer = order.customer

  if (!customer?.email) return null
  const customerEmail = customer.email

  const startThread = async () => {
    setLoading(true)
    setError(null)
    try {
      const threadId = await startOrderSupportThread({
        shopifyCustomerId: String(customer.id),
        customerEmail,
        customerName: customer.name || customerEmail,
        orderName: order.name,
      })
      push(`/dashboard/tickets?thread=${threadId}`)
    } catch (requestError) {
      setError(errorMessageFromUnknown(requestError, "Failed to start support thread."))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={startThread}
        disabled={loading}
        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary px-3 text-xs font-medium text-secondary-foreground transition-colors hover:bg-accent disabled:opacity-40"
      >
        {loading ? <Loader2 className="size-3 animate-spin" /> : <MessageSquarePlus className="size-3.5" />}
        New ticket
      </button>
      {error ? <p className="text-xs text-red-500" aria-live="polite">{error}</p> : null}
    </div>
  )
}

function OrderDetail({ order, shop, onClose }: { order: OrderRow; shop: string | null; onClose: () => void }) {
  const columnId = visibleOrderColumn(order)
  const Icon = ORDER_COLUMN_ICON[columnId]
  const tone = ORDER_COLUMN_TONE[columnId]
  const financial = financialPill(order.financial_status)
  const fulfillment = fulfillmentPill(order.fulfillment_status)
  const itemCount = orderItemCount(order)
  const adminHref = shop ? `https://${shop}/admin/orders/${order.id}` : null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border px-5 py-5">
        <div className="flex items-start gap-3">
          <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg border ${tone.icon}`}><Icon className="size-4.5" /></div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold leading-tight text-foreground">{order.name}</h2>
              <StatusPill label={financial.label} tone={financial.tone} />
              <StatusPill label={fulfillment.label} tone={fulfillment.tone} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-faint">
              <span className="inline-flex items-center gap-1.5"><Clock3 className="size-3" />{formatShortDate(order.created_at)}</span>
              {order.customer ? <span className="inline-flex items-center gap-1.5"><User className="size-3" />{order.customer.name || order.customer.email || "Guest"}</span> : null}
            </div>
          </div>
        </div>
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {order.customer ? (
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">Customer</h3>
            <div className="rounded-lg border border-border bg-foreground/[0.02] p-3">
              <p className="text-sm font-semibold text-strong">{order.customer.name || "—"}</p>
              <p className="text-sm text-muted-foreground">{order.customer.email || "No email provided"}</p>
            </div>
          </section>
        ) : null}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">Items · {itemCount}</h3>
          <div className="space-y-2">
            {order.line_items.length > 0 ? order.line_items.map((item, index) => (
              <div key={`${item.title}-${index}`} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-foreground/[0.02] p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-strong">{item.title}</p>
                  {item.variant_title ? <p className="text-xs text-muted-foreground">{item.variant_title}</p> : null}
                </div>
                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">×{item.quantity}</span>
              </div>
            )) : <p className="rounded-lg border border-border bg-foreground/[0.03] p-3 text-sm text-faint">No line items recorded.</p>}
          </div>
        </section>
        <section className="flex items-center justify-between rounded-lg border border-border bg-foreground/[0.02] px-3 py-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-faint">Total</span>
          <span className="text-base font-bold text-strong">{formatCurrency(order.total_price, order.currency)}</span>
        </section>
      </div>

      <div className="flex flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <NewTicketButton order={order} />
          {adminHref ? <a href={adminHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"><ExternalLink className="size-3.5" />View in Shopify</a> : null}
        </div>
        <button type="button" onClick={onClose} className="h-8 rounded-md border border-border px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground">Done</button>
      </div>
    </div>
  )
}

export function OrderDetailDialog({ order, shop, onClose }: { order: OrderRow | null; shop: string | null; onClose: () => void }) {
  return (
    <DashboardDetailDialog open={Boolean(order)} title="Order detail" maxWidthClassName="sm:max-w-2xl lg:max-w-3xl" onClose={onClose}>
      {order ? <OrderDetail order={order} shop={shop} onClose={onClose} /> : null}
    </DashboardDetailDialog>
  )
}
