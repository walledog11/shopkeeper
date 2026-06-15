"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useSWRConfig } from "swr"
import { Search, ShoppingBag, X } from "lucide-react"
import { isShopifyIntegrationActive, isShopifyOrdersUnavailable } from "@/lib/integrations/shopify-connection"
import { INTEGRATIONS_SWR_KEY, useIntegrations } from "@/hooks/useIntegrations"
import { formatSyncRelativeTime } from "@/lib/format/date"
import { useCursorListState } from "@/lib/api/use-cursor-list-state"
import OrderCardGrid, { OrderCardGridSkeleton } from "./OrderCard"
import CustomersPanel from "./customers/CustomersPanel"
import type { OrderRow } from "./OrdersTable"
import { fetchOrdersPage, type OrdersResponse } from "./order-requests"

const ORDER_VIEWS = [
  { id: "needs_fulfillment", label: "Needs fulfillment" },
  { id: "all", label: "All orders" },
] as const

type OrderViewId = typeof ORDER_VIEWS[number]["id"]
type ShopTab = "orders" | "customers"

function viewToQuery(id: OrderViewId): string {
  switch (id) {
    case "needs_fulfillment": return "fulfillment_status=unfulfilled"
    default: return ""
  }
}

function parseShopTab(value: string | null): ShopTab {
  return value === "customers" ? "customers" : "orders"
}

function useOrdersPanelState(enabled: boolean) {
  const [view, setView] = useState<OrderViewId>("needs_fulfillment")
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  const list = useCursorListState<OrderRow, OrdersResponse>({
    enabled,
    buildUrl: (debouncedQuery) => {
      if (debouncedQuery) {
        return `/api/orders?q=${encodeURIComponent(debouncedQuery)}`
      }
      const qs = viewToQuery(view)
      return qs ? `/api/orders?${qs}` : `/api/orders`
    },
    fetchPage: async (pageInfo) => {
      const page = await fetchOrdersPage(pageInfo)
      return { items: page.orders, nextPageInfo: page.nextPageInfo }
    },
    loadMoreErrorMessage: "Unable to load more orders.",
    onInitialLoad: () => {
      setLastSyncedAt(Date.now())
    },
    selectInitialPage: (response) => ({
      items: response.orders,
      nextPageInfo: response.nextPageInfo,
    }),
  })

  const handleViewChange = (id: OrderViewId) => {
    setView(id)
    list.resetSearch()
  }

  return {
    ...list,
    view,
    handleViewChange,
    lastSyncedAt,
  }
}

