"use client"

import { useEffect, useReducer, useRef } from "react"
import useSWR from "swr"
import { Link, Pencil, Unlink } from "lucide-react"
import { fetcher } from "@/lib/api/fetcher"
import { CustomerInfo } from "./CustomerInfo"
import { ManageDropdown, type ManageDropdownItem } from "./ManageDropdown"
import { OrderList } from "./OrderList"
import { SectionHeader } from "./SectionHeader"
import { ShopifyCustomerCreate, type CreateCustomerDraft } from "./ShopifyCustomerCreate"
import { ShopifyCustomerSearch } from "./ShopifyCustomerSearch"
import { ShopifyCustomerSkeleton } from "./ShopifyCustomerSkeleton"
import { panelSectionClass } from "./constants"
import type { ShopifyCustomerState } from "./useShopifyCustomer"
import type { ReactNode } from "react"
import type { Thread } from "@/types"
import type { ShopifyCustomer, ShopifyCustomerSearchResult } from "@/types/shopify"

type ShopifyMode = 'view' | 'search' | 'create'

interface ShopifySectionProps {
  thread: Thread
  shopify: ShopifyCustomerState
  onLinkShopifyCustomer: (id: string | null) => Promise<void>
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

export function ShopifySection({ thread, shopify, onLinkShopifyCustomer }: ShopifySectionProps) {
  return <ShopifySectionContent key={thread.id} thread={thread} shopify={shopify} onLinkShopifyCustomer={onLinkShopifyCustomer} />
}

function ShopifySectionContent({ thread, shopify, onLinkShopifyCustomer }: ShopifySectionProps) {
  const isEmailThread = thread.channelType === 'email'
  const isLinked = !!thread.shopifyCustomerId
  const canLoadCustomer = isEmailThread || isLinked
  const canCreate = !isEmailThread
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
  if (isLinked || (isEmailThread && data?.customer)) {
    dropdownItems.push({ label: 'Change customer', icon: <Link className="size-3" />, onClick: () => dispatch({ type: "mode", mode: 'search' }) })
  } else if (isEmailThread && !isLoading && !data?.customer) {
    dropdownItems.push({ label: 'Link existing customer', icon: <Link className="size-3" />, onClick: () => dispatch({ type: "mode", mode: 'search' }) })
  }
  if (isLinked) {
    dropdownItems.push({ label: 'Unlink customer', icon: <Unlink className="size-3" />, onClick: handleUnlink, danger: true })
  }

  const header = (
    <SectionHeader
      title="CUSTOMER"
      action={
        data?.customer ? (
          <div className="flex items-center ">
            {!isEditingCustomer && mode === 'view' && (
              <button
                type="button"
                onClick={() => dispatch({ type: "editing", editing: true })}
                className="flex size-6 items-center justify-center rounded text-white/40 transition-colors hover:bg-white/[0.05] hover:text-white/70"
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
      }
    />
  )

  let body: ReactNode
  let orderList: ReactNode = null

  if (canLoadCustomer && isLoading) {
    body = <ShopifyCustomerSkeleton />
  } else if (canLoadCustomer && customerError) {
    body = <p className="text-xs text-red-400">Unable to load Shopify customer.</p>
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
        onCancel={exitSearch}
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
    body = <p className="text-xs text-white/40">No Shopify account found for this email.</p>
  } else if (canLoadCustomer && data?.customer) {
    body = (
      <>
        <CustomerInfo
          customer={data.customer}
          isEditing={isEditingCustomer}
          onEditingChange={(editing) => dispatch({ type: "editing", editing })}
          onSaved={handleCustomerSaved}
        />
        {linkError && <p className="mt-2 text-xs text-red-400">{linkError}</p>}
      </>
    )
    orderList = (
      <OrderList
        orders={data.orders}
        shop={data.shop}
        olderOrderCount={Math.max(data.customer.orders_count - data.orders.length, 0)}
      />
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
        onCancel={exitSearch}
        onCreate={() => dispatch({ type: "mode", mode: 'create' })}
        onLink={customer => { void handleLink(customer) }}
      />
    )
  }

  return (
    <>
      <section className={panelSectionClass}>
        {header}
        {body}
      </section>
      {orderList}
    </>
  )
}
