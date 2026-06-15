"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, MessageSquarePlus } from "lucide-react"
import { cn } from "@/lib/ui/cn"
import { errorMessageFromUnknown } from "@/lib/api/fetcher"
import { formatShortDate } from "@/lib/format/date"
import { startOrderSupportThread } from "./order-requests"
import type { OrderRow } from "./OrdersTable"

interface Props {
  orders: OrderRow[]
  hasMore: boolean
  isLoadingMore: boolean
  loadMoreError: string | null
  onLoadMore: () => void
  emptyTitle?: string
  emptyDescription?: string
}

const GRID_CLASS = "grid gap-4 grid-cols-[repeat(auto-fill,minmax(320px,1fr))]"

// ── Status pills ────────────────────────────────────────────────────────────────

type Tone = "positive" | "warn" | "muted" | "info"

const TONE_TEXT: Record<Tone, string> = {
  positive: "text-emerald-600",
  warn: "text-amber-600",
  muted: "text-muted-foreground",
  info: "text-blue-600",
}

const TONE_DOT: Record<Tone, string> = {
  positive: "bg-emerald-500",
  warn: "bg-amber-500",
  muted: "bg-muted-foreground/40",
  info: "bg-blue-500",
}

function StatusPill({ label, tone }: { label: string; tone: Tone }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", TONE_TEXT[tone])}>
      <span className={cn("size-1.5 rounded-full shrink-0", TONE_DOT[tone])} />
      {label}
    </span>
  )
}

function financialPill(status: string): { label: string; tone: Tone } {
  switch (status) {
    case "paid":               return { label: "Paid", tone: "positive" }
    case "pending":            return { label: "Payment pending", tone: "warn" }
    case "refunded":           return { label: "Refunded", tone: "muted" }
    case "partially_refunded": return { label: "Partial refund", tone: "info" }
    case "voided":             return { label: "Voided", tone: "muted" }
    default:                   return { label: status, tone: "muted" }
  }
}

function fulfillmentPill(status: string | null): { label: string; tone: Tone } {
  switch (status) {
    case "fulfilled":  return { label: "Fulfilled", tone: "positive" }
    case "partial":    return { label: "Partially fulfilled", tone: "warn" }
    case "restocked":  return { label: "Restocked", tone: "muted" }
    default:           return { label: "Unfulfilled", tone: "warn" }
  }
}

function lineItemsSummary(items: OrderRow["line_items"]): string | null {
  if (items.length === 0) return null
  const shown = items.slice(0, 2).map(li => `${li.quantity}× ${li.title}`)
  const remaining = items.length - 2
  return remaining > 0 ? `${shown.join(" · ")} · +${remaining} more` : shown.join(" · ")
}

// ── New ticket button ───────────────────────────────────────────────────────────

function NewTicketButton({ order }: { order: OrderRow }) {
  const { push } = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!order.customer) return null

  const startSupportThread = async () => {
    if (!order.customer) return
    setLoading(true)
    setError(null)
    try {
      const threadId = await startOrderSupportThread({
        shopifyCustomerId: String(order.customer.id),
        customerEmail: order.customer.email,
        customerName: order.customer.name,
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
    <div className="flex flex-col items-end gap-1">
      <button type="button"
        onClick={startSupportThread}
        disabled={loading}
        title="Open a support ticket for this order"
        className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg border border-border bg-secondary text-secondary-foreground text-xs font-medium hover:bg-accent transition-colors disabled:opacity-40 shrink-0"
      >
        {loading ? <Loader2 className="size-3 animate-spin" /> : <MessageSquarePlus className="size-3.5" />}
        New ticket
      </button>
      {error && <p className="max-w-32 text-right text-xs text-red-500" aria-live="polite">{error}</p>}
    </div>
  )
}

// ── Card ────────────────────────────────────────────────────────────────────────

function OrderCard({ order }: { order: OrderRow }) {
  const fn = financialPill(order.financial_status)
  const ff = fulfillmentPill(order.fulfillment_status)
  const summary = lineItemsSummary(order.line_items)
  const itemCount = order.line_items.reduce((sum, li) => sum + li.quantity, 0)

  return (
    <div className="group rounded-2xl bg-card border border-border px-5 pt-5 pb-4 flex flex-col transition-all duration-200 hover:border-border/80 hover:shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[15px] font-bold text-card-foreground">{order.name}</span>
        <span className="text-xs text-muted-foreground shrink-0">{formatShortDate(order.created_at)}</span>
      </div>

      <div className="mt-3 flex flex-1 flex-col">
        <div className="min-w-0">
          {order.customer ? (
            <>
              <p className="text-sm font-medium text-foreground/85 truncate">
                {order.customer.name || order.customer.email}
              </p>
              {order.customer.name && order.customer.email && (
                <p className="text-xs text-muted-foreground truncate">{order.customer.email}</p>
              )}
            </>
          ) : (
            <p className="text-sm italic text-muted-foreground">Guest checkout</p>
          )}
        </div>

        {summary && <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{summary}</p>}

        <div className="mt-auto pt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <StatusPill label={fn.label} tone={fn.tone} />
          <StatusPill label={ff.label} tone={ff.tone} />
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-1.5">
          <span className="text-base font-bold text-card-foreground">${parseFloat(order.total_price).toFixed(2)}</span>
          <span className="text-xs text-muted-foreground">{itemCount} item{itemCount !== 1 ? "s" : ""}</span>
        </div>
        <NewTicketButton order={order} />
      </div>
    </div>
  )
}

// ── Skeleton ────────────────────────────────────────────────────────────────────

export function OrderCardGridSkeleton() {
  return (
    <div className={cn(GRID_CLASS, "animate-pulse")}>
      {Array.from({ length: 9 }, (_, i) => `order-card-skeleton-${i}`).map((key) => (
        <div key={key} className="rounded-2xl bg-card border border-border px-5 pt-5 pb-4 flex flex-col">
          <div className="flex items-center justify-between">
            <div className="h-3.5 w-14 bg-foreground/[0.06] rounded" />
            <div className="h-3 w-12 bg-foreground/[0.05] rounded" />
          </div>
          <div className="mt-4 h-3.5 w-32 bg-foreground/[0.06] rounded" />
          <div className="mt-2 h-3 w-40 bg-foreground/[0.05] rounded" />
          <div className="mt-5 flex gap-3">
            <div className="h-3 w-16 bg-foreground/[0.06] rounded-full" />
            <div className="h-3 w-20 bg-foreground/[0.06] rounded-full" />
          </div>
          <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
            <div className="h-4 w-14 bg-foreground/[0.06] rounded" />
            <div className="h-8 w-24 bg-foreground/[0.05] rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Grid ────────────────────────────────────────────────────────────────────────

export default function OrderCardGrid({
  orders,
  hasMore,
  isLoadingMore,
  loadMoreError,
  onLoadMore,
  emptyTitle = "No orders found",
  emptyDescription = "Try adjusting your search.",
}: Props) {
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-sm font-semibold text-muted-foreground mb-1">{emptyTitle}</p>
        <p className="text-xs text-muted-foreground/70">{emptyDescription}</p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className={GRID_CLASS}>
        {orders.map(order => <OrderCard key={order.id} order={order} />)}
      </div>

      {hasMore && (
        <div>
          {loadMoreError && (
            <p className="mb-2 text-center text-xs text-red-500" aria-live="polite">{loadMoreError}</p>
          )}
          <button type="button"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="w-full text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors py-1"
          >
            {isLoadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  )
}
