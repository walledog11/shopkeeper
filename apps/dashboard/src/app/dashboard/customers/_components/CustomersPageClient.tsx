"use client"

import { useCallback, useRef, useState } from "react"
import Link from "next/link"
import { Search, Users, X } from "lucide-react"
import useSWR from "swr"
import { errorMessageFromUnknown, fetcher, isApiRequestError } from "@/lib/api/fetcher"
import { CustomerDrawer } from "./CustomerDrawer"
import { CustomerDrawerContent } from "./CustomerDrawerContent"
import { fetchCustomersPage } from "./customer-requests"
import { CustomerListRow } from "./CustomerListRow"
import { CustomerListSkeleton } from "./CustomerListSkeleton"
import { CustomersEmptyState } from "./CustomersEmptyState"
import type { CustomerRow, CustomersResponse } from "./customers-page-utils"

export default function CustomersPageClient() {
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [pages, setPages] = useState<CustomerRow[][]>([])
  const [nextPageInfo, setNextPageInfo] = useState<string | null>(null)
  const [shop, setShop] = useState("")
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const drawerCustomerRef = useRef<CustomerRow | null>(null)

  const handleSearchChange = (q: string) => {
    setSearchQuery(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(q)
      setPages([])
      setNextPageInfo(null)
      setLoadMoreError(null)
    }, 150)
  }

  const buildKey = () => {
    if (debouncedQuery.length >= 1) {
      return `/api/shopify/customers?q=${encodeURIComponent(debouncedQuery)}`
    }
    return "/api/shopify/customers"
  }

  const { data, isLoading, error } = useSWR<CustomersResponse>(
    buildKey(),
    fetcher,
    {
      onSuccess: (d) => {
        setPages([d.customers])
        setNextPageInfo(d.nextPageInfo)
        setShop(d.shop ?? "")
      },
      keepPreviousData: true,
      revalidateOnFocus: false,
    },
  )

  const openDrawer = (customer: CustomerRow) => {
    drawerCustomerRef.current = customer
    setSelectedCustomer(customer)
    setIsDrawerOpen(false)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setIsDrawerOpen(true))
    })
  }

  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false)
    setTimeout(() => {
      setSelectedCustomer(null)
      drawerCustomerRef.current = null
    }, 300)
  }, [])

  const loadMore = useCallback(async () => {
    if (!nextPageInfo || isLoadingMore) return
    setIsLoadingMore(true)
    setLoadMoreError(null)
    try {
      const d = await fetchCustomersPage(nextPageInfo)
      setPages(prev => [...prev, d.customers])
      setNextPageInfo(d.nextPageInfo)
    } catch (error) {
      setLoadMoreError(errorMessageFromUnknown(error, "Unable to load more customers."))
    } finally {
      setIsLoadingMore(false)
    }
  }, [nextPageInfo, isLoadingMore])

  const handleCustomerUpdated = useCallback((updated: Partial<CustomerRow>) => {
    setPages(prev => prev.map(page =>
      page.map(customer => customer.id === selectedCustomer?.id ? { ...customer, ...updated } : customer)
    ))
    setSelectedCustomer(prev => prev ? { ...prev, ...updated } : prev)
  }, [selectedCustomer?.id])

  const allCustomers = pages.flat()
  const isSearchMode = debouncedQuery.length >= 1

  if (isApiRequestError(error, 404)) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-6">
        <div className="size-12 rounded-md bg-white/[0.05] border border-white/[0.07] flex items-center justify-center">
          <Users className="size-5 text-[#96BF48]/60" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white/50 mb-1">No Shopify store connected</p>
          <p className="text-xs text-white/30 mb-3">Connect your store to view and manage customers here.</p>
          <Link href="/dashboard/integrations"
            className="text-xs font-semibold text-[#96BF48] hover:text-[#7da33a] transition-colors">
            Set up Shopify integration →
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      <div className="px-5 pt-5 pb-4 border-b border-border shrink-0 space-y-3">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-[#96BF48]" />
          <h1 className="text-sm font-bold text-white/80">Customers</h1>
          {!isLoading && allCustomers.length > 0 && (
            <span className="text-xs text-white/30 font-medium">
              {isSearchMode
                ? `${allCustomers.length} result${allCustomers.length !== 1 ? "s" : ""}`
                : `${allCustomers.length}${nextPageInfo ? "+" : ""} loaded`}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 bg-white/[0.05] border border-border rounded-md px-3 h-9">
          <Search className="size-3.5 text-white/20 shrink-0" />
          <input
            aria-label="Search customers"
            value={searchQuery}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="Search by name or email…"
            className="flex-1 bg-transparent text-sm text-white/70 placeholder:text-white/25 outline-none"
          />
          {searchQuery && (
            <button type="button" onClick={() => handleSearchChange("")} className="text-white/20 hover:text-white/50 transition-colors">
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="hidden sm:grid grid-cols-[1fr_120px_36px] gap-3 px-5 py-2 border-b border-white/[0.05] shrink-0">
        {["Customer", "Value", ""].map(header => (
          <span key={header} className="text-xs font-semibold uppercase tracking-wider text-white/20">{header}</span>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-white/[0.05]">
        {isLoading && pages.length === 0 ? (
          <CustomerListSkeleton />
        ) : allCustomers.length === 0 ? (
          <CustomersEmptyState isSearch={isSearchMode} query={debouncedQuery} />
        ) : (
          <>
            {allCustomers.map(customer => (
              <div key={customer.id}>
                <CustomerListRow
                  customer={customer}
                  isSelected={selectedCustomer?.id === customer.id}
                  onClick={() => openDrawer(customer)}
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
                  {isLoadingMore ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {(selectedCustomer || drawerCustomerRef.current) && (
        <CustomerDrawer
          isOpen={isDrawerOpen}
          onClose={closeDrawer}
        >
          <CustomerDrawerContent
            customer={(selectedCustomer ?? drawerCustomerRef.current)!}
            shop={shop || data?.shop || ""}
            onClose={closeDrawer}
            onCustomerUpdated={handleCustomerUpdated}
          />
        </CustomerDrawer>
      )}
    </div>
  )
}
