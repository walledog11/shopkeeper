"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  Search, X, Users, ExternalLink, Copy, Check, Pencil,
  RefreshCw, MessageSquare, Loader2, ShoppingBag, ChevronRight,
} from "lucide-react"
import useSWR from "swr"
import { fetcher } from "@/lib/api/fetcher"

// ── Types ─────────────────────────────────────────────────────────────────────

interface ShopifyAddress {
  address1: string | null
  city: string | null
  province: string | null
  country_name: string | null
  zip: string | null
}

interface CustomerRow {
  id: number
  first_name: string
  last_name: string
  email: string
  phone: string | null
  orders_count: number
  total_spent: string
  created_at: string
  default_address: ShopifyAddress | null
}

interface ShopifyOrder {
  id: number
  name: string
  created_at: string
  financial_status: string
  fulfillment_status: string | null
  total_price: string
  line_items: { title: string; quantity: number }[]
}

interface CustomerDetailResponse {
  customer: CustomerRow | null
  orders: ShopifyOrder[]
  shop: string
}

interface CustomersResponse {
  customers: CustomerRow[]
  nextPageInfo: string | null
  shop: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fullName(c: CustomerRow) {
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || "—"
}

function initials(c: CustomerRow) {
  const parts = [c.first_name, c.last_name].filter(Boolean)
  return parts.map(p => p[0]).join("").toUpperCase().slice(0, 2) || "?"
}

function formatLTV(val: string) {
  const n = parseFloat(val)
  if (isNaN(n)) return "$0"
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${n.toFixed(2)}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function locationString(addr: ShopifyAddress | null) {
  if (!addr) return null
  return [addr.city, addr.country_name].filter(Boolean).join(", ") || null
}

function fulfillmentStyle(status: string | null) {
  switch (status) {
    case "fulfilled":  return { label: "Fulfilled",   cls: "text-green-400 bg-green-400/10 border-green-400/20" }
    case "partial":    return { label: "Partial",     cls: "text-amber-400 bg-amber-400/10 border-amber-400/20" }
    case "restocked":  return { label: "Restocked",   cls: "text-white/40 bg-white/[0.06] border-white/[0.10]" }
    default:           return { label: "Unfulfilled", cls: "text-amber-400 bg-amber-400/10 border-amber-400/20" }
  }
}

// ── CopyButton ────────────────────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={e => {
        e.stopPropagation()
        navigator.clipboard.writeText(value).catch(() => {})
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="text-white/20 hover:text-white/50 transition-colors shrink-0"
      title="Copy"
    >
      {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
    </button>
  )
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ customer, size = "md" }: { customer: CustomerRow; size?: "sm" | "md" | "lg" }) {
  const cls = size === "lg" ? "w-12 h-12 text-sm" : size === "sm" ? "w-7 h-7 text-[10px]" : "w-9 h-9 text-xs"
  return (
    <div className={`${cls} rounded-full bg-white/[0.08] border border-white/[0.10] flex items-center justify-center font-bold text-white/60 shrink-0`}>
      {initials(customer)}
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function CustomerListSkeleton() {
  return (
    <div className="divide-y divide-white/[0.05] animate-pulse">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-5 py-3.5">
          <div className="w-9 h-9 rounded-full bg-white/[0.07]" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-32 bg-white/[0.07] rounded" />
            <div className="h-2.5 w-44 bg-white/[0.04] rounded" />
          </div>
          <div className="hidden md:block h-2.5 w-16 bg-white/[0.05] rounded" />
          <div className="h-2.5 w-12 bg-white/[0.06] rounded" />
        </div>
      ))}
    </div>
  )
}

// ── Customer list row ─────────────────────────────────────────────────────────

