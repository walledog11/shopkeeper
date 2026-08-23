"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useSWRConfig } from "swr"
import { ShoppingBag } from "lucide-react"
import { OrdersPageSkeleton } from "@/app/dashboard/_components/skeletons"
import { dashboardChromeColumnClassName, desktopTopBarScrollClearanceClass } from "@/app/dashboard/_components/sidebar/sidebar-helpers"
import { SearchFilterBar } from "@/components/ui/search-filter-bar"
import { isShopifyIntegrationActive, isShopifyOrdersUnavailable } from "@/lib/integrations/shopify-connection"
import { cn } from "@/lib/ui/cn"
import { INTEGRATIONS_SWR_KEY, useIntegrations } from "@/hooks/useIntegrations"
import { useCursorListState } from "@/lib/api/use-cursor-list-state"
import CustomersPanel from "./customers/CustomersPanel"
import NeedsYouSection from "./NeedsYouSection"
import { OrdersBoard } from "./OrdersBoard"
import { OrdersSearchResults } from "./OrdersSearchResults"
import { dedupeOrders, ORDER_BOARD_COLUMNS, type OrderRow } from "./orders-board-model"
import { fetchOrdersPage, fetchOrdersSearch, type OrdersResponse } from "./order-requests"
import { useOrdersBoard } from "./use-orders-board"

type ShopTab = "orders" | "customers"

function parseShopTab(value: string | null): ShopTab {
  return value === "customers" ? "customers" : "orders"
}

async function fetchColumnPage(pageInfo: string) {
  const page = await fetchOrdersPage(pageInfo)
  return { items: page.orders, nextPageInfo: page.nextPageInfo }
}

export default function OrdersPageClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { mutate: globalMutate } = useSWRConfig()
  const { data: integrations = [], isLoading: integrationsLoading } = useIntegrations()
  const shopTab = parseShopTab(searchParams.get("tab"))
  const ordersEnabled = shopTab === "orders"

  const [shop, setShop] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(searchInput.trim()), 250)
    return () => clearTimeout(id)
  }, [searchInput])

  const searchActive = debouncedSearch.length > 0
  const boardEnabled = ordersEnabled && !searchActive

  const onShopLoaded = useCallback((loadedShop: string) => {
    if (loadedShop) setShop(prev => prev ?? loadedShop)
  }, [])

  const { columns, error: boardError, isInitialLoading: boardInitialLoading } = useOrdersBoard(
    boardEnabled,
    onShopLoaded,
  )

  const search = useCursorListState<OrderRow, OrdersResponse>({
    enabled: ordersEnabled && searchActive,
    buildUrl: () => `/api/orders?q=${encodeURIComponent(debouncedSearch)}`,
    fetchInitial: fetchOrdersSearch,
    fetchPage: fetchColumnPage,
    loadMoreErrorMessage: "Unable to load more orders.",
    onInitialLoad: (response) => onShopLoaded(response.shop),
    selectInitialPage: (response) => ({ items: response.orders, nextPageInfo: response.nextPageInfo }),
  })
  const searchOrders = dedupeOrders(search.allItems)

  const hasActiveShopify = integrations.some(
    integration => integration.platform === "shopify" && isShopifyIntegrationActive(integration),
  )
  const primaryError = searchActive ? search.error : boardError
  const isShopifyDisconnected = !integrationsLoading && (
    !hasActiveShopify || (ordersEnabled && isShopifyOrdersUnavailable(primaryError))
  )

  useEffect(() => {
    if (!isShopifyDisconnected) return
    void globalMutate(INTEGRATIONS_SWR_KEY)
  }, [globalMutate, isShopifyDisconnected])

  const setShopTab = useCallback((tab: ShopTab) => {
    setSearchInput("")
    setDebouncedSearch("")
    const params = new URLSearchParams(searchParams.toString())
    if (tab === "customers") params.set("tab", "customers")
    else params.delete("tab")
    const qs = params.toString()
    router.replace(qs ? `/dashboard/orders?${qs}` : "/dashboard/orders", { scroll: false })
  }, [router, searchParams])

  if (integrationsLoading && ordersEnabled) {
    return <OrdersPageSkeleton />
  }

  if (isShopifyDisconnected) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl border border-border bg-card">
          <ShoppingBag className="size-5 text-[#96BF48]/70" />
        </div>
        <div>
          <p className="mb-1 text-sm font-semibold text-foreground">No Shopify store connected</p>
          <p className="mb-3 text-xs text-muted-foreground">Connect your store to view orders and customers here.</p>
          <Link
            href="/dashboard/integrations"
            className="text-xs font-semibold text-[#96BF48] transition-colors hover:text-[#7da33a]"
          >
            Set up Shopify integration →
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className={cn(dashboardChromeColumnClassName(), "flex min-h-0 flex-1 flex-col")}>
        <div className={cn("relative z-20 shrink-0 pb-3 pt-3", desktopTopBarScrollClearanceClass)}>
          <SearchFilterBar
            value={searchInput}
            onValueChange={setSearchInput}
            placeholder={shopTab === "customers" ? "Search customers by name or email…" : "Search by order number or customer email…"}
            aria-label={shopTab === "customers" ? "Search customers" : "Search orders"}
            onClear={() => setSearchInput("")}
            filterGroup={{ role: "tablist", "aria-label": "Shop sections" }}
            filters={[
              { id: "orders", label: "Orders", pressed: shopTab === "orders", onClick: () => setShopTab("orders") },
              { id: "customers", label: "Customers", pressed: shopTab === "customers", onClick: () => setShopTab("customers") },
            ]}
          />
        </div>

        <div className="custom-scrollbar flex-1 overflow-y-auto">
          <div className="w-full space-y-5 py-6">
            {shopTab === "customers" ? (
              <CustomersPanel query={debouncedSearch} />
            ) : searchActive ? (
              <>
                <p className="text-xs font-medium text-faint">
                  {search.isLoading ? "Searching…" : `${searchOrders.length} result${searchOrders.length !== 1 ? "s" : ""}`}
                </p>
                <OrdersSearchResults
                  orders={searchOrders}
                  shop={shop}
                  hasMore={Boolean(search.nextPageInfo)}
                  isLoading={search.isLoading}
                  isLoadingMore={search.isLoadingMore}
                  error={search.error}
                  loadMoreError={search.loadMoreError}
                  onLoadMore={search.loadMore}
                  onRetry={() => { void search.mutate() }}
                />
              </>
            ) : boardInitialLoading ? (
              <div className="grid gap-6 lg:grid-cols-3" aria-busy="true" aria-label="Loading orders">
                {ORDER_BOARD_COLUMNS.map(column => (
                  <div key={column.id} className="space-y-2.5">
                    <div className="mb-3 h-4 w-28 animate-pulse rounded-md bg-foreground/[0.07]" />
                    <div className="h-36 animate-pulse rounded-2xl border border-border bg-card" />
                    <div className="h-36 animate-pulse rounded-2xl border border-border bg-card" />
                  </div>
                ))}
              </div>
            ) : (
              <>
                <NeedsYouSection enabled={boardEnabled} shop={shop} />
                <OrdersBoard columns={columns} shop={shop} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
