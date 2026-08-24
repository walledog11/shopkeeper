"use client"

import { RefreshCw, Search, UserPlus, X } from "lucide-react"
import { cn } from "@/lib/ui/cn"
import type { ShopifyCustomerSearchResult } from "@/types/shopify"
import {
  contextInputClassName,
  contextResultRowClassName,
  contextTanPanelClassName,
} from "./context-panel-styles"

interface ShopifyCustomerSearchProps {
  query: string
  customers: ShopifyCustomerSearchResult[] | undefined
  status: {
    searching: boolean
    linkingId: number | null
    linkError: string | null
    searchError: boolean
    createAllowed: boolean
  }
  onQueryChange: (query: string) => void
  onClear: () => void
  onCreate: () => void
  onLink: (customer: ShopifyCustomerSearchResult) => void
}

export function ShopifyCustomerSearch({
  query,
  customers,
  status,
  onQueryChange,
  onClear,
  onCreate,
  onLink,
}: ShopifyCustomerSearchProps) {
  const { searching, linkingId, linkError, searchError, createAllowed } = status

  return (
    <div className={cn(contextTanPanelClassName, "space-y-3")}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#6b5d4f]" />
        <input
          aria-label="Name or email"
          type="text"
          placeholder="Name or email…"
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          className={cn(contextInputClassName, "h-10 pl-9 pr-9")}
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2">
          {searching
            ? <RefreshCw className="size-3.5 animate-spin text-[#6b5d4f]" />
            : query
              ? (
                <button
                  type="button"
                  onClick={onClear}
                  className="text-[#6b5d4f] transition-colors hover:text-[#1a1a1a]"
                  aria-label="Clear customer search"
                >
                  <X className="size-3.5" />
                </button>
              )
              : null}
        </span>
      </div>

      {linkError && <p className="text-xs text-red-600">{linkError}</p>}
      {searchError && <p className="text-xs text-red-600">Unable to search customers.</p>}

      {customers?.length === 0 && (
        <p className="text-xs text-[#6b5d4f]">No customers found.</p>
      )}

      {customers && customers.length > 0 && (
        <div className="space-y-1.5">
          {customers.map(customer => {
            const fullName = [customer.first_name, customer.last_name].filter(Boolean).join(" ") || "—"
            return (
              <button
                type="button"
                key={customer.id}
                onClick={() => onLink(customer)}
                disabled={linkingId !== null}
                className={contextResultRowClassName}
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-[#1a1a1a]">{fullName}</p>
                  <p className="truncate text-xs text-[#6b5d4f]">{customer.email || "No email"}</p>
                </div>
                <div className="flex size-8 shrink-0 items-center justify-center text-[#6b5d4f]" aria-hidden="true">
                  {linkingId === customer.id
                    ? <RefreshCw className="size-3.5 animate-spin" />
                    : <UserPlus className="size-3.5" />}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {createAllowed && (
        <button
          type="button"
          onClick={onCreate}
          className="flex h-10 w-full items-center justify-center gap-1.5 rounded-2xl bg-white text-xs font-semibold text-[#1a1a1a] transition-colors hover:bg-white/70"
        >
          <UserPlus className="size-3.5" />
          Create new customer
        </button>
      )}
    </div>
  )
}
