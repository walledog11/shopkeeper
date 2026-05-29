"use client"

import { useState, useRef, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Search, X, Users, ExternalLink, Copy, Check, Pencil,
  RefreshCw, MessageSquare, Loader2, ShoppingBag,
} from "lucide-react"
import useSWR from "swr"
import { fetcher } from "@/lib/api/fetcher"
import { CustomerAvatar } from "./CustomerAvatar"
import { CustomerDrawer } from "./CustomerDrawer"
import { CustomerListRow } from "./CustomerListRow"
import { CustomerListSkeleton } from "./CustomerListSkeleton"
import { CustomersEmptyState } from "./CustomersEmptyState"
import {
  formatDate,
  formatLTV,
  fulfillmentStyle,
  fullName,
  type CustomerDetailResponse,
  type CustomerRow,
  type CustomersResponse,
  type EditState,
  type ShopifyOrder,
} from "./customers-page-utils"

// ── CopyButton ────────────────────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button type="button"
      onClick={e => {
        e.stopPropagation()
        navigator.clipboard.writeText(value).catch(() => {})
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="text-white/20 hover:text-white/50 transition-colors shrink-0"
      title="Copy"
    >
      {copied ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
    </button>
  )
}

// ── Customer drawer content ───────────────────────────────────────────────────

interface DrawerContentProps {
  customer: CustomerRow
  shop: string
  onClose: () => void
  onCustomerUpdated: (c: Partial<CustomerRow>) => void
}

function DrawerContent(props: DrawerContentProps) {
  return useDrawerContentView(props)
}

function useDrawerContentView({
  customer: initial,
  shop,
  onClose,
  onCustomerUpdated,
}: DrawerContentProps) {
  const { push } = useRouter()

  // Fetch full details + orders
  const { data, mutate } = useSWR<CustomerDetailResponse>(
    `/api/shopify/customer?customerId=${initial.id}`,
    fetcher,
    { revalidateOnFocus: false }
  )

  const customer = data?.customer ?? initial
  const orders: ShopifyOrder[] = data?.orders ?? []
  const detailShop = data?.shop ?? shop
  const isLoadingDetail = !data

  // ── Edit state ────────────────────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const makeDraft = (): EditState => {
    const addr = customer.default_address
    return {
      first_name: customer.first_name ?? "",
      last_name:  customer.last_name  ?? "",
      email:      customer.email      ?? "",
      phone:      customer.phone      ?? "",
      address1:   addr?.address1      ?? "",
      city:       addr?.city          ?? "",
      province:   addr?.province      ?? "",
      zip:        addr?.zip           ?? "",
      country:    addr?.country_name  ?? "",
      note:       "",
    }
  }

  const [draft, setDraft] = useState<EditState>(makeDraft)

  const handleSave = async () => {
    setIsSaving(true)
    setSaveError(null)
    try {
      const res = await fetch("/api/shopify/customer", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: customer.id,
          updates: {
            first_name: draft.first_name,
            last_name:  draft.last_name,
            email:      draft.email,
            phone:      draft.phone || null,
            note:       draft.note  || null,
            address: {
              address1: draft.address1 || null,
              city:     draft.city     || null,
              province: draft.province || null,
              zip:      draft.zip      || null,
              country:  draft.country  || null,
            },
          },
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setSaveError(typeof json.error === "string" ? json.error : "Failed to save.")
        return
      }
      const updated = json.customer
      mutate({ ...data!, customer: { ...customer, ...updated } }, false)
      onCustomerUpdated({
        first_name: updated.first_name,
        last_name:  updated.last_name,
        email:      updated.email,
        phone:      updated.phone ?? null,
      })
      setIsEditing(false)
    } finally {
      setIsSaving(false)
    }
  }

  // ── Start thread ──────────────────────────────────────────────────────────
  const [isStartingThread, setIsStartingThread] = useState(false)

  const handleStartThread = async () => {
    setIsStartingThread(true)
    try {
      const res = await fetch("/api/threads/shopify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopifyCustomerId: String(customer.id),
          customerEmail: customer.email,
          customerName: fullName(customer as CustomerRow),
        }),
      })
      const json = await res.json()
      if (res.ok && json.threadId) {
        push(`/dashboard/tickets?thread=${json.threadId}`)
      }
    } finally {
      setIsStartingThread(false)
    }
  }

  const shopifyAdminUrl = detailShop
    ? `https://${detailShop}/admin/customers/${customer.id}`
    : null

  const addr = customer.default_address
  const hasAddress = !!(addr?.address1 || addr?.city || addr?.province || addr?.zip || addr?.country_name)
  const name = fullName(customer as CustomerRow)
  const ltv = formatLTV(customer.total_spent)

  const inputCls = "w-full text-xs text-white/70 bg-white/[0.06] border border-white/[0.12] rounded px-2 py-1.5 focus:outline-none focus:border-white/[0.25]"
  const labelCls = "text-xs text-white/30 mb-0.5 block"

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-border shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <CustomerAvatar customer={customer as CustomerRow} size="md" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-white/85 truncate leading-tight">{name}</p>
            <p className="text-xs text-white/35 truncate">{customer.email}</p>
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
              <ExternalLink className="size-4" />
            </a>
          )}
          <button type="button"
            onClick={onClose}
            className="text-white/25 hover:text-white/60 transition-colors"
            title="Close"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-5 px-4 py-3 border-b border-border shrink-0">
        <div>
          <p className="text-xs text-white/30 mb-0.5">Lifetime value</p>
          <p className="text-base font-bold text-white/70">{ltv}</p>
        </div>
        <div className="w-px h-8 bg-white/[0.07]" />
        <div>
          <p className="text-xs text-white/30 mb-0.5">Orders</p>
          <p className="text-base font-bold text-white/70">{customer.orders_count}</p>
        </div>
        {customer.phone && (
          <>
            <div className="w-px h-8 bg-white/[0.07]" />
            <div className="min-w-0">
              <p className="text-xs text-white/30 mb-0.5">Phone</p>
              <div className="flex items-center gap-1">
                <p className="text-xs font-medium text-white/60 truncate">{customer.phone}</p>
                <CopyButton value={customer.phone} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-5">

        {/* Contact & address */}
        <section>
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-semibold text-white/30 uppercase tracking-wider">Details</span>
            {!isEditing && (
              <button type="button"
                onClick={() => { setDraft(makeDraft()); setIsEditing(true); setSaveError(null) }}
                className="text-white/25 hover:text-white/55 transition-colors"
                title="Edit customer"
              >
                <Pencil className="size-3.5" />
              </button>
            )}
          </div>

          {isEditing ? (
            <div className="rounded-md border border-white/[0.09] bg-white/[0.03] p-3 space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className={labelCls}>First name</span>
                  <input aria-label="First name" value={draft.first_name} onChange={e => setDraft(d => ({ ...d, first_name: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <span className={labelCls}>Last name</span>
                  <input aria-label="Last name" value={draft.last_name} onChange={e => setDraft(d => ({ ...d, last_name: e.target.value }))} className={inputCls} />
                </div>
              </div>
              <div>
                <span className={labelCls}>Email</span>
                <input aria-label="Email" value={draft.email} onChange={e => setDraft(d => ({ ...d, email: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <span className={labelCls}>Phone</span>
                <input aria-label="Phone" value={draft.phone} onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <span className={labelCls}>Address</span>
                <input aria-label="Address" value={draft.address1} onChange={e => setDraft(d => ({ ...d, address1: e.target.value }))} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className={labelCls}>City</span>
                  <input aria-label="City" value={draft.city} onChange={e => setDraft(d => ({ ...d, city: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <span className={labelCls}>Province</span>
                  <input aria-label="Province" value={draft.province} onChange={e => setDraft(d => ({ ...d, province: e.target.value }))} className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className={labelCls}>ZIP</span>
                  <input aria-label="ZIP" value={draft.zip} onChange={e => setDraft(d => ({ ...d, zip: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <span className={labelCls}>Country</span>
                  <input aria-label="Country" value={draft.country} onChange={e => setDraft(d => ({ ...d, country: e.target.value }))} className={inputCls} />
                </div>
              </div>
              {saveError && <p className="text-xs text-red-400">{saveError}</p>}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button type="button"
                  onClick={() => { setIsEditing(false); setSaveError(null) }}
                  className="text-xs text-white/35 hover:text-white/60 transition-colors"
                >
                  Cancel
                </button>
                <button type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center gap-1 text-xs font-semibold text-white bg-[#96BF48] hover:bg-[#7da33a] disabled:opacity-50 rounded px-2.5 py-1 transition-colors"
                >
                  {isSaving ? <RefreshCw className="size-3 animate-spin" /> : <Check className="size-3" />}
                  Save
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-white/[0.07] bg-white/[0.03] p-3 space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-white/30 shrink-0">Email</span>
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-xs text-white/60 truncate">{customer.email}</span>
                  <CopyButton value={customer.email} />
                </div>
              </div>
              {customer.phone && (
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-white/30 shrink-0">Phone</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-white/60">{customer.phone}</span>
                    <CopyButton value={customer.phone} />
                  </div>
                </div>
              )}
              {hasAddress && (
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs text-white/30 shrink-0 mt-0.5">Address</span>
                  <div className="text-xs text-white/60 text-right space-y-0.5">
                    {addr?.address1 && <p>{addr.address1}</p>}
                    {(addr?.city || addr?.province || addr?.zip) && (
                      <p>{[addr?.city, [addr?.province, addr?.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")}</p>
                    )}
                    {addr?.country_name && <p>{addr.country_name}</p>}
                  </div>
                </div>
              )}
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs text-white/30 shrink-0">Customer since</span>
                <span className="text-xs text-white/50">{formatDate(customer.created_at)}</span>
              </div>
            </div>
          )}
        </section>

        {/* Recent orders */}
        <section>
          <div className="flex items-center gap-2 mb-2.5">
            <ShoppingBag className="size-3 text-[#96BF48]" />
            <span className="text-xs font-semibold text-white/30 uppercase tracking-wider">Recent Orders</span>
          </div>

          {isLoadingDetail ? (
            <div className="space-y-2 animate-pulse">
              {["order-skeleton-1", "order-skeleton-2", "order-skeleton-3"].map(key => (
                <div key={key} className="rounded-md border border-white/[0.07] bg-white/[0.03] p-2.5 space-y-1.5">
                  <div className="h-2.5 w-20 bg-white/[0.08] rounded" />
                  <div className="h-2 w-32 bg-white/[0.05] rounded" />
                  <div className="h-2 w-16 bg-white/[0.05] rounded" />
                </div>
              ))}
            </div>
          ) : orders.length === 0 ? (
            <p className="text-xs text-white/30 italic">No orders found.</p>
          ) : (
            <div className="space-y-2">
              {orders.map(order => {
                const ff = fulfillmentStyle(order.fulfillment_status)
                const adminUrl = detailShop ? `https://${detailShop}/admin/orders/${order.id}` : null
                return (
                  <div key={order.id} className="rounded-md border border-white/[0.07] bg-white/[0.03] p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-bold text-white/70">{order.name}</span>
                        <CopyButton value={order.name} />
                      </div>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${ff.cls}`}>{ff.label}</span>
                    </div>
                    <div className="space-y-0.5">
                      {order.line_items.slice(0, 2).map((li) => (
                        <p key={`${li.title}-${li.quantity}`} className="text-xs text-white/40 truncate">{li.quantity}× {li.title}</p>
                      ))}
                      {order.line_items.length > 2 && (
                        <p className="text-xs text-white/25">+{order.line_items.length - 2} more</p>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white/60">${parseFloat(order.total_price).toFixed(2)}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-white/30">{formatDate(order.created_at)}</span>
                        {adminUrl && (
                          <a href={adminUrl} target="_blank" rel="noopener noreferrer"
                            className="text-white/25 hover:text-white/55 transition-colors">
                            <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {/* Footer action */}
      <div className="px-4 py-3.5 border-t border-border shrink-0">
        <button type="button"
          onClick={handleStartThread}
          disabled={isStartingThread || !customer.email}
          className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-white bg-[#96BF48] hover:bg-[#7da33a] disabled:opacity-40 rounded-md py-2.5 transition-colors"
        >
          {isStartingThread
            ? <Loader2 className="size-4 animate-spin" />
            : <MessageSquare className="size-4" />}
          {isStartingThread ? "Opening…" : "Start Support Thread"}
        </button>
      </div>
    </div>
  )
}

// ── Main page client ──────────────────────────────────────────────────────────

export default function CustomersPageClient() {
  return useCustomersPageClientView()
}

function useCustomersPageClientView() {
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [pages, setPages] = useState<CustomerRow[][]>([])
  const [nextPageInfo, setNextPageInfo] = useState<string | null>(null)
  const [shop, setShop] = useState("")
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Keeps the customer mounted during close animation
  const drawerCustomerRef = useRef<CustomerRow | null>(null)

  const handleSearchChange = (q: string) => {
    setSearchQuery(q)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(q)
      setPages([])
      setNextPageInfo(null)
    }, 150)
  }

  const buildKey = () => {
    if (debouncedQuery.length >= 1) {
      return `/api/shopify/customers?q=${encodeURIComponent(debouncedQuery)}`
    }
    return `/api/shopify/customers`
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
    }
  )

  const openDrawer = (customer: CustomerRow) => {
    drawerCustomerRef.current = customer
    setSelectedCustomer(customer)
    setIsDrawerOpen(false)
    // Mount in the closed position, then flip on the next paint so the
    // browser has a closed state to transition from.
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
    try {
      const res = await fetch(`/api/shopify/customers?page_info=${encodeURIComponent(nextPageInfo)}`)
      const d: CustomersResponse = await res.json()
      setPages(prev => [...prev, d.customers])
      setNextPageInfo(d.nextPageInfo)
    } finally {
      setIsLoadingMore(false)
    }
  }, [nextPageInfo, isLoadingMore])

  const handleCustomerUpdated = useCallback((updated: Partial<CustomerRow>) => {
    setPages(prev => prev.map(page =>
      page.map(c => c.id === selectedCustomer?.id ? { ...c, ...updated } : c)
    ))
    setSelectedCustomer(prev => prev ? { ...prev, ...updated } : prev)
  }, [selectedCustomer?.id])

  const allCustomers = pages.flat()
  const isSearchMode = debouncedQuery.length >= 1

  // ── No integration ────────────────────────────────────────────────────────

  if (error?.message?.includes("404")) {
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

      {/* Page header */}
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

        {/* Search */}
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

      {/* Column headers */}
      <div className="hidden sm:grid grid-cols-[1fr_120px_36px] gap-3 px-5 py-2 border-b border-white/[0.05] shrink-0">
        {["Customer", "Value", ""].map(h => (
          <span key={h} className="text-xs font-semibold uppercase tracking-wider text-white/20">{h}</span>
        ))}
      </div>

      {/* List */}
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

      {/* Drawer */}
      {(selectedCustomer || drawerCustomerRef.current) && (
        <CustomerDrawer
          isOpen={isDrawerOpen}
          onClose={closeDrawer}
        >
          <DrawerContent
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
