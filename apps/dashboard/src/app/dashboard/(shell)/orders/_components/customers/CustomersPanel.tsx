"use client"

import { useCallback, useRef, useState } from "react"
import { Search, X } from "lucide-react"
import { useCursorListState } from "@/lib/api/use-cursor-list-state"
import { CustomerDrawer } from "./CustomerDrawer"
import { CustomerDrawerContent } from "./CustomerDrawerContent"
import { fetchCustomersPage } from "./customer-requests"
import { CustomerListRow } from "./CustomerListRow"
import { CustomerListSkeleton } from "./CustomerListSkeleton"
import { CustomersEmptyState } from "./CustomersEmptyState"
import type { CustomerRow, CustomersResponse } from "./customers-page-utils"

function useCustomersPanelState() {
  const [shop, setShop] = useState("")
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const drawerCustomerRef = useRef<CustomerRow | null>(null)

  const { mapItems, ...list } = useCursorListState<CustomerRow, CustomersResponse>({
    buildUrl: (debouncedQuery) => (
      debouncedQuery.length >= 1
        ? `/api/shopify/customers?q=${encodeURIComponent(debouncedQuery)}`
        : "/api/shopify/customers"
    ),
    debounceMs: 150,
    fetchPage: async (pageInfo) => {
      const page = await fetchCustomersPage(pageInfo)
      return { items: page.customers, nextPageInfo: page.nextPageInfo }
    },
    loadMoreErrorMessage: "Unable to load more customers.",
    onInitialLoad: (response) => {
      setShop(response.shop ?? "")
    },
    searchMinLength: 1,
    selectInitialPage: (response) => ({
      items: response.customers,
      nextPageInfo: response.nextPageInfo,
    }),
  })

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

  const handleCustomerUpdated = useCallback((updated: Partial<CustomerRow>) => {
    mapItems(customer =>
      customer.id === selectedCustomer?.id ? { ...customer, ...updated } : customer
    )
    setSelectedCustomer(prev => prev ? { ...prev, ...updated } : prev)
  }, [mapItems, selectedCustomer?.id])

  return {
    ...list,
    closeDrawer,
    drawerCustomer: selectedCustomer ?? drawerCustomerRef.current,
    handleCustomerUpdated,
    isDrawerOpen,
    openDrawer,
    selectedCustomer,
    shop,
  }
}

export default function CustomersPanel() {
  const {
    allItems: allCustomers,
    closeDrawer,
    data,
    debouncedQuery,
    drawerCustomer,
    handleCustomerUpdated,
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
    selectedCustomer,
    shop,
  } = useCustomersPanelState()

  return (
    <>
      <div className="space-y-5">
        <div className="flex items-center gap-3 flex-wrap">
          {isSearchMode && (
            <span className="text-xs font-medium text-foreground/40">
              {isLoading ? "Searching…" : `${allCustomers.length} result${allCustomers.length !== 1 ? "s" : ""}`}
            </span>
          )}

          <div className="flex items-center gap-2 bg-foreground/[0.04] border border-border rounded-md px-3 h-9 w-full sm:ml-auto sm:w-[320px]">
            <Search className="size-3.5 text-foreground/25 shrink-0" />
            <input
              aria-label="Search customers"
              value={searchQuery}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder="Search by name or email…"
              className="flex-1 bg-transparent text-sm text-foreground/70 placeholder:text-foreground/30 outline-none min-w-0"
            />
            {searchQuery && (
              <button type="button" onClick={() => handleSearchChange("")} aria-label="Clear search" className="text-foreground/25 hover:text-foreground/50 transition-colors">
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="hidden sm:grid grid-cols-[1fr_120px_36px] gap-3 px-1 pb-1 border-b border-border">
          {["Customer", "Value", ""].map(header => (
            <span key={header} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{header}</span>
          ))}
        </div>

        <div className="divide-y divide-border rounded-xl border border-border overflow-hidden bg-card">
          {isLoading && pages.length === 0 ? (
            <CustomerListSkeleton />
          ) : allCustomers.length === 0 ? (
            <CustomersEmptyState isSearch={isSearchMode} query={debouncedQuery} />
          ) : (
            <>
              {allCustomers.map(customer => (
                <CustomerListRow
                  key={customer.id}
                  customer={customer}
                  isSelected={selectedCustomer?.id === customer.id}
                  onClick={() => openDrawer(customer)}
                />
              ))}

              {nextPageInfo && !isSearchMode && (
                <div className="px-5 py-4 border-t border-border">
                  {loadMoreError && (
                    <p className="mb-2 text-center text-xs text-red-500" aria-live="polite">{loadMoreError}</p>
                  )}
                  <button type="button"
                    onClick={loadMore}
                    disabled={isLoadingMore}
                    className="w-full text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors py-1"
                  >
                    {isLoadingMore ? "Loading…" : "Load more"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {(selectedCustomer || drawerCustomer) && (
        <CustomerDrawer
          isOpen={isDrawerOpen}
          onClose={closeDrawer}
        >
          <CustomerDrawerContent
            customer={drawerCustomer!}
            shop={shop || data?.shop || ""}
            onClose={closeDrawer}
            onCustomerUpdated={handleCustomerUpdated}
          />
        </CustomerDrawer>
      )}
    </>
  )
}
