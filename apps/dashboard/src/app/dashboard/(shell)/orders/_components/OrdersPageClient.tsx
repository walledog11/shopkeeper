"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useSWRConfig } from "swr"
import { Search, ShoppingBag, X } from "lucide-react"
import { OrdersPageSkeleton } from "@/app/dashboard/_components/skeletons"
import { isShopifyIntegrationActive, isShopifyOrdersUnavailable } from "@/lib/integrations/shopify-connection"
import { INTEGRATIONS_SWR_KEY, useIntegrations } from "@/hooks/useIntegrations"
import { useCursorListState } from "@/lib/api/use-cursor-list-state"
import CustomersPanel from "./customers/CustomersPanel"
import NeedsYouSection from "./NeedsYouSection"
import { OrdersBoard, OrdersSearchResults } from "./OrdersBoard"
import { ORDER_BOARD_COLUMNS, type OrderRow } from "./orders-board-model"
import { fetchOrdersPage, type OrdersResponse } from "./order-requests"
import { useOrdersBoard } from "./use-orders-board"

const GLASS_SHELL_CLASS =
  "space-y-2 rounded-[22px] border border-foreground/[0.08] bg-card/60 px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_18px_50px_rgba(43,33,24,0.13)] backdrop-blur-2xl backdrop-saturate-150 supports-[backdrop-filter]:bg-card/45"

const GLASS_CONTROL_CLASS =
  "border border-foreground/[0.08] bg-background/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.38)] backdrop-blur-md backdrop-saturate-150 supports-[backdrop-filter]:bg-background/28"

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
    fetchPage: fetchColumnPage,
    loadMoreErrorMessage: "Unable to load more orders.",
    onInitialLoad: (response) => onShopLoaded(response.shop),
    selectInitialPage: (response) => ({ items: response.orders, nextPageInfo: response.nextPageInfo }),
  })

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
      <div className="relative z-20 shrink-0 px-3 pb-3 pt-3">
        <div className={GLASS_SHELL_CLASS}>
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className={`flex h-9 min-w-0 items-center gap-2 rounded-full px-3.5 md:flex-1 ${GLASS_CONTROL_CLASS}`}>
              <Search className="size-3.5 shrink-0 text-faint" />
              <input
                aria-label={shopTab === "customers" ? "Search customers" : "Search orders"}
                placeholder={shopTab === "customers" ? "Search customers by name or email…" : "Search orders…"}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm text-strong outline-none placeholder:text-faint"
              />
              {searchInput && (
                <button type="button" onClick={() => setSearchInput("")} aria-label="Clear search" className="text-faint transition-colors hover:text-muted-foreground">
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            <div role="tablist" aria-label="Shop sections" className={`flex h-9 items-center gap-1 rounded-full px-1 md:shrink-0 ${GLASS_CONTROL_CLASS}`}>
              {([
                { id: "orders", label: "Orders" },
                { id: "customers", label: "Customers" },
              ] as const).map((tab) => {
                const active = shopTab === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setShopTab(tab.id)}
                    className={`h-7 flex-1 rounded-full px-3 text-xs font-semibold transition-colors md:flex-none ${
                      active ? "bg-foreground/[0.12] text-foreground" : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-strong"
                    }`}
                  >
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto">
        <div className="w-full space-y-5 px-6 py-6">
          {shopTab === "customers" ? (
            <CustomersPanel query={debouncedSearch} />
          ) : searchActive ? (
            <>
              <p className="text-xs font-medium text-faint">
                {search.isLoading ? "Searching…" : `${search.allItems.length} result${search.allItems.length !== 1 ? "s" : ""}`}
              </p>
              <OrdersSearchResults
                orders={search.allItems}
                shop={shop}
                hasMore={Boolean(search.nextPageInfo)}
                isLoadingMore={search.isLoadingMore}
                loadMoreError={search.loadMoreError}
                onLoadMore={search.loadMore}
                emptyTitle={search.isLoading ? "Searching…" : "No matching orders"}
                emptyDescription="Try a different name, email, or order number."
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
  )
}
