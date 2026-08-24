"use client"

import { useEffect, useReducer, useRef } from "react"
import useSWR from "swr"
import { Link, Pencil, RefreshCw, Search, Unlink } from "lucide-react"
import { fetcher } from "@/lib/api/fetcher"
import { CustomerInfo } from "./CustomerInfo"
import { ManageDropdown, type ManageDropdownItem } from "./ManageDropdown"
import { SectionHeader } from "./SectionHeader"
import { ShopifyCustomerCreate, type CreateCustomerDraft } from "./ShopifyCustomerCreate"
import { ShopifyCustomerSearch } from "./ShopifyCustomerSearch"
import { ShopifyCustomerSkeleton } from "./ShopifyCustomerSkeleton"
import type { ShopifyCustomerState } from "./useShopifyCustomer"
import { SHOPIFY_LINK_FOCUS_EVENT } from "@/lib/messaging/shopify-link-focus"
import type { ReactNode } from "react"
import type { Thread } from "@/types"
import type { ShopifyCustomer, ShopifyCustomerSearchResult } from "@/types/shopify"
import {
  contextGhostButtonClassName,
  contextIconButtonClassName,
  contextLabelClassName,
  contextTanPanelClassName,
} from "./context-panel-styles"
import { cn } from "@/lib/ui/cn"

type ShopifyMode = 'view' | 'search' | 'create'

interface ShopifySectionProps {
  thread: Thread
  shopify: ShopifyCustomerState
  onLinkShopifyCustomer: (id: string | null) => Promise<void>
  hideHeader?: boolean
  hideStats?: boolean
  leading?: ReactNode
  children?: ReactNode
}

interface ShopifySectionState {
  mode: ShopifyMode
  isEditingCustomer: boolean
  query: string
  debouncedQuery: string
  isLinking: number | null
  linkError: string | null
  createDraft: CreateCustomerDraft
  isCreating: boolean
  createError: string | null
}

type ShopifySectionAction =
  | { type: "mode"; mode: ShopifyMode }
  | { type: "editing"; editing: boolean }
  | { type: "query"; query: string }
  | { type: "debouncedQuery"; query: string }
  | { type: "clearSearch" }
  | { type: "exitSearch" }
  | { type: "linking"; id: number | null }
  | { type: "linkError"; error: string | null }
  | { type: "createDraft"; draft: CreateCustomerDraft }
  | { type: "creating"; creating: boolean }
  | { type: "createError"; error: string | null }
  | { type: "createSuccess" }

const initialShopifyState: ShopifySectionState = {
  mode: 'view',
  isEditingCustomer: false,
  query: '',
  debouncedQuery: '',
  isLinking: null,
  linkError: null,
  createDraft: { first_name: '', last_name: '', email: '' },
  isCreating: false,
  createError: null,
}

function shopifySectionReducer(state: ShopifySectionState, action: ShopifySectionAction): ShopifySectionState {
  switch (action.type) {
    case "mode":
      return { ...state, mode: action.mode }
    case "editing":
      return { ...state, isEditingCustomer: action.editing }
    case "query":
      return { ...state, query: action.query }
    case "debouncedQuery":
      return { ...state, debouncedQuery: action.query }
    case "clearSearch":
      return { ...state, query: '', debouncedQuery: '' }
    case "exitSearch":
      return { ...state, query: '', debouncedQuery: '', linkError: null, mode: 'view' }
    case "linking":
      return { ...state, isLinking: action.id }
    case "linkError":
      return { ...state, linkError: action.error }
    case "createDraft":
      return { ...state, createDraft: action.draft }
    case "creating":
      return { ...state, isCreating: action.creating, createError: action.creating ? null : state.createError }
    case "createError":
      return { ...state, createError: action.error }
    case "createSuccess":
      return { ...state, createDraft: { first_name: '', last_name: '', email: '' }, mode: 'view' }
  }
}

export function ShopifySection({
  thread,
  shopify,
  onLinkShopifyCustomer,
  hideHeader = false,
  hideStats = false,
  leading,
  children,
}: ShopifySectionProps) {
  return (
    <ShopifySectionContent
      key={thread.id}
      thread={thread}
      shopify={shopify}
      onLinkShopifyCustomer={onLinkShopifyCustomer}
      hideHeader={hideHeader}
      hideStats={hideStats}
      leading={leading}
    >
      {children}
    </ShopifySectionContent>
  )
}

