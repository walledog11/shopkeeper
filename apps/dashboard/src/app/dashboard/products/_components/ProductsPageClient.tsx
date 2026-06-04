"use client"

import { useState, useRef, useCallback } from "react"
import Link from "next/link"
import {
  Search, X, Package, ShoppingBag,
} from "lucide-react"
import useSWR from "swr"
import {
  errorMessageFromPayload,
  errorMessageFromUnknown,
  fetcher,
  isApiRequestError,
  readJsonResponse,
} from "@/lib/api/fetcher"
import { ProductDrawer } from "./ProductDrawer"
import { ProductListRow } from "./ProductListRow"
import { ProductListSkeleton } from "./ProductListSkeleton"
import { ProductsEmptyState } from "./ProductsEmptyState"
import { STATUS_FILTERS, type ProductRow, type ProductsResponse, type StatusFilter } from "./products-page-utils"

// ── Stat strip ────────────────────────────────────────────────────────────────

function ProductStatStrip({ products, isLoading }: { products: ProductRow[]; isLoading: boolean }) {
  const total = products.length
  const active = products.filter(p => p.status === 'active').length
  const outOfStock = products.filter(p => p.total_inventory <= 0).length

  const shimmer = 'h-4 w-16 bg-white/[0.07] rounded animate-pulse'

  return (
    <div className="flex items-center gap-5 flex-wrap">
      <div className="flex items-center gap-2">
        <span className="text-xs text-white/30 font-medium">Total</span>
        {isLoading
          ? <div className={shimmer} />
          : <span className="text-sm font-bold text-white/70">{total}</span>}
      </div>
      <div className="w-px h-4 bg-white/[0.08]" />
      <div className="flex items-center gap-2">
        <span className="size-1.5 rounded-full bg-green-400 shrink-0" />
        <span className="text-xs text-white/30 font-medium">Active</span>
        {isLoading
          ? <div className={shimmer} />
          : <span className="text-sm font-bold text-white/60">{active}</span>}
      </div>
      {outOfStock > 0 && (
        <>
          <div className="w-px h-4 bg-white/[0.08]" />
          <div className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-red-400 shrink-0" />
            <span className="text-xs text-white/30 font-medium">Out of stock</span>
            {isLoading
              ? <div className={shimmer} />
              : <span className="text-sm font-bold text-red-400">{outOfStock}</span>}
          </div>
        </>
      )}
    </div>
  )
}

// ── Main page client ──────────────────────────────────────────────────────────

function useProductsPageState() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('any')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [pages, setPages] = useState<ProductRow[][]>([])
  const [nextPageInfo, setNextPageInfo] = useState<string | null>(null)
  const [shop, setShop] = useState('')
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<ProductRow | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const drawerProductRef = useRef<ProductRow | null>(null)

  const handleSearchChange = (q: string) => {
    setSearchQuery(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(q)
      setPages([])
      setNextPageInfo(null)
      setLoadMoreError(null)
    }, 250)
  }

  const buildKey = () => {
    if (debouncedQuery) return `/api/shopify/products?q=${encodeURIComponent(debouncedQuery)}`
    if (statusFilter !== 'any') return `/api/shopify/products?status=${statusFilter}`
    return `/api/shopify/products`
  }

  const { data, isLoading, error } = useSWR<ProductsResponse>(
    buildKey(),
    fetcher,
    {
      onSuccess: (d) => {
        setPages([d.products])
        setNextPageInfo(d.nextPageInfo)
        setShop(d.shop ?? '')
      },
      keepPreviousData: true,
      revalidateOnFocus: false,
    }
  )

  const handleFilterChange = (id: StatusFilter) => {
    setStatusFilter(id)
    setSearchQuery('')
    setDebouncedQuery('')
    setPages([])
    setNextPageInfo(null)
    setLoadMoreError(null)
  }

  const loadMore = useCallback(async () => {
    if (!nextPageInfo || isLoadingMore) return
    setIsLoadingMore(true)
    setLoadMoreError(null)
    try {
      const res = await fetch(`/api/shopify/products?page_info=${encodeURIComponent(nextPageInfo)}`)
      const d = await readJsonResponse<ProductsResponse & { error?: unknown }>(res)
      if (!res.ok) {
        throw new Error(errorMessageFromPayload(d, 'Unable to load more products.'))
      }
      if (!d || !Array.isArray(d.products)) {
        throw new Error('Unable to load more products.')
      }
      setPages(prev => [...prev, d.products])
      setNextPageInfo(d.nextPageInfo)
    } catch (error) {
      setLoadMoreError(errorMessageFromUnknown(error, 'Unable to load more products.'))
    } finally {
      setIsLoadingMore(false)
    }
  }, [nextPageInfo, isLoadingMore])

  const openDrawer = (product: ProductRow) => {
    drawerProductRef.current = product
    setSelectedProduct(product)
    setIsDrawerOpen(false)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setIsDrawerOpen(true))
    })
  }

  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false)
    setTimeout(() => {
      setSelectedProduct(null)
      drawerProductRef.current = null
    }, 300)
  }, [])

  const allProducts = pages.flat()
  const isSearchMode = debouncedQuery.length > 0

  return {
    allProducts,
    closeDrawer,
    data,
    debouncedQuery,
    drawerProduct: selectedProduct ?? drawerProductRef.current,
    error,
    handleFilterChange,
    handleSearchChange,
    isDrawerOpen,
    isLoading,
    isLoadingMore,
    isSearchMode,
    loadMore,
    loadMoreError,
    nextPageInfo,
    openDrawer,
    pages,
    searchQuery,
    selectedProduct,
    shop,
    statusFilter,
  }
}

