"use client"

import type { OrderRow } from "@/lib/orders/order-contract"
import { ShopStreamLoading } from "./ShopStreamLoading"
import { ShopOrderCard } from "./ShopCards"

const EMPTY_CARD_CLASS =
  "rounded-3xl border border-border bg-card px-5 py-8 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)]"

function ShopEmptyCard({ children }: { children: React.ReactNode }) {
  return (
    <div className={EMPTY_CARD_CLASS}>
      <p className="text-center text-sm text-muted-foreground">{children}</p>
    </div>
  )
}

export function ShopSearchPrompt() {
  return <ShopEmptyCard>Search by order number or customer email to open an order.</ShopEmptyCard>
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
    return <ShopStreamLoading label="Searching orders" />
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