function CustomerListRow({ customer, isSelected, onClick }: {
  customer: CustomerRow
  isSelected: boolean
  onClick: () => void
}) {
  const name = fullName(customer)
  const location = locationString(customer.default_address)
  const ltv = formatLTV(customer.total_spent)

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors group ${
        isSelected
          ? "bg-white/[0.06]"
          : "hover:bg-white/[0.03]"
      }`}
    >
      <Avatar customer={customer} />

      {/* Name + email + location */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white/80 truncate leading-tight">{name}</p>
        <p className="text-xs text-white/35 truncate mt-0.5">{customer.email}</p>
        {location && (
          <p className="text-[11px] text-white/25 truncate mt-0.5">{location}</p>
        )}
      </div>

      {/* Orders + LTV */}
      <div className="hidden sm:flex flex-col items-end gap-0.5 shrink-0">
        <span className="text-sm font-bold text-white/60">{ltv}</span>
        <span className="text-[11px] text-white/30">
          {customer.orders_count} order{customer.orders_count !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Chevron */}
      <ChevronRight className={`w-4 h-4 shrink-0 transition-colors ${
        isSelected ? "text-white/40" : "text-white/15 group-hover:text-white/30"
      }`} />
    </button>
  )
}

// ── Customer drawer content ───────────────────────────────────────────────────

interface EditState {
  first_name: string
  last_name: string
  email: string
  phone: string
  address1: string
  city: string
  province: string
  zip: string
  country: string
  note: string
}

function DrawerContent({
  customer: initial,
  shop,
  onClose,
  onCustomerUpdated,
}: {
  customer: CustomerRow
  shop: string
  onClose: () => void
  onCustomerUpdated: (c: Partial<CustomerRow>) => void
}) {
  const router = useRouter()

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

  // Sync draft when customer data arrives
  useEffect(() => {
    if (data?.customer) setDraft(makeDraft())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.customer?.id])

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
        router.push(`/dashboard/tickets?thread=${json.threadId}`)
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
  const labelCls = "text-[10px] text-white/30 mb-0.5 block"

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-border shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar customer={customer as CustomerRow} size="md" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-white/85 truncate leading-tight">{name}</p>
            <p className="text-[11px] text-white/35 truncate">{customer.email}</p>
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
          <button
            onClick={onClose}
            className="text-white/25 hover:text-white/60 transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-5 px-4 py-3 border-b border-border shrink-0">
        <div>
          <p className="text-[10px] text-white/30 mb-0.5">Lifetime value</p>
          <p className="text-base font-bold text-white/70">{ltv}</p>
        </div>
        <div className="w-px h-8 bg-white/[0.07]" />
        <div>
          <p className="text-[10px] text-white/30 mb-0.5">Orders</p>
          <p className="text-base font-bold text-white/70">{customer.orders_count}</p>
        </div>
        {customer.phone && (
          <>
            <div className="w-px h-8 bg-white/[0.07]" />
            <div className="min-w-0">
              <p className="text-[10px] text-white/30 mb-0.5">Phone</p>
              <div className="flex items-center gap-1">
                <p className="text-xs font-medium text-white/60 truncate">{customer.phone}</p>
                <CopyButton value={customer.phone} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-5">

        {/* Contact & address */}
        <section>
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-[11px] font-semibold text-white/30 uppercase tracking-wider">Details</span>
            {!isEditing && (
              <button
                onClick={() => { setDraft(makeDraft()); setIsEditing(true); setSaveError(null) }}
                className="text-white/25 hover:text-white/55 transition-colors"
                title="Edit customer"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {isEditing ? (
            <div className="rounded-md border border-white/[0.09] bg-white/[0.03] p-3 space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>First name</label>
                  <input value={draft.first_name} onChange={e => setDraft(d => ({ ...d, first_name: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Last name</label>
                  <input value={draft.last_name} onChange={e => setDraft(d => ({ ...d, last_name: e.target.value }))} className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input value={draft.email} onChange={e => setDraft(d => ({ ...d, email: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Phone</label>
                <input value={draft.phone} onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Address</label>
                <input value={draft.address1} onChange={e => setDraft(d => ({ ...d, address1: e.target.value }))} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>City</label>
                  <input value={draft.city} onChange={e => setDraft(d => ({ ...d, city: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Province</label>
                  <input value={draft.province} onChange={e => setDraft(d => ({ ...d, province: e.target.value }))} className={inputCls} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={labelCls}>ZIP</label>
                  <input value={draft.zip} onChange={e => setDraft(d => ({ ...d, zip: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Country</label>
                  <input value={draft.country} onChange={e => setDraft(d => ({ ...d, country: e.target.value }))} className={inputCls} />
                </div>
              </div>
              {saveError && <p className="text-xs text-red-400">{saveError}</p>}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  onClick={() => { setIsEditing(false); setSaveError(null) }}
                  className="text-xs text-white/35 hover:text-white/60 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="flex items-center gap-1 text-xs font-semibold text-white bg-[#96BF48] hover:bg-[#7da33a] disabled:opacity-50 rounded px-2.5 py-1 transition-colors"
                >
                  {isSaving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  Save
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-white/[0.07] bg-white/[0.03] p-3 space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] text-white/30 shrink-0">Email</span>
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-xs text-white/60 truncate">{customer.email}</span>
                  <CopyButton value={customer.email} />
                </div>
              </div>
              {customer.phone && (
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[10px] text-white/30 shrink-0">Phone</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-white/60">{customer.phone}</span>
                    <CopyButton value={customer.phone} />
                  </div>
                </div>
              )}
              {hasAddress && (
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[10px] text-white/30 shrink-0 mt-0.5">Address</span>
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
                <span className="text-[10px] text-white/30 shrink-0">Customer since</span>
                <span className="text-xs text-white/50">{formatDate(customer.created_at)}</span>
              </div>
            </div>
          )}
        </section>

        {/* Recent orders */}
        <section>
          <div className="flex items-center gap-2 mb-2.5">
            <ShoppingBag className="w-3 h-3 text-[#96BF48]" />
            <span className="text-[11px] font-semibold text-white/30 uppercase tracking-wider">Recent Orders</span>
          </div>

          {isLoadingDetail ? (
            <div className="space-y-2 animate-pulse">
              {[1, 2, 3].map(i => (
                <div key={i} className="rounded-md border border-white/[0.07] bg-white/[0.03] p-2.5 space-y-1.5">
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
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${ff.cls}`}>{ff.label}</span>
                    </div>
                    <div className="space-y-0.5">
                      {order.line_items.slice(0, 2).map((li, i) => (
                        <p key={i} className="text-[11px] text-white/40 truncate">{li.quantity}× {li.title}</p>
                      ))}
                      {order.line_items.length > 2 && (
                        <p className="text-[11px] text-white/25">+{order.line_items.length - 2} more</p>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white/60">${parseFloat(order.total_price).toFixed(2)}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-white/30">{formatDate(order.created_at)}</span>
                        {adminUrl && (
                          <a href={adminUrl} target="_blank" rel="noopener noreferrer"
                            className="text-white/25 hover:text-white/55 transition-colors">
                            <ExternalLink className="w-3 h-3" />
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
        <button
          onClick={handleStartThread}
          disabled={isStartingThread || !customer.email}
          className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-white bg-[#96BF48] hover:bg-[#7da33a] disabled:opacity-40 rounded-md py-2.5 transition-colors"
        >
          {isStartingThread
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <MessageSquare className="w-4 h-4" />}
          {isStartingThread ? "Opening…" : "Start Support Thread"}
        </button>
      </div>
    </div>
  )
}

// ── Customer drawer ───────────────────────────────────────────────────────────

function CustomerDrawer({
  customer,
  isOpen,
  onClose,
  shop,
  onCustomerUpdated,
}: {
  customer: CustomerRow
  isOpen: boolean
  onClose: () => void
  shop: string
  onCustomerUpdated: (c: Partial<CustomerRow>) => void
}) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose])

  return (
    <div className={`fixed inset-0 z-50 transition-opacity duration-300 ${isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 sm:bg-black/30" onClick={onClose} />

      {/* Panel — bottom sheet on mobile, right drawer on desktop */}
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
        <DrawerContent
          customer={customer}
          shop={shop}
          onClose={onClose}
          onCustomerUpdated={onCustomerUpdated}
        />
      </div>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ isSearch, query }: { isSearch: boolean; query: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-10 h-10 rounded-md bg-white/[0.05] border border-white/[0.07] flex items-center justify-center mb-3">
        <Users className="w-4 h-4 text-white/30" />
      </div>
      <p className="text-sm font-semibold text-white/40 mb-1">
        {isSearch ? `No customers match "${query}"` : "No customers found"}
      </p>
      {isSearch && (
        <p className="text-xs text-white/25">Try a different name or email address.</p>
      )}
    </div>
  )
}

// ── Main page client ──────────────────────────────────────────────────────────

export default function CustomersPageClient() {
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
        <div className="w-12 h-12 rounded-md bg-white/[0.05] border border-white/[0.07] flex items-center justify-center">
          <Users className="w-5 h-5 text-[#96BF48]/60" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white/50 mb-1">No Shopify store connected</p>
          <p className="text-xs text-white/30 mb-3">Connect your store to view and manage customers here.</p>
          <a href="/dashboard/integrations"
            className="text-xs font-semibold text-[#96BF48] hover:text-[#7da33a] transition-colors">
            Set up Shopify integration →
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">

      {/* Page header */}
      <div className="px-5 pt-5 pb-4 border-b border-border shrink-0 space-y-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-[#96BF48]" />
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
          <Search className="w-3.5 h-3.5 text-white/20 shrink-0" />
          <input
            value={searchQuery}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="Search by name or email…"
            className="flex-1 bg-transparent text-sm text-white/70 placeholder:text-white/25 outline-none"
          />
          {searchQuery && (
            <button onClick={() => handleSearchChange("")} className="text-white/20 hover:text-white/50 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Column headers */}
      <div className="hidden sm:grid grid-cols-[1fr_120px_36px] gap-3 px-5 py-2 border-b border-white/[0.05] shrink-0">
        {["Customer", "Value", ""].map(h => (
          <span key={h} className="text-[10px] font-semibold uppercase tracking-wider text-white/20">{h}</span>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-white/[0.05]">
        {isLoading && pages.length === 0 ? (
          <CustomerListSkeleton />
        ) : allCustomers.length === 0 ? (
          <EmptyState isSearch={isSearchMode} query={debouncedQuery} />
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
              <div className="px-5 py-4">
                <button
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
          customer={(selectedCustomer ?? drawerCustomerRef.current)!}
          isOpen={isDrawerOpen}
          onClose={closeDrawer}
          shop={shop || data?.shop || ""}
          onCustomerUpdated={handleCustomerUpdated}
        />
      )}
    </div>
  )
}
