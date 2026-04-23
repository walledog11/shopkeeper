"use client"

import { useState, useCallback, useRef } from "react"
import { Search, X, ShoppingBag, AlertCircle } from "lucide-react"
import useSWR from "swr"
import { fetcher } from "@/lib/api/fetcher"
import OrdersTable, { OrdersTableSkeleton } from "./OrdersTable"
import type { OrderRow } from "./OrdersTable"

interface OrdersResponse {
  orders: OrderRow[]
  nextPageInfo: string | null
  shop: string
}

const FULFILLMENT_FILTERS = [
  { id: 'any',         label: 'All' },
  { id: 'unfulfilled', label: 'Unfulfilled' },
  { id: 'fulfilled',   label: 'Fulfilled' },
  { id: 'partial',     label: 'Partial' },
] as const

type FulfillmentFilter = typeof FULFILLMENT_FILTERS[number]['id']

// ── Stat strip ────────────────────────────────────────────────────────────────

function StatStrip({ orders, isLoading }: { orders: OrderRow[]; isLoading: boolean }) {
  const total = orders.length
  const unfulfilled = orders.filter(o => !o.fulfillment_status || o.fulfillment_status === 'unfulfilled' || o.fulfillment_status === 'partial').length
  const pendingPayment = orders.filter(o => o.financial_status === 'pending').length

  const shimmer = 'h-4 w-16 bg-white/[0.07] rounded animate-pulse'

  return (
    <div className="flex items-center gap-5 flex-wrap">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-white/30 font-medium">Total</span>
        {isLoading
          ? <div className={shimmer} />
          : <span className="text-sm font-bold text-white/70">{total}</span>}
      </div>
      <div className="w-px h-4 bg-white/[0.08]" />
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
        <span className="text-[11px] text-white/30 font-medium">Unfulfilled</span>
        {isLoading
          ? <div className={shimmer} />
          : <span className={`text-sm font-bold ${unfulfilled > 0 ? 'text-amber-400' : 'text-white/40'}`}>{unfulfilled}</span>}
      </div>
      {pendingPayment > 0 && (
        <>
          <div className="w-px h-4 bg-white/[0.08]" />
          <div className="flex items-center gap-2">
            <AlertCircle className="w-3 h-3 text-white/30" />
            <span className="text-[11px] text-white/30 font-medium">Awaiting payment</span>
            <span className="text-sm font-bold text-white/50">{pendingPayment}</span>
          </div>
        </>
      )}
    </div>
  )
}

// ── Main client ───────────────────────────────────────────────────────────────

export default function OrdersPageClient() {
  const [fulfillmentFilter, setFulfillmentFilter] = useState<FulfillmentFilter>('any')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Accumulated pages for load-more
  const [pages, setPages] = useState<OrderRow[][]>([])
  const [nextPageInfo, setNextPageInfo] = useState<string | null>(null)
  const [shop, setShop] = useState('')
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  const handleSearchChange = (q: string) => {
    setSearchQuery(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(q)
      setPages([])
      setNextPageInfo(null)
    }, 250)
  }

  const buildKey = () => {
    if (debouncedQuery) {
      return `/api/orders?q=${encodeURIComponent(debouncedQuery)}`
    }
    return `/api/orders?fulfillment_status=${fulfillmentFilter}`
  }

  const { data, isLoading, error } = useSWR<OrdersResponse>(
    buildKey(),
    fetcher,
    {
      onSuccess: (d) => {
        setPages([d.orders])
        setNextPageInfo(d.nextPageInfo)
        setShop(d.shop ?? '')
      },
      keepPreviousData: true,
      revalidateOnFocus: false,
    }
  )

  const handleFilterChange = (id: FulfillmentFilter) => {
    setFulfillmentFilter(id)
    setSearchQuery('')
    setDebouncedQuery('')
    setPages([])
    setNextPageInfo(null)
  }

  const loadMore = useCallback(async () => {
    if (!nextPageInfo || isLoadingMore) return
    setIsLoadingMore(true)
    try {
      const res = await fetch(`/api/orders?page_info=${encodeURIComponent(nextPageInfo)}`)
      const d: OrdersResponse = await res.json()
      setPages(prev => [...prev, d.orders])
      setNextPageInfo(d.nextPageInfo)
    } finally {
      setIsLoadingMore(false)
    }
  }, [nextPageInfo, isLoadingMore])

  const allOrders = pages.flat()
  const isSearchMode = debouncedQuery.length > 0

  // ── No integration ────────────────────────────────────────────────────────

  if (error?.message?.includes('404')) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-6">
        <div className="w-12 h-12 rounded-md bg-white/[0.05] border border-white/[0.07] flex items-center justify-center">
          <ShoppingBag className="w-5 h-5 text-[#96BF48]/60" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white/50 mb-1">No Shopify store connected</p>
          <p className="text-xs text-white/30 mb-3">Connect your store to view and manage orders here.</p>
          <a
            href="/dashboard/integrations"
            className="text-xs font-semibold text-[#96BF48] hover:text-[#7da33a] transition-colors"
          >
            Set up Shopify integration →
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">

      {/* Page header */}
      <div className="px-5 pt-5 pb-4 border-b border-border shrink-0 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShoppingBag className="w-4 h-4 text-[#96BF48]" />
              <h1 className="text-sm font-bold text-white/80">Orders</h1>
            </div>
            <StatStrip orders={allOrders} isLoading={isLoading} />
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 bg-white/[0.05] border border-border rounded-md px-3 h-9">
          <Search className="w-3.5 h-3.5 text-white/20 shrink-0" />
          <input
            value={searchQuery}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="Search by order # or email…"
            className="flex-1 bg-transparent text-sm text-white/70 placeholder:text-white/25 outline-none"
          />
          {searchQuery && (
            <button onClick={() => handleSearchChange('')} className="text-white/20 hover:text-white/50 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Fulfillment filters */}
        {!isSearchMode && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {FULFILLMENT_FILTERS.map(f => (
              <button
                key={f.id}
                onClick={() => handleFilterChange(f.id)}
                className={`h-7 px-3 rounded-md border text-[11px] font-semibold transition-all ${
                  fulfillmentFilter === f.id
                    ? 'bg-white/[0.15] text-white border-white/[0.35]'
                    : 'bg-transparent border-border text-white/40 hover:border-white/[0.18] hover:text-white/60'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {/* Search mode label */}
        {isSearchMode && (
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-white/40">
              {isLoading ? 'Searching…' : `${allOrders.length} result${allOrders.length !== 1 ? 's' : ''} for "${debouncedQuery}"`}
            </span>
            <button onClick={() => handleSearchChange('')} className="text-[11px] text-white/30 hover:text-white/60 font-medium">
              Clear
            </button>
          </div>
        )}

        {!isSearchMode && !isLoading && (
          <p className="text-[11px] text-white/25 font-medium">
            {allOrders.length} order{allOrders.length !== 1 ? 's' : ''}
            {fulfillmentFilter !== 'any' ? ` · ${FULFILLMENT_FILTERS.find(f => f.id === fulfillmentFilter)?.label}` : ''}
          </p>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {isLoading && pages.length === 0
          ? <OrdersTableSkeleton />
          : <OrdersTable
              orders={allOrders}
              shop={shop || data?.shop || ''}
              hasMore={!!nextPageInfo}
              isLoadingMore={isLoadingMore}
              onLoadMore={loadMore}
            />
        }
      </div>

    </div>
  )
}
