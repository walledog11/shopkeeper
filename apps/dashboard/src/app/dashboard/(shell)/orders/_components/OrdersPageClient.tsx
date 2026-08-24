"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import useSWR, { useSWRConfig } from "swr"
import { ShoppingBag } from "lucide-react"
import { OrdersPageSkeleton } from "@/app/dashboard/_components/skeletons"
import { dashboardPageShellClassName } from "@/app/dashboard/_components/sidebar/sidebar-helpers"
import { SearchFilterBar } from "@/components/ui/search-filter-bar"
import { requestJson } from "@/lib/api/fetcher"
import { useCursorListState } from "@/lib/api/use-cursor-list-state"
import { INTEGRATIONS_SWR_KEY, useIntegrations } from "@/hooks/useIntegrations"
import { isShopifyIntegrationActive, isShopifyOrdersUnavailable } from "@/lib/integrations/shopify-connection"
import type { OrderRow } from "@/lib/orders/order-contract"
import { OrderDetailDialog } from "./OrderDetailDialog"
import { ShopSearchResults, ShopStream } from "./ShopStream"
import { dedupeOrders } from "./orders-board-model"
import {
  fetchOrdersPage,
  fetchOrdersSearch,
  type OrderAttentionResponse,
  type OrdersResponse,
} from "./order-requests"

function useOrderAttention(enabled: boolean) {
  return useSWR<OrderAttentionResponse>(
    enabled ? "/api/orders/attention" : null,
    (url) => requestJson<OrderAttentionResponse>(url, { cache: "no-store" }),
    { revalidateOnFocus: true, dedupingInterval: 5_000, shouldRetryOnError: false },
  )
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

  const shopify = integrations.find(
    integration => integration.platform === "shopify" && isShopifyIntegrationActive(integration),
  )
  const shop = shopify?.externalAccountId ?? null

  const [searchInput, setSearchInput] = useState(() => searchParams.get("q") ?? "")
  const [debouncedSearch, setDebouncedSearch] = useState(() => searchInput.trim())
  const [selectedOrder, setSelectedOrder] = useState<OrderRow | null>(null)

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(searchInput.trim()), 250)
    return () => clearTimeout(id)
  }, [searchInput])

  useEffect(() => {
    const current = searchParams.get("q") ?? ""
    const hasStaleTab = searchParams.has("tab")
    if (current === debouncedSearch && !hasStaleTab) return
    const params = new URLSearchParams(searchParams.toString())
    params.delete("tab")
    if (debouncedSearch) params.set("q", debouncedSearch)
    else params.delete("q")
    const qs = params.toString()
    router.replace(qs ? `/dashboard/orders?${qs}` : "/dashboard/orders", { scroll: false })
  }, [debouncedSearch, router, searchParams])

  const searchActive = debouncedSearch.length > 0
  const hasActiveShopify = Boolean(shopify)

  const attention = useOrderAttention(hasActiveShopify && !searchActive)
  const search = useCursorListState<OrderRow, OrdersResponse>({
    enabled: hasActiveShopify && searchActive,
    buildUrl: () => `/api/orders?q=${encodeURIComponent(debouncedSearch)}`,
    fetchInitial: fetchOrdersSearch,
    fetchPage: fetchColumnPage,
    loadMoreErrorMessage: "Unable to load more orders.",
    selectInitialPage: (response) => ({ items: response.orders, nextPageInfo: response.nextPageInfo }),
  })
  const searchOrders = dedupeOrders(search.allItems)

  const isShopifyDisconnected = !integrationsLoading && (
    !hasActiveShopify || (searchActive && isShopifyOrdersUnavailable(search.error))
  )

  useEffect(() => {
    if (!isShopifyDisconnected) return
    void globalMutate(INTEGRATIONS_SWR_KEY)
  }, [globalMutate, isShopifyDisconnected])

  const openOrder = useCallback((order: OrderRow) => setSelectedOrder(order), [])
  const closeOrder = useCallback(() => setSelectedOrder(null), [])

  if (integrationsLoading) {
    return <OrdersPageSkeleton />
  }

  if (isShopifyDisconnected) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-background">
        <div className="custom-scrollbar flex-1 overflow-y-auto overflow-x-hidden">
          <div className={dashboardPageShellClassName("justify-center")}>
            <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
              <div className="flex size-12 items-center justify-center rounded-2xl border border-border bg-card">
                <ShoppingBag className="size-5 text-[#96BF48]/70" />
              </div>
              <div>
                <p className="mb-1 text-sm font-semibold text-foreground">No Shopify store connected</p>
                <p className="mb-3 text-xs text-muted-foreground">Connect your store to look up orders here.</p>
                <Link
                  href="/dashboard/integrations"
                  className="text-xs font-semibold text-[#96BF48] transition-colors hover:text-[#7da33a]"
                >
                  Set up Shopify integration →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex size-full flex-col overflow-hidden bg-background">
      <div className="custom-scrollbar flex-1 overflow-y-auto overflow-x-hidden">
        <div className={dashboardPageShellClassName()}>
          <SearchFilterBar
            value={searchInput}
            onValueChange={setSearchInput}
            placeholder="Search by order number or customer email…"
            aria-label="Search orders"
            loading={searchActive && search.isLoading}
            onClear={() => setSearchInput("")}
          />

          {searchActive ? (
            <ShopSearchResults
              orders={searchOrders}
              hasMore={Boolean(search.nextPageInfo)}
              isLoading={search.isLoading}
              isLoadingMore={search.isLoadingMore}
              error={search.error}
              loadMoreError={search.loadMoreError}
              onOpenOrder={openOrder}
              onLoadMore={search.loadMore}
              onRetry={() => { void search.mutate() }}
            />
          ) : (
            <ShopStream
              findings={attention.data?.findings ?? []}
              isLoading={attention.isLoading}
              error={attention.error}
              onOpenOrder={openOrder}
              onRetry={() => { void attention.mutate() }}
            />
          )}
        </div>
      </div>

      <OrderDetailDialog order={selectedOrder} shop={shop} onClose={closeOrder} />
    </div>
  )
}
