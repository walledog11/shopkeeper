"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import Image from "next/image"
import {
  Search, X, Package, ExternalLink, ChevronRight, ShoppingBag,
} from "lucide-react"
import useSWR from "swr"
import { fetcher } from "@/lib/api/fetcher"

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProductVariant {
  id: number
  title: string
  price: string
  sku: string | null
  inventory_quantity: number
  compare_at_price: string | null
}

interface ProductRow {
  id: number
  title: string
  status: string
  vendor: string | null
  product_type: string | null
  tags: string[]
  image: string | null
  variant_count: number
  price_min: number | null
  price_max: number | null
  total_inventory: number
  variants: ProductVariant[]
}

interface ProductsResponse {
  products: ProductRow[]
  nextPageInfo: string | null
  shop: string
}

// ── Filters ───────────────────────────────────────────────────────────────────

const STATUS_FILTERS = [
  { id: 'any',      label: 'All' },
  { id: 'active',   label: 'Active' },
  { id: 'draft',    label: 'Draft' },
  { id: 'archived', label: 'Archived' },
] as const

type StatusFilter = typeof STATUS_FILTERS[number]['id']

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPrice(min: number | null, max: number | null) {
  if (min === null) return '—'
  if (min === max || max === null) return `$${min.toFixed(2)}`
  return `$${min.toFixed(2)} – $${max.toFixed(2)}`
}

function inventoryStyle(qty: number): string {
  if (qty <= 0)  return 'text-red-400'
  if (qty <= 5)  return 'text-amber-400'
  return 'text-green-400'
}

function inventoryLabel(qty: number) {
  if (qty <= 0) return 'Out of stock'
  if (qty <= 5) return `Low (${qty})`
  return String(qty)
}

function statusStyle(status: string) {
  switch (status) {
    case 'active':   return { label: 'Active',   cls: 'text-green-400 bg-green-400/10 border-green-400/20' }
    case 'draft':    return { label: 'Draft',    cls: 'text-white/40 bg-white/[0.06] border-white/[0.10]' }
    case 'archived': return { label: 'Archived', cls: 'text-white/25 bg-white/[0.04] border-white/[0.08]' }
    default:         return { label: status,     cls: 'text-white/40 bg-white/[0.06] border-white/[0.10]' }
  }
}

// ── Stat strip ────────────────────────────────────────────────────────────────

function StatStrip({ products, isLoading }: { products: ProductRow[]; isLoading: boolean }) {
  const total = products.length
  const active = products.filter(p => p.status === 'active').length
  const outOfStock = products.filter(p => p.total_inventory <= 0).length

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
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
        <span className="text-[11px] text-white/30 font-medium">Active</span>
        {isLoading
          ? <div className={shimmer} />
          : <span className="text-sm font-bold text-white/60">{active}</span>}
      </div>
      {outOfStock > 0 && (
        <>
          <div className="w-px h-4 bg-white/[0.08]" />
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
            <span className="text-[11px] text-white/30 font-medium">Out of stock</span>
            {isLoading
              ? <div className={shimmer} />
              : <span className="text-sm font-bold text-red-400">{outOfStock}</span>}
          </div>
        </>
      )}
    </div>
  )
}

// ── Product thumbnail ─────────────────────────────────────────────────────────

function ProductImage({ src, title }: { src: string | null; title: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  if (!src || failedSrc === src) {
    return (
      <div className="w-9 h-9 rounded-md bg-white/[0.06] border border-white/[0.08] flex items-center justify-center shrink-0">
        <Package className="w-4 h-4 text-white/20" />
      </div>
    )
  }
  return (
    <Image
      src={src}
      alt={title}
      width={36}
      height={36}
      unoptimized
      onError={() => setFailedSrc(src)}
      className="w-9 h-9 rounded-md object-cover border border-white/[0.08] shrink-0"
    />
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function ProductListSkeleton() {
  return (
    <div className="divide-y divide-white/[0.05] animate-pulse">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-3.5">
          <div className="w-9 h-9 rounded-md bg-white/[0.07] shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-40 bg-white/[0.07] rounded" />
            <div className="h-2.5 w-24 bg-white/[0.04] rounded" />
          </div>
          <div className="hidden sm:block h-2.5 w-16 bg-white/[0.05] rounded" />
          <div className="h-5 w-16 bg-white/[0.06] rounded-full" />
        </div>
      ))}
    </div>
  )
}

