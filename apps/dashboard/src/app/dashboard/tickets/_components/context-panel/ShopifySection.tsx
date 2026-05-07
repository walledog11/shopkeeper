"use client"

import { useEffect, useRef, useState } from "react"
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

export function ShopifySection({ thread, shopify, onLinkShopifyCustomer }: ShopifySectionProps) {
  const isEmailThread = thread.channelType === 'email'
  const isLinked = !!thread.shopifyCustomerId
  const canLoadCustomer = isEmailThread || isLinked
  const canCreate = !isEmailThread

  const [mode, setMode] = useState<ShopifyMode>('view')
  const [isEditingCustomer, setIsEditingCustomer] = useState(false)

  useEffect(() => {
    setMode('view')
    setIsEditingCustomer(false)
  }, [thread.id])

  const { data, error: customerError, isLoading, mutate } = shopify

  const handleCustomerSaved = (updated: Partial<ShopifyCustomer>) => {
    if (!data?.customer) return
    void mutate({ ...data, customer: { ...data.customer, ...updated } }, false)
  }

  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [isLinking, setIsLinking] = useState<number | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setDebouncedQuery(query), 150)
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
    setQuery('')
    setDebouncedQuery('')
  }

  const handleLink = async (customer: ShopifyCustomerSearchResult) => {
    setIsLinking(customer.id)
    setLinkError(null)
    try {
      await onLinkShopifyCustomer(customer.id.toString())
      clearSearch()
      setMode('view')
    } catch (error) {
      console.error('Failed to link Shopify customer', error)
      setLinkError('Failed to link customer.')
    } finally {
      setIsLinking(null)
    }
  }

  const handleUnlink = async () => {
    setLinkError(null)
    try {
      await onLinkShopifyCustomer(null)
      void mutate(undefined, false)
    } catch (error) {
      console.error('Failed to unlink Shopify customer', error)
      setLinkError('Failed to unlink customer.')
    }
  }

  const exitSearch = () => {
    clearSearch()
    setLinkError(null)
    setMode('view')
  }

  const [createDraft, setCreateDraft] = useState<CreateCustomerDraft>({ first_name: '', last_name: '', email: '' })
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const handleCreate = async () => {
    setIsCreating(true)
    setCreateError(null)
    try {
      const res = await fetch('/api/shopify/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createDraft),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.customer) {
        setCreateError(typeof json.error === 'string' ? json.error : 'Failed to create customer.')
        return
      }
      try {
        await onLinkShopifyCustomer(json.customer.id.toString())
      } catch (error) {
        console.error('Failed to link created Shopify customer', error)
        setCreateError('Customer created, but linking failed.')
        return
      }
      setCreateDraft({ first_name: '', last_name: '', email: '' })
      setMode('view')
    } catch (error) {
      console.error('Failed to create Shopify customer', error)
      setCreateError('Failed to create customer.')
    } finally {
      setIsCreating(false)
    }
  }

  const dropdownItems: ManageDropdownItem[] = []
  if (isLinked || (isEmailThread && data?.customer)) {
    dropdownItems.push({ label: 'Change customer', icon: <Link className="w-3 h-3" />, onClick: () => setMode('search') })
  } else if (isEmailThread && !isLoading && !data?.customer) {
    dropdownItems.push({ label: 'Link existing customer', icon: <Link className="w-3 h-3" />, onClick: () => setMode('search') })
  }
  if (isLinked) {
    dropdownItems.push({ label: 'Unlink customer', icon: <Unlink className="w-3 h-3" />, onClick: handleUnlink, danger: true })
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
                onClick={() => setIsEditingCustomer(true)}
                className="flex h-6 w-6 items-center justify-center rounded text-white/40 transition-colors hover:bg-white/[0.05] hover:text-white/70"
                aria-label="Edit customer"
                title="Edit customer"
              >
                <Pencil className="w-3 h-3" />
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
        isSearching={isSearching}
        isLinking={isLinking}
        linkError={linkError}
        hasSearchError={!!searchError}
        canCreate={!isEmailThread}
        onQueryChange={setQuery}
        onClear={clearSearch}
        onCancel={exitSearch}
        onCreate={() => setMode('create')}
        onLink={customer => { void handleLink(customer) }}
      />
    )
  } else if (mode === 'create') {
    body = (
      <ShopifyCustomerCreate
        draft={createDraft}
        error={createError}
        isCreating={isCreating}
        onDraftChange={setCreateDraft}
        onBack={() => setMode('search')}
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
          onEditingChange={setIsEditingCustomer}
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
        isSearching={isSearching}
        isLinking={isLinking}
        linkError={linkError}
        hasSearchError={!!searchError}
        canCreate
        onQueryChange={setQuery}
        onClear={clearSearch}
        onCancel={exitSearch}
        onCreate={() => setMode('create')}
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