function ShopifySectionContent({
  thread,
  shopify,
  onLinkShopifyCustomer,
  hideHeader = false,
  hideStats = false,
  leading,
  children,
}: ShopifySectionProps) {
  const isEmailThread = thread.channelType === 'email'
  const isLinked = !!thread.shopifyCustomerId
  const canLoadCustomer = isEmailThread || isLinked
  const canCreate = !isEmailThread
  const platformHandle = thread.customer?.platformId
  const emailHint = platformHandle?.includes('@') ? platformHandle : null
  const [state, dispatch] = useReducer(shopifySectionReducer, initialShopifyState)
  const {
    mode,
    isEditingCustomer,
    query,
    debouncedQuery,
    isLinking,
    linkError,
    createDraft,
    isCreating,
    createError,
  } = state

  const { data, error: customerError, isLoading, mutate } = shopify

  const handleCustomerSaved = (updated: Partial<ShopifyCustomer>) => {
    if (!data?.customer) return
    void mutate({ ...data, customer: { ...data.customer, ...updated } }, false)
  }

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const handler = () => {
      dispatch({ type: "mode", mode: "search" })
      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    }
    window.addEventListener(SHOPIFY_LINK_FOCUS_EVENT, handler)
    return () => window.removeEventListener(SHOPIFY_LINK_FOCUS_EVENT, handler)
  }, [])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => dispatch({ type: "debouncedQuery", query }), 150)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [query])

  const { data: searchData, error: searchError, isLoading: isSearching } = useSWR<{ customers: ShopifyCustomerSearchResult[] }>(
    mode === 'search' && debouncedQuery.length >= 2
      ? `/api/shopify/customers/search?q=${encodeURIComponent(debouncedQuery)}`
      : null,
    fetcher,
    { keepPreviousData: true },
  )

  const clearSearch = () => {
    dispatch({ type: "clearSearch" })
  }

  const handleLink = async (customer: ShopifyCustomerSearchResult) => {
    dispatch({ type: "linking", id: customer.id })
    dispatch({ type: "linkError", error: null })
    try {
      await onLinkShopifyCustomer(customer.id.toString())
      clearSearch()
      dispatch({ type: "mode", mode: 'view' })
    } catch (error) {
      console.error('Failed to link Shopify customer', error)
      dispatch({ type: "linkError", error: 'Failed to link customer.' })
    } finally {
      dispatch({ type: "linking", id: null })
    }
  }

  const handleUnlink = async () => {
    dispatch({ type: "linkError", error: null })
    try {
      await onLinkShopifyCustomer(null)
      void mutate(undefined, false)
    } catch (error) {
      console.error('Failed to unlink Shopify customer', error)
      dispatch({ type: "linkError", error: 'Failed to unlink customer.' })
    }
  }

  const exitSearch = () => {
    dispatch({ type: "exitSearch" })
  }

  const handleCreate = async () => {
    dispatch({ type: "creating", creating: true })
    try {
      const res = await fetch('/api/shopify/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createDraft),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.customer) {
        dispatch({ type: "createError", error: typeof json.error === 'string' ? json.error : 'Failed to create customer.' })
        return
      }
      try {
        await onLinkShopifyCustomer(json.customer.id.toString())
      } catch (error) {
        console.error('Failed to link created Shopify customer', error)
        dispatch({ type: "createError", error: 'Customer created, but linking failed.' })
        return
      }
      dispatch({ type: "createSuccess" })
    } catch (error) {
      console.error('Failed to create Shopify customer', error)
      dispatch({ type: "createError", error: 'Failed to create customer.' })
    } finally {
      dispatch({ type: "creating", creating: false })
    }
  }

  const dropdownItems: ManageDropdownItem[] = []
  if (data?.customer) {
    dropdownItems.push({ label: 'Change customer', icon: <Link className="size-3" />, onClick: () => dispatch({ type: "mode", mode: 'search' }) })
    if (isLinked) {
      dropdownItems.push({ label: 'Unlink customer', icon: <Unlink className="size-3" />, onClick: handleUnlink, danger: true })
    }
  }

  const headerAction = mode === "search" || mode === "create" ? (
    <button
      type="button"
      onClick={exitSearch}
      className={cn(contextGhostButtonClassName, "hover:bg-[#f5ebe0]")}
    >
      Cancel
    </button>
  ) : data?.customer ? (
    <div className="flex items-center">
      {!isEditingCustomer && mode === "view" && (
        <button
          type="button"
          onClick={() => dispatch({ type: "editing", editing: true })}
          className={contextIconButtonClassName}
          aria-label="Edit customer"
          title="Edit customer"
        >
          <Pencil className="size-3" />
        </button>
      )}
      {dropdownItems.length > 0 && <ManageDropdown items={dropdownItems} />}
    </div>
  ) : dropdownItems.length > 0 ? (
    <ManageDropdown items={dropdownItems} />
  ) : undefined

  let body: ReactNode

  if (canLoadCustomer && isLoading) {
    body = <ShopifyCustomerSkeleton />
  } else if (canLoadCustomer && customerError) {
    body = (
      <ShopifyFallback
        title="Couldn't load from Shopify"
        detail={emailHint}
        searchLabel="Search manually"
        onRetry={() => { void mutate() }}
        onSearch={() => dispatch({ type: "mode", mode: "search" })}
      />
    )
  } else if (mode === 'search') {
    body = (
      <ShopifyCustomerSearch
        query={query}
        customers={searchData?.customers}
        status={{
          searching: isSearching,
          linkingId: isLinking,
          linkError,
          searchError: !!searchError,
          createAllowed: !isEmailThread,
        }}
        onQueryChange={(nextQuery) => dispatch({ type: "query", query: nextQuery })}
        onClear={clearSearch}
        onCreate={() => dispatch({ type: "mode", mode: 'create' })}
        onLink={customer => { void handleLink(customer) }}
      />
    )
  } else if (mode === 'create') {
    body = (
      <ShopifyCustomerCreate
        draft={createDraft}
        error={createError}
        isCreating={isCreating}
        onDraftChange={(draft) => dispatch({ type: "createDraft", draft })}
        onBack={() => dispatch({ type: "mode", mode: 'search' })}
        onCreate={() => { void handleCreate() }}
      />
    )
  } else if (isEmailThread && !isLoading && !data?.customer) {
    body = (
      <ShopifyFallback
        title="No Shopify customer matched"
        detail={emailHint}
        searchLabel="Search Shopify"
        onSearch={() => dispatch({ type: "mode", mode: "search" })}
      />
    )
  } else if (canLoadCustomer && data?.customer) {
    body = (
      <>
        <CustomerInfo
          customer={data.customer}
          isEditing={isEditingCustomer}
          onEditingChange={(editing) => dispatch({ type: "editing", editing })}
          onSaved={handleCustomerSaved}
          showStats={!hideStats}
        />
        {linkError && <p className="mt-2 text-xs text-red-600">{linkError}</p>}
      </>
    )
  } else {
    body = (
      <ShopifyCustomerSearch
        query={query}
        customers={searchData?.customers}
        status={{
          searching: isSearching,
          linkingId: isLinking,
          linkError,
          searchError: !!searchError,
          createAllowed: canCreate,
        }}
        onQueryChange={(nextQuery) => dispatch({ type: "query", query: nextQuery })}
        onClear={clearSearch}
        onCreate={() => dispatch({ type: "mode", mode: 'create' })}
        onLink={customer => { void handleLink(customer) }}
      />
    )
  }

  return (
    <section ref={sectionRef} className="flex flex-col gap-3">
      {hideHeader ? (
        leading || headerAction ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">{leading}</div>
            {headerAction}
          </div>
        ) : null
      ) : (
        <SectionHeader title="Customer" action={headerAction} />
      )}
      {isEditingCustomer || mode === "search" || mode === "create" ? null : children}
      {body}
    </section>
  )
}

interface ShopifyFallbackProps {
  title: string
  detail?: string | null
  searchLabel: string
  onSearch: () => void
  onRetry?: () => void
}

function ShopifyFallback({ title, detail, searchLabel, onSearch, onRetry }: ShopifyFallbackProps) {
  return (
    <div className={cn(contextTanPanelClassName, "text-center")}>
      <p className={contextLabelClassName}>{title}</p>
      {detail && <p className="mt-1 truncate text-xs text-[#6b5d4f]">{detail}</p>}
      <div className="mt-3 flex items-center justify-center gap-1.5">
        {onRetry && (
          <button type="button" onClick={onRetry} className={cn(contextGhostButtonClassName, "inline-flex items-center gap-1.5 bg-white hover:bg-white/70")}>
            <RefreshCw className="size-3.5" /> Try again
          </button>
        )}
        <button type="button" onClick={onSearch} className={cn(contextGhostButtonClassName, "inline-flex items-center gap-1.5 bg-white hover:bg-white/70")}>
          <Search className="size-3.5" /> {searchLabel}
        </button>
      </div>
    </div>
  )
}