export default function ProductsPageClient() {
  const {
    allProducts,
    closeDrawer,
    data,
    debouncedQuery,
    drawerProduct,
    error,
    handleFilterChange,
    handleSearchChange,
    isDrawerOpen,
    isLoading,
    isLoadingMore,
    isSearchMode,
    loadMore,
    loadMoreError,
    nextPageInfo,
    openDrawer,
    pages,
    searchQuery,
    selectedProduct,
    shop,
    statusFilter,
  } = useProductsPageState()

  // ── No integration ────────────────────────────────────────────────────────

  if (isApiRequestError(error, 404)) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-6">
        <div className="size-12 rounded-md bg-white/[0.05] border border-white/[0.07] flex items-center justify-center">
          <ShoppingBag className="size-5 text-[#96BF48]/60" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white/50 mb-1">No Shopify store connected</p>
          <p className="text-xs text-white/30 mb-3">Connect your store to view your products here.</p>
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

      {/* Page header */}
      <div className="px-5 pt-5 pb-4 border-b border-border shrink-0 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Package className="size-4 text-[#96BF48]" />
              <h1 className="text-sm font-bold text-white/80">Products</h1>
            </div>
            <ProductStatStrip products={allProducts} isLoading={isLoading} />
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 bg-white/[0.05] border border-border rounded-md px-3 h-9">
          <Search className="size-3.5 text-white/20 shrink-0" />
          <input
            aria-label="Search products"
            value={searchQuery}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="Search by product title…"
            className="flex-1 bg-transparent text-sm text-white/70 placeholder:text-white/25 outline-none"
          />
          {searchQuery && (
            <button type="button" onClick={() => handleSearchChange('')} className="text-white/20 hover:text-white/50 transition-colors">
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Status filters */}
        {!isSearchMode && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {STATUS_FILTERS.map(f => (
              <button type="button"
                key={f.id}
                onClick={() => handleFilterChange(f.id)}
                className={`h-7 px-3 rounded-md border text-xs font-semibold transition-all ${
                  statusFilter === f.id
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
            <span className="text-xs font-semibold text-white/40">
              {isLoading ? 'Searching…' : `${allProducts.length} result${allProducts.length !== 1 ? 's' : ''} for "${debouncedQuery}"`}
            </span>
            <button type="button" onClick={() => handleSearchChange('')} className="text-xs text-white/30 hover:text-white/60 font-medium">
              Clear
            </button>
          </div>
        )}

        {!isSearchMode && !isLoading && (
          <p className="text-xs text-white/25 font-medium">
            {allProducts.length}{nextPageInfo ? '+' : ''} product{allProducts.length !== 1 ? 's' : ''}
            {statusFilter !== 'any' ? ` · ${STATUS_FILTERS.find(f => f.id === statusFilter)?.label}` : ''}
          </p>
        )}
      </div>

      {/* Column headers */}
      <div className="hidden sm:grid grid-cols-[1fr_120px_80px_36px] gap-3 px-5 py-2 border-b border-white/[0.05] shrink-0">
        {['Product', 'Price', 'Status', ''].map(h => (
          <span key={h} className="text-xs font-semibold uppercase tracking-wider text-white/20">{h}</span>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-white/[0.05]">
        {isLoading && pages.length === 0 ? (
          <ProductListSkeleton />
        ) : allProducts.length === 0 ? (
          <ProductsEmptyState isSearch={isSearchMode} query={debouncedQuery} />
        ) : (
          <>
            {allProducts.map(product => (
              <div key={product.id}>
                <ProductListRow
                  product={product}
                  isSelected={selectedProduct?.id === product.id}
                  onClick={() => openDrawer(product)}
                />
              </div>
            ))}

            {nextPageInfo && !isSearchMode && (
              <div className="px-5 py-4">
                {loadMoreError && (
                  <p className="mb-2 text-center text-xs text-red-400" aria-live="polite">{loadMoreError}</p>
                )}
                <button type="button"
                  onClick={loadMore}
                  disabled={isLoadingMore}
                  className="w-full text-xs font-semibold text-white/35 hover:text-white/60 disabled:opacity-40 transition-colors py-1"
                >
                  {isLoadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Drawer */}
      {drawerProduct && (
        <ProductDrawer
          product={drawerProduct}
          isOpen={isDrawerOpen}
          onClose={closeDrawer}
          shop={shop || data?.shop || ''}
        />
      )}
    </div>
  )
}