export default function OrdersPageClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { mutate: globalMutate } = useSWRConfig()
  const { data: integrations = [], isLoading: integrationsLoading } = useIntegrations()
  const shopTab = parseShopTab(searchParams.get("tab"))

  const setShopTab = useCallback((tab: ShopTab) => {
    const params = new URLSearchParams(searchParams.toString())
    if (tab === "customers") {
      params.set("tab", "customers")
    } else {
      params.delete("tab")
    }
    const qs = params.toString()
    router.replace(qs ? `/dashboard/orders?${qs}` : "/dashboard/orders", { scroll: false })
  }, [router, searchParams])

  const ordersEnabled = shopTab === "orders"
  const {
    allItems: allOrders,
    error,
    view,
    handleViewChange,
    handleSearchChange,
    isLoading,
    isLoadingMore,
    isSearchMode,
    lastSyncedAt,
    loadMore,
    loadMoreError,
    nextPageInfo,
    pages,
    searchQuery,
  } = useOrdersPanelState(ordersEnabled)

  const emptyTitle = isSearchMode
    ? "No matching orders"
    : view === "needs_fulfillment"
      ? "You're all caught up"
      : "No orders yet"
  const emptyDescription = isSearchMode
    ? "Try a different name, email, or order number."
    : view === "needs_fulfillment"
      ? "Every order has been fulfilled."
      : "Orders from your store will appear here."

  const hasActiveShopify = integrations.some(
    integration => integration.platform === "shopify" && isShopifyIntegrationActive(integration),
  )
  const isShopifyDisconnected = !integrationsLoading && (
    !hasActiveShopify || (shopTab === "orders" && isShopifyOrdersUnavailable(error))
  )

  useEffect(() => {
    if (!isShopifyDisconnected) return
    void globalMutate(INTEGRATIONS_SWR_KEY)
  }, [globalMutate, isShopifyDisconnected])

  if (isShopifyDisconnected) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-6">
        <div className="size-12 rounded-2xl bg-card border border-border flex items-center justify-center">
          <ShoppingBag className="size-5 text-[#96BF48]/70" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground mb-1">No Shopify store connected</p>
          <p className="text-xs text-muted-foreground mb-3">Connect your store to view orders and customers here.</p>
          <Link
            href="/dashboard/integrations"
            className="text-xs font-semibold text-[#96BF48] hover:text-[#7da33a] transition-colors"
          >
            Set up Shopify integration →
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      <div className="px-6 pt-6 pb-5 border-b border-border shrink-0">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Shop</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Live from Shopify
          {shopTab === "orders" && lastSyncedAt && <> · synced {formatSyncRelativeTime(lastSyncedAt)}</>}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="w-full px-6 py-6 space-y-5">
          <div role="tablist" aria-label="Shop sections" className="inline-flex h-9 items-center gap-1 rounded-lg bg-foreground/[0.05] border border-border p-0.5">
            {([
              { id: "orders", label: "Orders" },
              { id: "customers", label: "Customers" },
            ] as const).map(tab => {
              const active = shopTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setShopTab(tab.id)}
                  className={`inline-flex h-full items-center justify-center rounded-md px-3.5 text-xs font-semibold transition-colors ${
                    active
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>

          {shopTab === "customers" ? (
            <CustomersPanel />
          ) : (
            <>
              <div className="flex items-center gap-3 flex-wrap">
                {isSearchMode ? (
                  <span className="text-xs font-medium text-foreground/40">
                    {isLoading ? "Searching…" : `${allOrders.length} result${allOrders.length !== 1 ? "s" : ""}`}
                  </span>
                ) : (
                  <div role="tablist" aria-label="Order views" className="inline-flex h-9 items-center gap-1 rounded-lg bg-foreground/[0.05] border border-border p-0.5">
                    {ORDER_VIEWS.map(v => {
                      const active = view === v.id
                      return (
                        <button
                          key={v.id}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => handleViewChange(v.id)}
                          className={`inline-flex h-full items-center justify-center rounded-md px-3.5 text-xs font-semibold transition-colors ${
                            active
                              ? "bg-card text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {v.label}
                        </button>
                      )
                    })}
                  </div>
                )}

                <div className="flex items-center gap-2 bg-foreground/[0.04] border border-border rounded-md px-3 h-9 w-full sm:ml-auto sm:w-[320px]">
                  <Search className="size-3.5 text-foreground/25 shrink-0" />
                  <input
                    aria-label="Search orders"
                    value={searchQuery}
                    onChange={e => handleSearchChange(e.target.value)}
                    placeholder="Search orders, customers, #numbers…"
                    className="flex-1 bg-transparent text-sm text-foreground/70 placeholder:text-foreground/30 outline-none min-w-0"
                  />
                  {searchQuery && (
                    <button type="button" onClick={() => handleSearchChange("")} aria-label="Clear search" className="text-foreground/25 hover:text-foreground/50 transition-colors">
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {isLoading && pages.length === 0
                ? <OrderCardGridSkeleton />
                : <OrderCardGrid
                    orders={allOrders}
                    hasMore={!!nextPageInfo}
                    isLoadingMore={isLoadingMore}
                    loadMoreError={loadMoreError}
                    onLoadMore={loadMore}
                    emptyTitle={emptyTitle}
                    emptyDescription={emptyDescription}
                  />
              }
            </>
          )}
        </div>
      </div>
    </div>
  )
}
