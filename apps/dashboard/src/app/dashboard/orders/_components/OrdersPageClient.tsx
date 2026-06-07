"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Search, X, ShoppingBag, RefreshCw, Download } from "lucide-react"
import { isApiRequestError } from "@/lib/api/fetcher"
import { formatSyncRelativeTime } from "@/lib/format/date"
import { useCursorListState } from "@/lib/api/use-cursor-list-state"
import OrdersTable, { OrdersTableSkeleton } from "./OrdersTable"
import type { OrderRow } from "./OrdersTable"
import { fetchOrdersPage, type OrdersResponse } from "./order-requests"

const FILTERS = [
  { id: 'all',         label: 'All' },
  { id: 'unfulfilled', label: 'Unfulfilled' },
  { id: 'fulfilled',   label: 'Fulfilled' },
  { id: 'pending',     label: 'Pending' },
  { id: 'refunded',    label: 'Refunded' },
] as const

type FilterId = typeof FILTERS[number]['id']

function filterToQuery(id: FilterId): string {
  switch (id) {
    case 'unfulfilled': return 'fulfillment_status=unfulfilled'
    case 'fulfilled':   return 'fulfillment_status=fulfilled'
    case 'pending':     return 'financial_status=pending'
    case 'refunded':    return 'financial_status=refunded'
    default:            return ''
  }
}

function ordersToCsv(orders: OrderRow[]): string {
  const header = ['Order', 'Customer', 'Email', 'Date', 'Payment', 'Fulfillment', 'Items', 'Total']
  const rows = orders.map(o => [
    o.name,
    o.customer?.name ?? 'Guest',
    o.customer?.email ?? '',
    new Date(o.created_at).toISOString(),
    o.financial_status,
    o.fulfillment_status ?? 'unfulfilled',
    String(o.line_items.reduce((sum, li) => sum + li.quantity, 0)),
    o.total_price,
  ])
  return [header, ...rows]
    .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n')
}

// ── Main client ───────────────────────────────────────────────────────────────

function useOrdersPageState() {
  const [filter, setFilter] = useState<FilterId>('all')
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null)
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  const list = useCursorListState<OrderRow, OrdersResponse>({
    buildUrl: (debouncedQuery) => {
      if (debouncedQuery) {
        return `/api/orders?q=${encodeURIComponent(debouncedQuery)}`
      }
      const qs = filterToQuery(filter)
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

  const handleFilterChange = (id: FilterId) => {
    setFilter(id)
    list.resetSearch()
  }

  const handleExport = () => {
    if (list.allItems.length === 0) return
    const csv = ordersToCsv(list.allItems)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return {
    ...list,
    filter,
    handleExport,
    handleFilterChange,
    lastSyncedAt,
  }
}

export default function OrdersPageClient() {
  const {
    allItems: allOrders,
    error,
    filter,
    handleExport,
    handleFilterChange,
    handleSearchChange,
    isLoading,
    isLoadingMore,
    isSearchMode,
    isValidating,
    lastSyncedAt,
    loadMore,
    loadMoreError,
    mutate,
    nextPageInfo,
    pages,
    searchQuery,
  } = useOrdersPageState()

  // ── No integration ────────────────────────────────────────────────────────

  if (isApiRequestError(error, 404)) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-6">
        <div className="size-12 rounded-md bg-white/[0.05] border border-white/[0.07] flex items-center justify-center">
          <ShoppingBag className="size-5 text-[#96BF48]/60" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white/50 mb-1">No Shopify store connected</p>
          <p className="text-xs text-white/30 mb-3">Connect your store to view and manage orders here.</p>
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
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="px-6 pt-6 pb-8 space-y-5 max-w-[1400px] mx-auto">

          {/* Header */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-baseline gap-3">
              <h1 className="text-2xl font-bold text-white">Orders</h1>
              <p className="text-xs text-white/35">
                Live from Shopify
                {lastSyncedAt && <> · synced {formatSyncRelativeTime(lastSyncedAt)}</>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button"
                onClick={() => mutate()}
                disabled={isValidating}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium text-white/60 hover:text-white hover:bg-white/[0.05] disabled:opacity-40 transition-colors"
              >
                <RefreshCw className={`size-3.5 ${isValidating ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button type="button"
                onClick={handleExport}
                disabled={allOrders.length === 0}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-white/[0.10] bg-white/[0.03] text-xs font-medium text-white/75 hover:bg-white/[0.06] hover:border-white/[0.18] hover:text-white disabled:opacity-40 transition-colors"
              >
                <Download className="size-3.5" />
                Export CSV
              </button>
            </div>
          </div>

          {/* Card: search + filters + table */}
          <div className="rounded-lg border border-white/[0.07] bg-white/[0.015] overflow-hidden">

            {/* Search + filter row */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.05] flex-wrap">
              <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.06] rounded-md px-3 h-8 flex-1 min-w-[260px] max-w-[360px]">
                <Search className="size-3.5 text-white/30 shrink-0" />
                <input
                  aria-label="Search orders"
                  value={searchQuery}
                  onChange={e => handleSearchChange(e.target.value)}
                  placeholder="Search orders, customers, #numbers…"
                  className="flex-1 bg-transparent text-xs text-white/75 placeholder:text-white/30 outline-none"
                />
                {searchQuery && (
                  <button type="button" onClick={() => handleSearchChange('')} className="text-white/25 hover:text-white/55 transition-colors">
                    <X className="size-3.5" />
                  </button>
                )}
              </div>

              {!isSearchMode && (
                <div className="flex items-center gap-1">
                  {FILTERS.map(f => (
                    <button type="button"
                      key={f.id}
                      onClick={() => handleFilterChange(f.id)}
                      className={`h-7 px-3 rounded-md text-xs font-medium transition-all ${
                        filter === f.id
                          ? 'bg-white/[0.10] text-white'
                          : 'text-white/45 hover:text-white/75 hover:bg-white/[0.04]'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              )}

              {isSearchMode && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/40">
                    {isLoading ? 'Searching…' : `${allOrders.length} result${allOrders.length !== 1 ? 's' : ''}`}
                  </span>
                  <button type="button" onClick={() => handleSearchChange('')} className="text-xs text-white/35 hover:text-white/65 font-medium">
                    Clear
                  </button>
                </div>
              )}
            </div>

            {/* Table */}
            {isLoading && pages.length === 0
              ? <OrdersTableSkeleton />
              : <OrdersTable
                  orders={allOrders}
                  hasMore={!!nextPageInfo}
                  isLoadingMore={isLoadingMore}
                  loadMoreError={loadMoreError}
                  onLoadMore={loadMore}
                />
            }
          </div>

        </div>
      </div>
    </div>
  )
}
