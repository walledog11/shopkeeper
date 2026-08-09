"use client"

import { BoardLoadMoreButton } from "@/app/dashboard/_components/board/BoardLoadMoreButton"
import type { OrderRow } from "@/lib/orders/order-contract"
import { OrderCard } from "./OrderCard"
import { OrderDetailDialog } from "./OrderDetailDialog"
import { useOrderSelection } from "./use-order-selection"

export function OrdersSearchResults({
  orders,
  shop,
  hasMore,
  isLoading,
  isLoadingMore,
  error,
  loadMoreError,
  onLoadMore,
  onRetry,
}: {
  orders: OrderRow[]
  shop: string | null
  hasMore: boolean
  isLoading: boolean
  isLoadingMore: boolean
  error: unknown
  loadMoreError: string | null
  onLoadMore: () => void
  onRetry: () => void
}) {
  const selection = useOrderSelection(orders)

  if (error && orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center" role="alert">
        <p className="mb-1 text-sm font-semibold text-red-700">Couldn’t search orders</p>
        <p className="mb-3 text-xs text-muted-foreground">Shopify didn’t return search results. Your query was not treated as empty.</p>
        <button type="button" onClick={onRetry} className="text-xs font-semibold text-red-700 hover:underline">Try again</button>
      </div>
    )
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="mb-1 text-sm font-semibold text-muted-foreground">{isLoading ? "Searching…" : "No matching orders"}</p>
        <p className="text-xs text-muted-foreground/70">Search by order number or customer email.</p>
        {hasMore ? (
          <div className="mt-4 w-full max-w-xs">
            {loadMoreError ? <p className="mb-2 text-center text-xs text-red-500" aria-live="polite">{loadMoreError}</p> : null}
            <BoardLoadMoreButton isLoadingMore={isLoadingMore} loadingLabel="Loading…" onLoadMore={onLoadMore} />
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {orders.map(order => <OrderCard key={order.id} order={order} onOpen={() => selection.openOrder(order)} />)}
      </div>
      {hasMore ? (
        <div className="mt-5">
          {loadMoreError ? <p className="mb-2 text-center text-xs text-red-500" aria-live="polite">{loadMoreError}</p> : null}
          <BoardLoadMoreButton isLoadingMore={isLoadingMore} loadingLabel="Loading…" onLoadMore={onLoadMore} />
        </div>
      ) : null}
      <OrderDetailDialog order={selection.selectedOrder} shop={shop} onClose={selection.closeOrder} />
    </>
  )
}