// ── Product list row ──────────────────────────────────────────────────────────

function ProductListRow({ product, isSelected, onClick }: {
  product: ProductRow
  isSelected: boolean
  onClick: () => void
}) {
  const ss = statusStyle(product.status)
  const priceStr = formatPrice(product.price_min, product.price_max)

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors group ${
        isSelected ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
      }`}
    >
      <ProductImage src={product.image} title={product.title} />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white/80 truncate leading-tight">{product.title}</p>
        <p className="text-xs text-white/35 truncate mt-0.5">
          {product.variant_count} variant{product.variant_count !== 1 ? 's' : ''}
          {product.vendor ? ` · ${product.vendor}` : ''}
        </p>
      </div>

      <div className="hidden sm:flex flex-col items-end gap-0.5 shrink-0">
        <span className="text-sm font-bold text-white/60">{priceStr}</span>
        <span className={`text-[11px] ${inventoryStyle(product.total_inventory)}`}>
          {inventoryLabel(product.total_inventory)}
        </span>
      </div>

      <span className={`hidden md:inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${ss.cls}`}>
        {ss.label}
      </span>

      <ChevronRight className={`w-4 h-4 shrink-0 transition-colors ${
        isSelected ? "text-white/40" : "text-white/15 group-hover:text-white/30"
      }`} />
    </button>
  )
}

// ── Drawer content ────────────────────────────────────────────────────────────

function DrawerContent({ product, shop, onClose }: {
  product: ProductRow
  shop: string
  onClose: () => void
}) {
  const ss = statusStyle(product.status)
  const shopifyAdminUrl = shop ? `https://${shop}/admin/products/${product.id}` : null

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-4 py-3.5 border-b border-border shrink-0">
        <div className="flex items-start gap-3 min-w-0">
          <ProductImage src={product.image} title={product.title} />
          <div className="min-w-0">
            <p className="text-sm font-bold text-white/85 leading-tight">{product.title}</p>
            {product.vendor && (
              <p className="text-[11px] text-white/35 mt-0.5">{product.vendor}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {shopifyAdminUrl && (
            <a
              href={shopifyAdminUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/25 hover:text-[#96BF48] transition-colors"
              title="View in Shopify admin"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          <button onClick={onClose} className="text-white/25 hover:text-white/60 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-5 px-4 py-3 border-b border-border shrink-0 flex-wrap">
        <div>
          <p className="text-[10px] text-white/30 mb-0.5">Price</p>
          <p className="text-base font-bold text-white/70">{formatPrice(product.price_min, product.price_max)}</p>
        </div>
        <div className="w-px h-8 bg-white/[0.07]" />
        <div>
          <p className="text-[10px] text-white/30 mb-0.5">Inventory</p>
          <p className={`text-base font-bold ${inventoryStyle(product.total_inventory)}`}>
            {product.total_inventory}
          </p>
        </div>
        <div className="w-px h-8 bg-white/[0.07]" />
        <div>
          <p className="text-[10px] text-white/30 mb-0.5">Status</p>
          <span className={`inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full border ${ss.cls}`}>
            {ss.label}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-5">

        {/* Meta */}
        {(product.product_type || product.tags.length > 0) && (
          <section>
            <span className="text-[11px] font-semibold text-white/30 uppercase tracking-wider">Details</span>
            <div className="mt-2 rounded-md border border-white/[0.07] bg-white/[0.03] p-3 space-y-2">
              {product.product_type && (
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[10px] text-white/30 shrink-0">Type</span>
                  <span className="text-xs text-white/60">{product.product_type}</span>
                </div>
              )}
              {product.tags.length > 0 && (
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[10px] text-white/30 shrink-0 mt-0.5">Tags</span>
                  <div className="flex flex-wrap gap-1 justify-end">
                    {product.tags.map(tag => (
                      <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.09] text-white/50">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Variants */}
        <section>
          <div className="flex items-center gap-2 mb-2.5">
            <Package className="w-3 h-3 text-[#96BF48]" />
            <span className="text-[11px] font-semibold text-white/30 uppercase tracking-wider">
              Variants ({product.variant_count})
            </span>
          </div>

          <div className="rounded-md border border-white/[0.07] overflow-hidden">
            {/* Column headers */}
            <div className="grid grid-cols-[1fr_60px_60px] gap-2 px-3 py-2 border-b border-white/[0.07] bg-white/[0.03]">
              {['Variant', 'Price', 'Stock'].map(h => (
                <span key={h} className="text-[10px] font-semibold uppercase tracking-wider text-white/20">{h}</span>
              ))}
            </div>

            <div className="divide-y divide-white/[0.05]">
              {product.variants.map(v => (
                <div key={v.id} className="grid grid-cols-[1fr_60px_60px] gap-2 items-center px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-xs text-white/70 truncate font-medium">
                      {v.title === 'Default Title' ? product.title : v.title}
                    </p>
                    {v.sku && (
                      <p className="text-[10px] text-white/30 truncate mt-0.5">SKU: {v.sku}</p>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white/60">${parseFloat(v.price).toFixed(2)}</p>
                    {v.compare_at_price && parseFloat(v.compare_at_price) > parseFloat(v.price) && (
                      <p className="text-[10px] text-white/25 line-through">${parseFloat(v.compare_at_price).toFixed(2)}</p>
                    )}
                  </div>
                  <div className="min-w-0">
                    <span className={`text-xs font-semibold ${inventoryStyle(v.inventory_quantity)}`}>
                      {v.inventory_quantity}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

// ── Drawer shell ──────────────────────────────────────────────────────────────

function ProductDrawer({ product, isOpen, onClose, shop }: {
  product: ProductRow
  isOpen: boolean
  onClose: () => void
  shop: string
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose])

  return (
    <div className={`fixed inset-0 z-50 transition-opacity duration-300 ${isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}>
      <div className="absolute inset-0 bg-black/50 sm:bg-black/30" onClick={onClose} />
      <div
        className={`
          absolute bg-background border-border flex flex-col overflow-hidden
          transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]
          bottom-0 left-0 right-0 max-h-[90vh] rounded-t-2xl border-t
          sm:bottom-auto sm:top-0 sm:right-0 sm:left-auto sm:h-full sm:w-96 sm:max-h-none sm:rounded-none sm:border-t-0 sm:border-l
          ${isOpen
            ? "translate-y-0 sm:translate-x-0 opacity-100 scale-100"
            : "translate-y-full sm:translate-y-0 sm:translate-x-[calc(100%+1px)] opacity-0 sm:opacity-100 scale-[0.98] sm:scale-100"
          }
        `}
      >
        <DrawerContent product={product} shop={shop} onClose={onClose} />
      </div>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ isSearch, query }: { isSearch: boolean; query: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-10 h-10 rounded-md bg-white/[0.05] border border-white/[0.07] flex items-center justify-center mb-3">
        <Package className="w-4 h-4 text-white/30" />
      </div>
      <p className="text-sm font-semibold text-white/40 mb-1">
        {isSearch ? `No products match "${query}"` : "No products found"}
      </p>
      {isSearch && (
        <p className="text-xs text-white/25">Try a different title or clear the search.</p>
      )}
    </div>
  )
}

// ── Main page client ──────────────────────────────────────────────────────────

export default function ProductsPageClient() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('any')
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [pages, setPages] = useState<ProductRow[][]>([])
  const [nextPageInfo, setNextPageInfo] = useState<string | null>(null)
  const [shop, setShop] = useState('')
  const [isLoadingMore, setIsLoadingMore] = useState(false)
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
  }

  const loadMore = useCallback(async () => {
    if (!nextPageInfo || isLoadingMore) return
    setIsLoadingMore(true)
    try {
      const res = await fetch(`/api/shopify/products?page_info=${encodeURIComponent(nextPageInfo)}`)
      const d: ProductsResponse = await res.json()
      setPages(prev => [...prev, d.products])
      setNextPageInfo(d.nextPageInfo)
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

  // ── No integration ────────────────────────────────────────────────────────

  if (error?.message?.includes('404')) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-6">
        <div className="w-12 h-12 rounded-md bg-white/[0.05] border border-white/[0.07] flex items-center justify-center">
          <ShoppingBag className="w-5 h-5 text-[#96BF48]/60" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white/50 mb-1">No Shopify store connected</p>
          <p className="text-xs text-white/30 mb-3">Connect your store to view your products here.</p>
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
              <Package className="w-4 h-4 text-[#96BF48]" />
              <h1 className="text-sm font-bold text-white/80">Products</h1>
            </div>
            <StatStrip products={allProducts} isLoading={isLoading} />
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 bg-white/[0.05] border border-border rounded-md px-3 h-9">
          <Search className="w-3.5 h-3.5 text-white/20 shrink-0" />
          <input
            value={searchQuery}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="Search by product title…"
            className="flex-1 bg-transparent text-sm text-white/70 placeholder:text-white/25 outline-none"
          />
          {searchQuery && (
            <button onClick={() => handleSearchChange('')} className="text-white/20 hover:text-white/50 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Status filters */}
        {!isSearchMode && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {STATUS_FILTERS.map(f => (
              <button
                key={f.id}
                onClick={() => handleFilterChange(f.id)}
                className={`h-7 px-3 rounded-md border text-[11px] font-semibold transition-all ${
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
            <span className="text-[11px] font-semibold text-white/40">
              {isLoading ? 'Searching…' : `${allProducts.length} result${allProducts.length !== 1 ? 's' : ''} for "${debouncedQuery}"`}
            </span>
            <button onClick={() => handleSearchChange('')} className="text-[11px] text-white/30 hover:text-white/60 font-medium">
              Clear
            </button>
          </div>
        )}

        {!isSearchMode && !isLoading && (
          <p className="text-[11px] text-white/25 font-medium">
            {allProducts.length}{nextPageInfo ? '+' : ''} product{allProducts.length !== 1 ? 's' : ''}
            {statusFilter !== 'any' ? ` · ${STATUS_FILTERS.find(f => f.id === statusFilter)?.label}` : ''}
          </p>
        )}
      </div>

      {/* Column headers */}
      <div className="hidden sm:grid grid-cols-[1fr_120px_80px_36px] gap-3 px-5 py-2 border-b border-white/[0.05] shrink-0">
        {['Product', 'Price', 'Status', ''].map(h => (
          <span key={h} className="text-[10px] font-semibold uppercase tracking-wider text-white/20">{h}</span>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-white/[0.05]">
        {isLoading && pages.length === 0 ? (
          <ProductListSkeleton />
        ) : allProducts.length === 0 ? (
          <EmptyState isSearch={isSearchMode} query={debouncedQuery} />
        ) : (
          <>
            {allProducts.map(product => (
              <ProductListRow
                key={product.id}
                product={product}
                isSelected={selectedProduct?.id === product.id}
                onClick={() => openDrawer(product)}
              />
            ))}

            {nextPageInfo && !isSearchMode && (
              <div className="px-5 py-4">
                <button
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
      {(selectedProduct || drawerProductRef.current) && (
        <ProductDrawer
          product={(selectedProduct ?? drawerProductRef.current)!}
          isOpen={isDrawerOpen}
          onClose={closeDrawer}
          shop={shop || data?.shop || ''}
        />
      )}
    </div>
  )
}
