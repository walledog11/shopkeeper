"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ExternalLink, Copy, Check, MessageSquare, Loader2 } from "lucide-react"

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
  shop: string
  hasMore: boolean
  isLoadingMore: boolean
  onLoadMore: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fulfillmentStyle(status: string | null): { label: string; cls: string } {
  switch (status) {
    case 'fulfilled':  return { label: 'Fulfilled',   cls: 'text-green-400 bg-green-400/10 border-green-400/20' }
    case 'partial':    return { label: 'Partial',     cls: 'text-amber-400 bg-amber-400/10 border-amber-400/20' }
    case 'restocked':  return { label: 'Restocked',   cls: 'text-white/40 bg-white/[0.06] border-white/[0.10]' }
    default:           return { label: 'Unfulfilled', cls: 'text-amber-400 bg-amber-400/10 border-amber-400/20' }
  }
}

function financialStyle(status: string): { label: string; cls: string } {
  switch (status) {
    case 'paid':       return { label: 'Paid',        cls: 'text-green-400 bg-green-400/10 border-green-400/20' }
    case 'pending':    return { label: 'Pending',     cls: 'text-amber-400 bg-amber-400/10 border-amber-400/20' }
    case 'refunded':   return { label: 'Refunded',    cls: 'text-white/40 bg-white/[0.06] border-white/[0.10]' }
    case 'partially_refunded': return { label: 'Partial refund', cls: 'text-blue-400 bg-blue-400/10 border-blue-400/20' }
    case 'voided':     return { label: 'Voided',      cls: 'text-white/30 bg-white/[0.04] border-white/[0.08]' }
    default:           return { label: status,        cls: 'text-white/40 bg-white/[0.06] border-white/[0.10]' }
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── CopyButton ────────────────────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={e => {
        e.stopPropagation()
        navigator.clipboard.writeText(value).catch(() => {})
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="text-white/20 hover:text-white/50 transition-colors shrink-0"
      title="Copy"
    >
      {copied
        ? <Check className="w-3 h-3 text-green-500" />
        : <Copy className="w-3 h-3" />}
    </button>
  )
}

// ── StartThreadButton ─────────────────────────────────────────────────────────

function StartThreadButton({ order }: { order: OrderRow }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!order.customer) return
    setLoading(true)
    try {
      const res = await fetch('/api/threads/shopify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopifyCustomerId: String(order.customer.id),
          customerEmail: order.customer.email,
          customerName: order.customer.name,
          orderName: order.name,
        }),
      })
      const data = await res.json()
      if (res.ok && data.threadId) {
        router.push(`/dashboard/tickets?thread=${data.threadId}`)
      }
    } finally {
      setLoading(false)
    }
  }

  if (!order.customer) return null

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="text-white/60 hover:text-white transition-colors disabled:opacity-40 shrink-0"
      title="New support thread"
    >
      {loading
        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
        : <MessageSquare className="w-3.5 h-3.5" />}
    </button>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

export function OrdersTableSkeleton() {
  return (
    <div className="divide-y divide-white/[0.05] animate-pulse">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-3.5">
          <div className="h-3 w-16 bg-white/[0.07] rounded" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-28 bg-white/[0.07] rounded" />
            <div className="h-2.5 w-36 bg-white/[0.04] rounded" />
          </div>
          <div className="hidden md:block h-2.5 w-20 bg-white/[0.05] rounded" />
          <div className="hidden lg:block flex-1 h-2.5 w-32 bg-white/[0.04] rounded" />
          <div className="h-2.5 w-12 bg-white/[0.05] rounded" />
          <div className="h-5 w-20 bg-white/[0.06] rounded-full" />
        </div>
      ))}
    </div>
  )
}

// ── Main table ────────────────────────────────────────────────────────────────

export default function OrdersTable({ orders, shop, hasMore, isLoadingMore, onLoadMore }: Props) {
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-10 h-10 rounded-md bg-white/[0.05] border border-white/[0.07] flex items-center justify-center mb-3">
          <Check className="w-4 h-4 text-green-400/60" />
        </div>
        <p className="text-sm font-semibold text-white/40 mb-1">No orders found</p>
        <p className="text-xs text-white/25">Try adjusting your filters or search.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Column headers */}
      <div className="hidden lg:grid grid-cols-[90px_minmax(0,1.5fr)_82px_minmax(0,1fr)_72px_100px_150px] gap-3 px-4 py-2 border-b border-white/[0.05]">
        {['Order', 'Customer', 'Date', 'Items', 'Total', 'Payment', 'Fulfillment'].map(h => (
          <span key={h} className="text-[10px] font-semibold uppercase tracking-wider text-white/20">{h}</span>
        ))}
      </div>

      <div className="divide-y divide-white/[0.05]">
        {orders.map(order => {
          const ff = fulfillmentStyle(order.fulfillment_status)
          const fn = financialStyle(order.financial_status)
          const adminUrl = `https://${shop}/admin/orders/${order.id}`

          const visibleItems = order.line_items.slice(0, 2)
          const extraCount = order.line_items.length - 2

          return (
            <div
              key={order.id}
              className="group flex flex-col lg:grid lg:grid-cols-[90px_minmax(0,1.5fr)_82px_minmax(0,1fr)_72px_100px_150px] lg:items-center gap-2 lg:gap-3 px-4 py-3 hover:bg-white/[0.025] transition-colors"
            >
              {/* Order # */}
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs font-bold text-white/70">{order.name}</span>
                <CopyButton value={order.name} />
              </div>

              {/* Customer */}
              <div className="min-w-0">
                {order.customer ? (
                  <>
                    <p className="text-xs font-semibold text-white/70 truncate">{order.customer.name || '—'}</p>
                    <p className="text-[11px] text-white/35 truncate">{order.customer.email}</p>
                  </>
                ) : (
                  <p className="text-xs text-white/30 italic">Guest</p>
                )}
              </div>

              {/* Date */}
              <div className="hidden md:block min-w-0">
                <span className="text-[11px] text-white/35">{formatDate(order.created_at)}</span>
              </div>

              {/* Items */}
              <div className="min-w-0">
                {visibleItems.map((li, i) => (
                  <p key={i} className="text-[11px] text-white/45 truncate">
                    {li.quantity}× {li.title}
                    {li.variant_title && <span className="text-white/25"> — {li.variant_title}</span>}
                  </p>
                ))}
                {extraCount > 0 && (
                  <p className="text-[11px] text-white/25">+{extraCount} more</p>
                )}
              </div>

              {/* Total */}
              <div className="min-w-0">
                <span className="text-xs font-semibold text-white/60">
                  ${parseFloat(order.total_price).toFixed(2)}
                </span>
              </div>

              {/* Financial status */}
              <div className="min-w-0">
                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${fn.cls}`}>
                  <span className="w-1 h-1 rounded-full bg-current shrink-0" />
                  {fn.label}
                </span>
              </div>

              {/* Fulfillment + icon actions in same cell */}
              <div className="flex items-center gap-2 min-w-0">
                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${ff.cls}`}>
                  <span className="w-1 h-1 rounded-full bg-current shrink-0" />
                  {ff.label}
                </span>
                <div className="flex items-center gap-1.5 opacity-30 group-hover:opacity-100 transition-opacity shrink-0">
                  <StartThreadButton order={order} />
                  <a
                    href={adminUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-white/25 hover:text-white/60 transition-colors"
                    title="View in Shopify admin"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {hasMore && (
        <div className="px-5 py-4 border-t border-white/[0.05]">
          <button
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
