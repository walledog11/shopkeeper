"use client"

import { RefreshCw, Search, UserPlus, X } from "lucide-react"
import type { ShopifyCustomerSearchResult } from "@/types/shopify"

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
  onCancel: () => void
  onCreate: () => void
  onLink: (customer: ShopifyCustomerSearchResult) => void
}

export function ShopifyCustomerSearch({
  query,
  customers,
  status,
  onQueryChange,
  onClear,
  onCancel,
  onCreate,
  onLink,
}: ShopifyCustomerSearchProps) {
  const { searching, linkingId, linkError, searchError, createAllowed } = status

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-foreground/30">Search Shopify customers to link.</p>
        <button type="button" onClick={onCancel} className="text-xs text-foreground/40 hover:text-foreground/70 transition-colors">Cancel</button>
      </div>

      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-foreground/25 pointer-events-none" />
        <input aria-label="Name or email…"
          type="text"
          placeholder="Name or email…"
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          className="w-full pl-6 pr-7 py-1.5 text-xs text-foreground/70 rounded-md border border-foreground/[0.12] bg-foreground/[0.06] focus:outline-none focus:border-foreground/[0.25] placeholder:text-foreground/20"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2">
          {searching
            ? <RefreshCw className="size-3 text-foreground/20 animate-spin" />
            : query
              ? (
                <button
                  type="button"
                  onClick={onClear}
                  className="text-foreground/25 hover:text-foreground/60"
                  aria-label="Clear customer search"
                >
                  <X className="size-3" />
                </button>
              )
              : null}
        </span>
      </div>

      {linkError && <p className="text-xs text-red-400">{linkError}</p>}
      {searchError && <p className="text-xs text-red-400">Unable to search customers.</p>}

      {customers?.length === 0 && (
        <p className="text-xs text-foreground/30">No customers found.</p>
      )}

      {customers && customers.length > 0 && (
        <div className="space-y-1">
          {customers.map(customer => {
            const fullName = [customer.first_name, customer.last_name].filter(Boolean).join(' ') || '-'
            return (
              <button
                type="button"
                key={customer.id}
                onClick={() => onLink(customer)}
                disabled={linkingId !== null}
                className="w-full flex items-center justify-between gap-2 rounded-md border border-foreground/[0.07] bg-foreground/[0.03] hover:bg-foreground/[0.07] hover:border-foreground/[0.12] disabled:opacity-60 px-2.5 py-1.5 transition-colors text-left group"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground/70 truncate">{fullName}</p>
                  <p className="text-xs text-foreground/30 truncate">{customer.email || 'No email'}</p>
                </div>
                <div className="shrink-0 flex size-5 items-center justify-center text-foreground/40 group-hover:text-[#96BF48] transition-colors" aria-hidden="true">
                  {linkingId === customer.id
                    ? <RefreshCw className="size-3 animate-spin" />
                    : <UserPlus className="size-3" />
                  }
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
          className="w-full flex items-center justify-center gap-1.5 text-xs text-foreground/30 hover:text-foreground/60 border border-dashed border-foreground/[0.12] hover:border-foreground/[0.25] rounded-md py-2 transition-colors"
        >
          <UserPlus className="size-3" /> Create new customer
        </button>
      )}
    </div>
  )
}
