"use client"

import { useCallback, useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useCursorListState } from "@/lib/api/use-cursor-list-state"
import { CustomerCard } from "./CustomerCard"
import { CustomerDrawerContent } from "./CustomerDrawerContent"
import { fetchCustomersPage } from "./customer-requests"
import { CustomerListSkeleton } from "./CustomerListSkeleton"
import { CustomersEmptyState } from "./CustomersEmptyState"
import type { CustomerRow, CustomersResponse } from "./customers-page-utils"

function useCustomersPanelState(query: string) {
  const [shop, setShop] = useState("")
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null)

  const { mapItems, ...list } = useCursorListState<CustomerRow, CustomersResponse>({
    buildUrl: () => (
      query.length >= 1
        ? `/api/shopify/customers?q=${encodeURIComponent(query)}`
        : "/api/shopify/customers"
    ),
    fetchPage: async (pageInfo) => {
      const page = await fetchCustomersPage(pageInfo)
      return { items: page.customers, nextPageInfo: page.nextPageInfo }
    },
    loadMoreErrorMessage: "Unable to load more customers.",
    onInitialLoad: (response) => {
      setShop(response.shop ?? "")
    },
    selectInitialPage: (response) => ({
      items: response.customers,
      nextPageInfo: response.nextPageInfo,
    }),
  })

  const closeDrawer = useCallback(() => setSelectedCustomer(null), [])

  const handleCustomerUpdated = useCallback((updated: Partial<CustomerRow>) => {
    mapItems(customer =>
      customer.id === selectedCustomer?.id ? { ...customer, ...updated } : customer
    )
    setSelectedCustomer(prev => prev ? { ...prev, ...updated } : prev)
  }, [mapItems, selectedCustomer?.id])

  return {
    ...list,
    closeDrawer,
    handleCustomerUpdated,
    openDrawer: setSelectedCustomer,
    selectedCustomer,
    shop,
  }
}

export default function CustomersPanel({ query }: { query: string }) {
  const isSearchMode = query.length >= 1
  const {
    allItems: allCustomers,
    closeDrawer,
    data,
    handleCustomerUpdated,
    isLoading,
    isLoadingMore,
    loadMore,
    loadMoreError,
    nextPageInfo,
    openDrawer,
    pages,
    selectedCustomer,
    shop,
  } = useCustomersPanelState(query)

  return (
    <>
      <div className="space-y-5">
        {isSearchMode && (
          <p className="text-xs font-medium text-foreground/40">
            {isLoading ? "Searching…" : `${allCustomers.length} result${allCustomers.length !== 1 ? "s" : ""}`}
          </p>
        )}

        {isLoading && pages.length === 0 ? (
          <CustomerListSkeleton />
        ) : allCustomers.length === 0 ? (
          <CustomersEmptyState isSearch={isSearchMode} query={query} />
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {allCustomers.map(customer => (
                <CustomerCard
                  key={customer.id}
                  customer={customer}
                  isSelected={selectedCustomer?.id === customer.id}
                  onClick={() => openDrawer(customer)}
                />
              ))}
            </div>

            {nextPageInfo && !isSearchMode && (
              <div>
                {loadMoreError && (
                  <p className="mb-2 text-center text-xs text-red-500" aria-live="polite">{loadMoreError}</p>
                )}
                <button type="button"
                  onClick={loadMore}
                  disabled={isLoadingMore}
                  className="w-full py-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                >
                  {isLoadingMore ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <Dialog open={Boolean(selectedCustomer)} onOpenChange={(open) => { if (!open) closeDrawer() }}>
        <DialogContent
          showCloseButton={false}
          className="flex h-[86vh] w-[calc(100%-2rem)] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden rounded-2xl border-border bg-background p-0 shadow-xl sm:max-w-md"
        >
          <DialogTitle className="sr-only">Customer detail</DialogTitle>
          {selectedCustomer ? (
            <CustomerDrawerContent
              customer={selectedCustomer}
              shop={shop || data?.shop || ""}
              onClose={closeDrawer}
              onCustomerUpdated={handleCustomerUpdated}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
