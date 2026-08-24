"use client"

import { useState } from "react"
import { cn } from "@/lib/ui/cn"
import type { OrderRow } from "@/lib/orders/order-contract"
import { InboxStreamLoading } from "@/app/dashboard/(shell)/tickets/_components/stream/InboxStreamLoading"
import { ShopFindingCard, ShopOrderCard } from "./ShopCards"
import {
  fetchOrdersSearch,
  type OrderAttentionFinding,
} from "./order-requests"
import { matchOrderFromSearch } from "./shop-page-utils"

const SERIF = "[font-family:var(--m-serif),Georgia,'Times_New_Roman',serif]"
const EMPTY_CARD_CLASS =
  "rounded-3xl border border-border bg-card px-5 py-8 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)]"

export function ShopEmptyCard({ children }: { children: React.ReactNode }) {
  return (
    <div className={EMPTY_CARD_CLASS}>
      <p className="text-center text-sm text-muted-foreground">{children}</p>
    </div>
  )
}

export function ShopAttentionLead({ count }: { count: number }) {
  if (count === 0) return null

  return (
    <p className="px-0.5 text-sm leading-relaxed text-muted-foreground">
      <span className="font-semibold tabular-nums text-foreground">{count}</span>
      {" "}
      {count === 1 ? "order needs a look" : "orders need a look"}
      {" "}
      <span className={cn("italic text-muted-foreground/90", SERIF)}>before you move on.</span>
    </p>
  )
}

export function ShopStream({
  findings,
  isLoading,
  error,
  onOpenOrder,
  onRetry,
}: {
  findings: OrderAttentionFinding[]
  isLoading: boolean
  error: unknown
  onOpenOrder: (order: OrderRow) => void
  onRetry: () => void
}) {
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [openErrorById, setOpenErrorById] = useState<Record<string, string>>({})

  if (isLoading) {
    return <InboxStreamLoading label="Loading orders" />
  }

  if (error) {
    return (
      <div className={EMPTY_CARD_CLASS} role="alert">
        <p className="text-center text-sm font-semibold text-red-700">Couldn’t load orders that need a look.</p>
        <button
          type="button"
          onClick={onRetry}
          className="mx-auto mt-3 block text-xs font-semibold text-red-700 hover:underline"
        >
          Try again
        </button>
      </div>
    )
  }

  if (findings.length === 0) {
    return <ShopEmptyCard>Nothing needs a look right now. Search when you want a specific order.</ShopEmptyCard>
  }

  const openFinding = async (finding: OrderAttentionFinding) => {
    setOpeningId(finding.id)
    setOpenErrorById(current => {
      if (!current[finding.id]) return current
      const next = { ...current }
      delete next[finding.id]
      return next
    })

    try {
      const page = await fetchOrdersSearch(`/api/orders?q=${encodeURIComponent(finding.orderName)}`)
      const match = matchOrderFromSearch(page.orders, finding.orderId)
      if (match) {
        onOpenOrder(match)
        return
      }
      setOpenErrorById(current => ({ ...current, [finding.id]: "Couldn’t find that order in Shopify." }))
    } catch {
      setOpenErrorById(current => ({ ...current, [finding.id]: "Couldn’t open that order." }))
    } finally {
      setOpeningId(null)
    }
  }

  return (
    <section className="flex flex-col gap-3" data-testid="shop-attention">
      <ShopAttentionLead count={findings.length} />
      <ul className="flex flex-col gap-3">
        {findings.map(finding => (
          <ShopFindingCard
            key={finding.id}
            finding={finding}
            isOpening={openingId === finding.id}
            error={openErrorById[finding.id] ?? null}
            onOpen={() => { void openFinding(finding) }}
          />
        ))}
      </ul>
    </section>
  )
}

export function ShopSearchResults({
  orders,
  hasMore,
  isLoading,
  isLoadingMore,
  error,
  loadMoreError,
  onOpenOrder,
  onLoadMore,
  onRetry,
}: {
  orders: OrderRow[]
  hasMore: boolean
  isLoading: boolean
  isLoadingMore: boolean
  error: unknown
  loadMoreError: string | null
  onOpenOrder: (order: OrderRow) => void
  onLoadMore: () => void
  onRetry: () => void
}) {
  if (isLoading && orders.length === 0) {
    return <InboxStreamLoading label="Searching orders" />
  }

  if (error && orders.length === 0) {
    return (
      <div className={EMPTY_CARD_CLASS} role="alert">
        <p className="text-center text-sm font-semibold text-red-700">Couldn’t search orders.</p>
        <button
          type="button"
          onClick={onRetry}
          className="mx-auto mt-3 block text-xs font-semibold text-red-700 hover:underline"
        >
          Try again
        </button>
      </div>
    )
  }

  if (orders.length === 0) {
    return <ShopEmptyCard>Nothing matches that.</ShopEmptyCard>
  }

  return (
    <section className="flex flex-col gap-3" data-testid="shop-search-results">
      <p className="px-0.5 text-sm leading-relaxed text-muted-foreground">
        <span className="font-semibold tabular-nums text-foreground">{orders.length}</span>
        {" "}
        {orders.length === 1 ? "matching order" : "matching orders"}
      </p>
      <ul className="flex flex-col gap-3">
        {orders.map(order => (
          <ShopOrderCard key={order.id} order={order} onOpen={() => onOpenOrder(order)} />
        ))}
      </ul>
      {hasMore ? (
        <div>
          {loadMoreError ? (
            <p className="mb-2 text-center text-xs text-red-500" aria-live="polite">{loadMoreError}</p>
          ) : null}
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="w-full rounded-2xl border border-border py-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
          >
            {isLoadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}
    </section>
  )
}
