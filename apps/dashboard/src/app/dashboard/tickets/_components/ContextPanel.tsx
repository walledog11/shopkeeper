"use client"

import { useState, useEffect, useRef } from "react"
import Image from "next/image"
import { RefreshCw, Pencil, ExternalLink, ShoppingBag, X, Search, UserPlus, Check, Copy, Sparkles } from "lucide-react"
import useSWR from "swr"
import { getChannelInfo } from "@/lib/channels"
import { getCustomerName } from "@/lib/utils"
import { formatDate } from "@/lib/utils"
import { fetcher } from "@/lib/fetcher"
import type { Thread } from "@/types"

interface Props {
  thread: Thread
  hasShopify: boolean
  aiSummary?: string | null
  isRefreshingSummary?: boolean
  onTagUpdate: (tag: string) => void
  onLinkShopifyCustomer: (customerId: string | null) => void
  onRefreshSummary?: () => void
  previousTicketsCount: number
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ShopifyAddress {
  address1: string | null
  city: string | null
  province: string | null
  country_name: string | null
  zip: string | null
}

interface ShopifyCustomer {
  id: number
  first_name: string
  last_name: string
  email: string
  phone: string | null
  note: string | null
  orders_count: number
  total_spent: string
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

interface ShopifyData {
  customer: ShopifyCustomer | null
  orders: ShopifyOrder[]
  shop?: string
}

interface SearchCustomer {
  id: number
  first_name: string
  last_name: string
  email: string
  orders_count: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fulfillmentLabel(status: string | null): { label: string; color: string } {
  switch (status) {
    case 'fulfilled':  return { label: 'Fulfilled',   color: 'text-white bg-green-500 border-green-500' }
    case 'partial':    return { label: 'Partial',     color: 'text-white bg-amber-500 border-amber-500' }
    case 'restocked':  return { label: 'Restocked',   color: 'text-slate-100 bg-slate-400 border-slate-400' }
    default:           return { label: 'Unfulfilled', color: 'text-slate-600 bg-slate-100 border-slate-200' }
  }
}

// ── SectionHeader ─────────────────────────────────────────────────────────────

function SectionHeader({
  icon,
  title,
  action,
  color = 'text-slate-400',
}: {
  icon?: React.ReactNode
  title: string
  action?: React.ReactNode
  color?: string
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        {icon && <span className="shrink-0">{icon}</span>}
        <span className={`text-xs font-medium shrink-0 ${color}`}>{title}</span>
      </div>
      {action && <span className="shrink-0">{action}</span>}
    </div>
  )
}

// ── CopyButton ────────────────────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(value).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      onClick={copy}
      className="text-slate-300 hover:text-slate-500 transition-colors shrink-0"
      title="Copy"
    >
      {copied
        ? <Check className="w-3 h-3 text-green-500" />
        : <Copy className="w-3 h-3" />}
    </button>
  )
}

// ── Customer info card ────────────────────────────────────────────────────────

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

function CustomerInfo({
  customer,
  onSaved,
}: {
  customer: ShopifyCustomer
  onSaved: (updated: Partial<ShopifyCustomer>) => void
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const addr = customer.default_address

  const makeDraft = (): EditState => ({
    first_name: customer.first_name ?? '',
    last_name:  customer.last_name  ?? '',
    email:      customer.email      ?? '',
    phone:      customer.phone      ?? '',
    address1:   addr?.address1      ?? '',
    city:       addr?.city          ?? '',
    province:   addr?.province      ?? '',
    zip:        addr?.zip           ?? '',
    country:    addr?.country_name  ?? '',
    note:       customer.note       ?? '',
  })

  const [draft, setDraft] = useState<EditState>(makeDraft)

  const startEdit = () => {
    setSaveError(null)
    setDraft(makeDraft())
    setIsEditing(true)
  }

  const handleSave = async () => {
    setIsSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/shopify/customer', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
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
      const data = await res.json()
      if (!res.ok) {
        setSaveError(typeof data.error === 'string' ? data.error : 'Failed to save.')
        return
      }
      onSaved({
        first_name:      data.customer.first_name,
        last_name:       data.customer.last_name,
        email:           data.customer.email,
        phone:           data.customer.phone ?? null,
        note:            data.customer.note  ?? null,
        default_address: data.customer.default_address ?? null,
      })
      setIsEditing(false)
    } finally {
      setIsSaving(false)
    }
  }

  const hasAddress = !!(addr?.address1 || addr?.city || addr?.province || addr?.zip || addr?.country_name)
  const fullName = [customer.first_name, customer.last_name].filter(Boolean).join(' ')

  // ── Edit mode ──────────────────────────────────────────────────────────────

  if (isEditing) {
    const inputCls = "w-full text-xs text-slate-800 bg-white border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:border-slate-400"
    const labelCls = "text-[10px] text-slate-400 mb-0.5"
    const f = (label: string, key: keyof EditState, textarea?: boolean) => (
      <div key={key}>
        <p className={labelCls}>{label}</p>
        {textarea ? (
          <textarea
            value={draft[key] as string}
            onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
            rows={3}
            className={`${inputCls} resize-none`}
          />
        ) : (
          <input
            value={draft[key] as string}
            onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
            className={inputCls}
          />
        )}
      </div>
    )

    return (
      <div className="space-y-2.5">
        <div className="rounded-md border border-slate-100 bg-slate-50/60 p-2.5 space-y-2">
          <div className="flex items-center justify-between pb-1 border-b border-slate-100">
            <span className="text-xs text-slate-400 font-medium">Edit customer</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setIsEditing(false); setSaveError(null) }}
                className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-1 text-xs font-semibold text-white bg-[#96BF48] hover:bg-[#7da33a] disabled:opacity-50 rounded px-2 py-0.5 transition-colors"
              >
                {isSaving ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : <Check className="w-2.5 h-2.5" />}
                Save
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {f('First name', 'first_name')}
            {f('Last name',  'last_name')}
          </div>
          {f('Email',   'email')}
          {f('Phone',   'phone')}
          {f('Address', 'address1')}
          <div className="grid grid-cols-2 gap-2">
            {f('City',     'city')}
            {f('Province', 'province')}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {f('ZIP',     'zip')}
            {f('Country', 'country')}
          </div>
          {f('Notes', 'note', true)}
        </div>
        {saveError && <p className="text-xs text-red-500">{saveError}</p>}
      </div>
    )
  }

