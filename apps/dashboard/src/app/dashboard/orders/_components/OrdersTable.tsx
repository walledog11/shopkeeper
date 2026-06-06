"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Loader2 } from "lucide-react"
import { errorMessageFromUnknown } from "@/lib/api/fetcher"
import { formatShortDate } from "@/lib/format/date"
import { startOrderSupportThread } from "./order-requests"

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

interface Props {
  orders: OrderRow[]
  hasMore: boolean
  isLoadingMore: boolean
  loadMoreError: string | null
  onLoadMore: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fulfillmentStyle(status: string | null): { label: string; cls: string; dot: string } {
  switch (status) {
    case 'fulfilled':  return { label: 'Fulfilled',   cls: 'text-green-400', dot: 'bg-green-400' }
    case 'partial':    return { label: 'Partial',     cls: 'text-amber-400', dot: 'bg-amber-400' }
    case 'restocked':  return { label: 'Restocked',   cls: 'text-white/45', dot: 'bg-white/30' }
    default:           return { label: 'Unfulfilled', cls: 'text-amber-400', dot: 'bg-amber-400' }
  }
}

function financialStyle(status: string): { label: string; cls: string; dot: string } {
  switch (status) {
    case 'paid':       return { label: 'Paid',           cls: 'text-green-400', dot: 'bg-green-400' }
    case 'pending':    return { label: 'Pending',        cls: 'text-amber-400', dot: 'bg-amber-400' }
    case 'refunded':   return { label: 'Refunded',       cls: 'text-white/45',  dot: 'bg-white/30' }
    case 'partially_refunded': return { label: 'Partial refund', cls: 'text-blue-400', dot: 'bg-blue-400' }
    case 'voided':     return { label: 'Voided',         cls: 'text-white/35',  dot: 'bg-white/25' }
    default:           return { label: status,           cls: 'text-white/45',  dot: 'bg-white/30' }
  }
}

// ── StartThreadButton ─────────────────────────────────────────────────────────

function StartThreadButton({ order }: { order: OrderRow }) {
  const { push } = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startSupportThread = async (e: React.MouseEvent) => {
    e.stopPropagation()
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

  if (!order.customer) return null

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button"
        onClick={startSupportThread}
        disabled={loading}
        className="inline-flex items-center justify-center gap-1.5 h-7 px-3 rounded-md border border-white/[0.10] bg-white/[0.03] text-xs font-medium text-white/65 hover:bg-white/[0.06] hover:text-white hover:border-white/[0.18] disabled:opacity-40 transition-colors shrink-0"
        title="New support thread"
      >
        {loading && <Loader2 className="size-3 animate-spin" />}
        New thread
      </button>
      {error && (
        <p className="max-w-28 text-right text-xs text-red-400" aria-live="polite">{error}</p>
      )}
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

const GRID_COLS = "grid-cols-[100px_minmax(0,1.4fr)_80px_120px_130px_70px_90px_110px]"

export function OrdersTableSkeleton() {
  return (
    <div className="divide-y divide-white/[0.04] animate-pulse">
      {Array.from({ length: 8 }, (_, i) => `order-skeleton-${i}`).map((key) => (
        <div key={key} className={`hidden lg:grid ${GRID_COLS} items-center gap-4 px-5 py-4`}>
          <div className="h-3 w-16 bg-white/[0.06] rounded" />
          <div className="h-3 w-32 bg-white/[0.06] rounded" />
          <div className="h-3 w-12 bg-white/[0.05] rounded" />
          <div className="h-5 w-16 bg-white/[0.06] rounded-full" />
          <div className="h-5 w-20 bg-white/[0.06] rounded-full" />
          <div className="h-3 w-4 bg-white/[0.05] rounded" />
          <div className="h-3 w-12 bg-white/[0.06] rounded" />
          <div className="h-7 w-20 bg-white/[0.05] rounded-md" />
        </div>
      ))}
    </div>
  )
}

// ── Main table ────────────────────────────────────────────────────────────────

export default function OrdersTable({ orders, hasMore, isLoadingMore, loadMoreError, onLoadMore }: Props) {
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="size-10 rounded-md bg-white/[0.05] border border-white/[0.07] flex items-center justify-center mb-3">
          <Check className="size-4 text-green-400/60" />
        </div>
        <p className="text-sm font-semibold text-white/40 mb-1">No orders found</p>
        <p className="text-xs text-white/25">Try adjusting your filters or search.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Column headers */}
      <div className={`hidden lg:grid ${GRID_COLS} gap-4 px-5 py-3 border-b border-white/[0.05]`}>
        {['Order', 'Customer', 'Date', 'Payment', 'Fulfillment', 'Items', 'Total', 'Actions'].map((h) => (
          <span key={h} className="text-xs font-semibold uppercase tracking-[0.08em] text-white/30">{h === 'Actions' ? '' : h}</span>
        ))}
      </div>

      <div className="divide-y divide-white/[0.04]">
        {orders.map(order => {
          const ff = fulfillmentStyle(order.fulfillment_status)
          const fn = financialStyle(order.financial_status)
          const itemCount = order.line_items.reduce((sum, li) => sum + li.quantity, 0)

          return (
            <div key={order.id} className="hover:bg-white/[0.02] transition-colors">

              {/* Mobile card */}
              <div className="lg:hidden px-4 py-3.5 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-white/75">{order.name}</span>
                  <span className="text-xs text-white/40">{formatShortDate(order.created_at)}</span>
                </div>
                {order.customer ? (
                  <p className="text-xs text-white/75 truncate">{order.customer.name || order.customer.email || ','}</p>
                ) : (
                  <p className="text-xs text-white/30 italic">Guest</p>
                )}
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${fn.cls}`}>
                    <span className={`size-1.5 rounded-full shrink-0 ${fn.dot}`} />
                    {fn.label}
                  </span>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${ff.cls}`}>
                    <span className={`size-1.5 rounded-full shrink-0 ${ff.dot}`} />
                    {ff.label}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 pt-1">
                  <span className="text-xs text-white/55">
                    <span className="font-semibold text-white/75">${parseFloat(order.total_price).toFixed(2)}</span>
                    <span className="text-white/30"> · {itemCount} item{itemCount !== 1 ? 's' : ''}</span>
                  </span>
                  <StartThreadButton order={order} />
                </div>
              </div>

              {/* Desktop row */}
              <div className={`hidden lg:grid ${GRID_COLS} items-center gap-4 px-5 py-3.5`}>
                <span className="text-xs font-semibold text-white/75">{order.name}</span>
                <div className="min-w-0">
                  {order.customer ? (
                    <p className="text-xs text-white/75 truncate">{order.customer.name || order.customer.email || ','}</p>
                  ) : (
                    <p className="text-xs text-white/30 italic">Guest</p>
                  )}
                </div>
                <span className="text-xs text-white/40">{formatShortDate(order.created_at)}</span>
                <div className="min-w-0">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${fn.cls}`}>
                    <span className={`size-1.5 rounded-full shrink-0 ${fn.dot}`} />
                    {fn.label}
                  </span>
                </div>
                <div className="min-w-0">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${ff.cls}`}>
                    <span className={`size-1.5 rounded-full shrink-0 ${ff.dot}`} />
                    {ff.label}
                  </span>
                </div>
                <span className="text-xs text-white/55">{itemCount}</span>
                <span className="text-xs font-semibold text-white/75">
                  ${parseFloat(order.total_price).toFixed(2)}
                </span>
                <div className="flex justify-end">
                  <StartThreadButton order={order} />
                </div>
              </div>

            </div>
          )
        })}
      </div>

      {hasMore && (
        <div className="px-5 py-4 border-t border-white/[0.05]">
          {loadMoreError && (
            <p className="mb-2 text-center text-xs text-red-400" aria-live="polite">{loadMoreError}</p>
          )}
          <button type="button"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="w-full text-xs font-semibold text-white/35 hover:text-white/60 disabled:opacity-40 transition-colors py-1"
          >
            {isLoadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}