  // ── View mode ──────────────────────────────────────────────────────────────

  return (
    <div className="rounded-md border border-slate-100 bg-slate-50/60 p-2.5 space-y-2 group relative">
      <button
        onClick={startEdit}
        className="absolute top-2 right-2 text-slate-300 hover:text-slate-500 transition-colors opacity-0 group-hover:opacity-100"
        title="Edit customer"
      >
        <Pencil className="w-3 h-3" />
      </button>

      {fullName && (
        <div>
          <p className="text-[10px] text-slate-400 mb-0.5">Name</p>
          <p className="text-xs text-slate-700">{fullName}</p>
        </div>
      )}

      {customer.email && (
        <div>
          <p className="text-[10px] text-slate-400 mb-0.5">Email</p>
          <div className="flex items-start gap-1">
            <p className="text-xs text-slate-700 flex-1 break-words">{customer.email}</p>
            <CopyButton value={customer.email} />
          </div>
        </div>
      )}

      {customer.phone && (
        <div>
          <p className="text-[10px] text-slate-400 mb-0.5">Phone</p>
          <div className="flex items-start gap-1">
            <p className="text-xs text-slate-700 flex-1">{customer.phone}</p>
            <CopyButton value={customer.phone} />
          </div>
        </div>
      )}

      {hasAddress && (
        <div>
          <p className="text-[10px] text-slate-400 mb-0.5">Address</p>
          <div className="text-xs text-slate-700 space-y-0.5">
            {addr?.address1 && <p>{addr.address1}</p>}
            {(addr?.city || addr?.province || addr?.zip) && (
              <p>{[addr?.city, [addr?.province, addr?.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</p>
            )}
            {addr?.country_name && <p>{addr.country_name}</p>}
          </div>
        </div>
      )}

      {customer.note && (
        <div>
          <p className="text-[10px] text-slate-400 mb-0.5">Notes</p>
          <p className="text-xs text-slate-500 leading-relaxed">{customer.note}</p>
        </div>
      )}
    </div>
  )
}

// ── Order list ────────────────────────────────────────────────────────────────

function OrderList({ orders, shop }: { orders: ShopifyOrder[]; shop?: string }) {
  if (orders.length === 0) {
    return <p className="text-xs text-slate-400 italic">No orders found.</p>
  }
  return (
    <div className="space-y-2">
      {orders.map(order => {
        const { label, color } = fulfillmentLabel(order.fulfillment_status)
        const itemSummary = order.line_items.map(li => `${li.quantity}× ${li.title}`).join(', ')
        const date = new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        const adminUrl = shop ? `https://${shop}/admin/orders/${order.id}` : null
        return (
          <div key={order.id} className="rounded-md border border-slate-100 bg-slate-50/80 p-2.5 space-y-1.5">
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-xs font-bold text-slate-800">{order.name}</span>
                <CopyButton value={order.name} />
              </div>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0 ${color}`}>{label}</span>
            </div>
            <p className="text-xs text-slate-500 truncate" title={itemSummary}>{itemSummary}</p>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">${parseFloat(order.total_price).toFixed(2)}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400">{date}</span>
                {adminUrl && (
                  <a href={adminUrl} target="_blank" rel="noopener noreferrer"
                    className="text-slate-400 hover:text-slate-600 transition-colors" title="View order in Shopify">
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="rounded-md border border-slate-100 bg-slate-50 p-2.5 space-y-2">
        <div className="h-2 w-16 bg-slate-200 rounded" />
        <div className="h-2.5 w-28 bg-slate-200 rounded" />
        <div className="h-2 w-32 bg-slate-100 rounded" />
        <div className="h-2 w-20 bg-slate-100 rounded" />
      </div>
      {[1, 2].map(i => (
        <div key={i} className="rounded-md border border-slate-100 bg-slate-50 p-2.5 space-y-1.5">
          <div className="h-2.5 w-20 bg-slate-200 rounded" />
          <div className="h-2 w-32 bg-slate-100 rounded" />
          <div className="h-2 w-16 bg-slate-100 rounded" />
        </div>
      ))}
    </div>
  )
}

// ── Shopify section (owns the SWR fetch) ──────────────────────────────────────

function ShopifySection({
  thread,
  onLinkShopifyCustomer,
  onCustomerLoaded,
}: {
  thread: Thread
  onLinkShopifyCustomer: (id: string | null) => void
  onCustomerLoaded: (customer: ShopifyCustomer | null) => void
}) {
  const isEmailThread = thread.channelType === 'email'
  const isLinked = !!thread.shopifyCustomerId

  const swrKey = isEmailThread
    ? `/api/shopify/customer?email=${encodeURIComponent(thread.customer.platformId)}`
    : isLinked
      ? `/api/shopify/customer?customerId=${encodeURIComponent(thread.shopifyCustomerId!)}`
      : null

  const { data, isLoading, mutate } = useSWR<ShopifyData>(swrKey, fetcher)

  // Lift customer data to parent for stat strip
  useEffect(() => {
    if (data !== undefined) {
      onCustomerLoaded(data?.customer ?? null)
    }
  }, [data]) // onCustomerLoaded is a stable setState ref

  const handleCustomerSaved = (updated: Partial<ShopifyCustomer>) => {
    if (!data?.customer) return
    mutate({ ...data, customer: { ...data.customer, ...updated } }, false)
  }

  // ── Search state (non-email, not yet linked) ──
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [isLinking, setIsLinking] = useState<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setDebouncedQuery(query), 350)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [query])

  const { data: searchData, isLoading: isSearching } = useSWR<{ customers: SearchCustomer[] }>(
    !isEmailThread && !isLinked && debouncedQuery.length >= 2
      ? `/api/shopify/customers/search?q=${encodeURIComponent(debouncedQuery)}`
      : null,
    fetcher
  )

  const handleLink = async (customer: SearchCustomer) => {
    setIsLinking(customer.id)
    await onLinkShopifyCustomer(customer.id.toString())
    setIsLinking(null)
    setQuery('')
    setDebouncedQuery('')
  }

  const shopifyAdminCustomerUrl = data?.shop && data?.customer
    ? `https://${data.shop}/admin/customers/${data.customer.id}`
    : null

  // ── Section header (always rendered) ─────────────────────────────────────
  const header = (
    <div className="flex items-center gap-2 mb-3">
      <ShoppingBag className="w-3 h-3 text-[#96BF48] shrink-0" />
      <span className="text-xs font-medium text-[#96BF48] shrink-0">Shopify</span>
      <div className="flex-1 h-px bg-slate-100" />
      {shopifyAdminCustomerUrl && (
        <a
          href={shopifyAdminCustomerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-[#96BF48] transition-colors shrink-0"
          title="View customer in Shopify admin"
        >
          <ExternalLink className="w-3 h-3" />
          <span>View</span>
        </a>
      )}
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────────────

  if ((isEmailThread || isLinked) && isLoading) {
    return <>{header}<Skeleton /></>
  }

  if (isEmailThread && !isLoading && !data?.customer) {
    return (
      <>
        {header}
        <p className="text-xs text-slate-400 italic">No Shopify account found for this email.</p>
      </>
    )
  }

  if ((isEmailThread || isLinked) && data?.customer) {
    return (
      <div>
        {header}
        <div className="space-y-4">
          {isLinked && (
            <button
              onClick={() => onLinkShopifyCustomer(null)}
              className="flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-red-400 transition-colors"
            >
              <X className="w-3 h-3" /> Unlink customer
            </button>
          )}
          <CustomerInfo customer={data.customer} onSaved={handleCustomerSaved} />
          <div>
            <p className="text-xs text-slate-400 mb-2">Orders</p>
            <OrderList orders={data.orders} shop={data.shop} />
          </div>
        </div>
      </div>
    )
  }

  // Non-email, no link: search UI
  return (
    <div>
      {header}
      <div className="space-y-2">
        <p className="text-xs text-slate-400">Search your Shopify customers to link one to this conversation.</p>

        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Name or email…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full pl-6 pr-7 py-1.5 text-xs rounded-md border border-slate-200 bg-white focus:outline-none focus:border-slate-400 placeholder:text-slate-300"
          />
          {query && (
            <button onClick={() => { setQuery(''); setDebouncedQuery('') }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {isSearching && (
          <div className="space-y-1.5 animate-pulse">
            {[1, 2].map(i => <div key={i} className="h-8 rounded-md bg-slate-100" />)}
          </div>
        )}

        {searchData?.customers?.length === 0 && (
          <p className="text-xs text-slate-400 italic">No customers found.</p>
        )}

        {searchData?.customers && searchData.customers.length > 0 && (
          <div className="space-y-1">
            {searchData.customers.map(c => {
              const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ') || '—'
              return (
                <button key={c.id} onClick={() => handleLink(c)} disabled={isLinking === c.id}
                  className="w-full flex items-center justify-between gap-2 rounded-md border border-slate-100 bg-slate-50/80 hover:bg-slate-100 hover:border-slate-200 px-2.5 py-2 transition-colors text-left group">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-800 truncate">{fullName}</p>
                    <p className="text-xs text-slate-400 truncate">{c.email || 'No email'}</p>
                  </div>
                  <div className="shrink-0 flex items-center gap-1 text-xs text-slate-400 group-hover:text-[#96BF48] transition-colors">
                    {isLinking === c.id
                      ? <RefreshCw className="w-3 h-3 animate-spin" />
                      : <><UserPlus className="w-3 h-3" /><span className="hidden group-hover:inline font-semibold">Link</span></>
                    }
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function ContextPanel({
  thread, hasShopify,
  aiSummary, isRefreshingSummary, onRefreshSummary,
  onTagUpdate, onLinkShopifyCustomer,
  previousTicketsCount,
}: Props) {
  const channel = getChannelInfo(thread.channelType)
  const name = getCustomerName(thread.customer)
  const initials = name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
  const platformHandle = thread.customer?.platformId || '—'
  // Don't show handle when it's the same as the display name (e.g. email threads)
  const showHandle = platformHandle !== name && platformHandle !== '—'

  const [isEditingTag, setIsEditingTag] = useState(false)
  const [tagDraft, setTagDraft] = useState('')
  const [shopifyCustomer, setShopifyCustomer] = useState<ShopifyCustomer | null>(null)

  // Reset shopify customer stat strip when switching threads
  useEffect(() => {
    setShopifyCustomer(null)
  }, [thread.id])

  const startEditingTag = () => { setTagDraft(thread.tag || ''); setIsEditingTag(true) }
  const saveTag = () => {
    setIsEditingTag(false)
    const trimmed = tagDraft.trim()
    if (trimmed !== (thread.tag ?? '')) onTagUpdate(trimmed)
  }

  return (
    <aside className="w-92 shrink-0 border-l border-slate-200 flex flex-col overflow-y-auto bg-white">

      {/* Customer identity */}
      <div className="flex flex-col items-center text-center px-4 pt-6 pb-5 border-b border-slate-100 gap-2.5">
        <div className="w-14 h-14 rounded-full overflow-hidden bg-slate-900 flex items-center justify-center text-white text-base font-bold shadow-sm shrink-0">
          {thread.customer?.profilePicUrl ? (
            <Image src={thread.customer.profilePicUrl} alt={name} width={56} height={56} className="w-full h-full object-cover" />
          ) : initials}
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900 tracking-tight leading-tight">{name}</p>
          {showHandle && (
            <p className="text-xs text-slate-400 font-mono mt-0.5 truncate max-w-[160px]">
              {thread.channelType === 'email' ? platformHandle : (platformHandle.startsWith('@') ? platformHandle : `@${platformHandle}`)}
            </p>
          )}
        </div>

        {/* Channel badge */}
        <div className="flex items-center gap-1.5 border border-slate-200 rounded-full px-2.5 py-1 bg-slate-50">
          <Image src={channel.logo} alt={channel.name} width={12} height={12} className="object-contain" />
          <span className="text-xs font-medium text-slate-500">{channel.name}</span>
        </div>

        {/* Shopify stat strip */}
        {shopifyCustomer && (
          <p className="text-xs text-slate-400">
            {shopifyCustomer.orders_count} order{shopifyCustomer.orders_count !== 1 ? 's' : ''} · ${parseFloat(shopifyCustomer.total_spent).toFixed(2)} spent
          </p>
        )}

        {/* Previous tickets */}
        {previousTicketsCount > 0 && (
          <p className="text-xs text-slate-400">
            {previousTicketsCount} previous ticket{previousTicketsCount !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Shopify section */}
      {hasShopify && (
        <div className="px-4 py-4 border-b border-slate-100">
          <ShopifySection
            thread={thread}
            onLinkShopifyCustomer={onLinkShopifyCustomer}
            onCustomerLoaded={setShopifyCustomer}
          />
        </div>
      )}

      {/* Conversation meta */}
      <div className="px-4 py-4">
        <SectionHeader title="Conversation" />
        <div className="rounded-md border border-slate-100 bg-slate-50/60 p-2.5 space-y-2.5">
          {aiSummary !== undefined && (
            <div>
              <div className="flex items-center justify-between mb-0.5">
                <div className="flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                  <p className="text-[10px] text-slate-400">AI Summary</p>
                </div>
                {onRefreshSummary && (
                  <button
                    onClick={onRefreshSummary}
                    disabled={isRefreshingSummary}
                    className="text-slate-300 hover:text-amber-500 transition-colors disabled:opacity-40"
                    title="Refresh summary"
                  >
                    <RefreshCw className={`w-2.5 h-2.5 ${isRefreshingSummary ? 'animate-spin' : ''}`} />
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                {aiSummary || <span className="text-slate-400 italic">No summary yet.</span>}
              </p>
            </div>
          )}
          <div>
            <p className="text-[10px] text-slate-400 mb-0.5">Topic</p>
            {isEditingTag ? (
              <input autoFocus value={tagDraft}
                onChange={e => setTagDraft(e.target.value)}
                onBlur={saveTag}
                onKeyDown={e => { if (e.key === 'Enter') saveTag(); if (e.key === 'Escape') setIsEditingTag(false) }}
                maxLength={40}
                className="mt-0.5 w-full text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded px-1.5 py-0.5 outline-none focus:border-slate-500"
              />
            ) : (
              <button onClick={startEditingTag}
                className="mt-0.5 group flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-500 transition-colors text-left">
                <span>{thread.tag || 'General'}</span>
                <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 text-slate-400 shrink-0" />
              </button>
            )}
          </div>
          <div>
            <p className="text-[10px] text-slate-400 mb-1">Status</p>
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full border ${
              thread.status === 'open'
                ? 'text-yellow-700 bg-yellow-50 border-yellow-200'
                : thread.status === 'pending'
                  ? 'text-blue-700 bg-blue-50 border-blue-200'
                  : 'text-green-700 bg-green-50 border-green-200'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                thread.status === 'open'
                  ? 'bg-yellow-500'
                  : thread.status === 'pending'
                    ? 'bg-blue-500'
                    : 'bg-green-500'
              }`} />
              {thread.status.charAt(0).toUpperCase() + thread.status.slice(1)}
            </span>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 mb-0.5">Opened</p>
            <p className="text-xs font-medium text-slate-700">{formatDate(thread.createdAt)}</p>
          </div>
        </div>
      </div>

    </aside>
  )
}
