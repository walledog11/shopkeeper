"use client"

import { useState, useEffect, useRef } from "react"
import Image from "next/image"
import { RefreshCw, Pencil, ExternalLink, ShoppingBag, X, Search, UserPlus, Check, Copy, Sparkles, MoreHorizontal, Link, Unlink } from "lucide-react"
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
    case 'restocked':  return { label: 'Restocked',   color: 'text-white/50 bg-white/[0.08] border-white/[0.12]' }
    default:           return { label: 'Unfulfilled', color: 'text-amber-400 bg-amber-400/10 border-amber-400/20' }
  }
}

// ── SectionHeader ─────────────────────────────────────────────────────────────

function SectionHeader({
  icon,
  title,
  action,
  color = 'text-white/30',
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
      className="text-white/20 hover:text-white/50 transition-colors shrink-0"
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
    const inputCls = "w-full text-xs text-white/70 bg-white/[0.06] border border-white/[0.12] rounded px-1.5 py-1 focus:outline-none focus:border-white/[0.25]"
    const labelCls = "text-[10px] text-white/30 mb-0.5"
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
        <div className="rounded-md border border-white/[0.07] bg-white/[0.03] p-2.5 space-y-2">
          <div className="flex items-center justify-between pb-1 border-b border-white/[0.07]">
            <span className="text-xs text-white/30 font-medium">Edit customer</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setIsEditing(false); setSaveError(null) }}
                className="text-xs text-white/30 hover:text-white/60 transition-colors"
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
    <div className="rounded-md border border-white/[0.07] bg-white/[0.03] p-2.5 space-y-2 group relative">
      <button
        onClick={startEdit}
        className="absolute top-2 right-2 text-white/20 hover:text-white/50 transition-colors opacity-0 group-hover:opacity-100"
        title="Edit customer"
      >
        <Pencil className="w-3 h-3" />
      </button>

      {fullName && (
        <div>
          <p className="text-[10px] text-white/30 mb-0.5">Name</p>
          <p className="text-xs text-white/60">{fullName}</p>
        </div>
      )}

      {customer.email && (
        <div>
          <p className="text-[10px] text-white/30 mb-0.5">Email</p>
          <div className="flex items-start gap-1">
            <p className="text-xs text-white/60 flex-1 break-words">{customer.email}</p>
            <CopyButton value={customer.email} />
          </div>
        </div>
      )}

      {customer.phone && (
        <div>
          <p className="text-[10px] text-white/30 mb-0.5">Phone</p>
          <div className="flex items-start gap-1">
            <p className="text-xs text-white/60 flex-1">{customer.phone}</p>
            <CopyButton value={customer.phone} />
          </div>
        </div>
      )}

      {hasAddress && (
        <div>
          <p className="text-[10px] text-white/30 mb-0.5">Address</p>
          <div className="text-xs text-white/60 space-y-0.5">
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
          <p className="text-[10px] text-white/30 mb-0.5">Notes</p>
          <p className="text-xs text-white/40 leading-relaxed">{customer.note}</p>
        </div>
      )}
    </div>
  )
}

// ── Order list ────────────────────────────────────────────────────────────────

function OrderList({ orders, shop }: { orders: ShopifyOrder[]; shop?: string }) {
  if (orders.length === 0) {
    return <p className="text-xs text-white/30 italic">No orders found.</p>
  }
  return (
    <div className="space-y-2">
      {orders.map(order => {
        const { label, color } = fulfillmentLabel(order.fulfillment_status)
        const itemSummary = order.line_items.map(li => `${li.quantity}× ${li.title}`).join(', ')
        const date = new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        const adminUrl = shop ? `https://${shop}/admin/orders/${order.id}` : null
        return (
          <div key={order.id} className="rounded-md border border-white/[0.07] bg-white/[0.03] p-2.5 space-y-1.5">
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-xs font-bold text-white/70">{order.name}</span>
                <CopyButton value={order.name} />
              </div>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0 ${color}`}>{label}</span>
            </div>
            <p className="text-xs text-white/40 truncate" title={itemSummary}>{itemSummary}</p>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white/60">${parseFloat(order.total_price).toFixed(2)}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-white/30">{date}</span>
                {adminUrl && (
                  <a href={adminUrl} target="_blank" rel="noopener noreferrer"
                    className="text-white/30 hover:text-white/60 transition-colors" title="View order in Shopify">
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
      <div className="rounded-md border border-white/[0.07] bg-white/[0.03] p-2.5 space-y-2">
        <div className="h-2 w-16 bg-white/[0.08] rounded" />
        <div className="h-2.5 w-28 bg-white/[0.08] rounded" />
        <div className="h-2 w-32 bg-white/[0.05] rounded" />
        <div className="h-2 w-20 bg-white/[0.05] rounded" />
      </div>
      {[1, 2].map(i => (
        <div key={i} className="rounded-md border border-white/[0.07] bg-white/[0.03] p-2.5 space-y-1.5">
          <div className="h-2.5 w-20 bg-white/[0.08] rounded" />
          <div className="h-2 w-32 bg-white/[0.05] rounded" />
          <div className="h-2 w-16 bg-white/[0.05] rounded" />
        </div>
      ))}
    </div>
  )
}

// ── Manage dropdown ───────────────────────────────────────────────────────────

function ManageDropdown({ items }: {
  items: { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }[]
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="text-white/30 hover:text-white/60 transition-colors"
        title="Manage customer"
      >
        <MoreHorizontal className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-5 z-10 w-44 rounded-md border border-white/[0.09] bg-popover shadow-md py-1">
          {items.map(item => (
            <button
              key={item.label}
              onClick={() => { item.onClick(); setOpen(false) }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors ${
                item.danger
                  ? 'text-white/50 hover:text-red-400 hover:bg-red-400/[0.08]'
                  : 'text-white/60 hover:bg-white/[0.05]'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
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

  // mode: 'view' = default, 'search' = link/change flow, 'create' = new customer form
  const [mode, setMode] = useState<'view' | 'search' | 'create'>('view')

  // Reset mode when thread changes
  useEffect(() => { setMode('view') }, [thread.id])

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

  // ── Search state ──
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [isLinking, setIsLinking] = useState<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setDebouncedQuery(query), 150)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [query])

  const { data: searchData, isLoading: isSearching } = useSWR<{ customers: SearchCustomer[] }>(
    mode === 'search' && debouncedQuery.length >= 2
      ? `/api/shopify/customers/search?q=${encodeURIComponent(debouncedQuery)}`
      : null,
    fetcher,
    { keepPreviousData: true }
  )

  const handleLink = async (customer: SearchCustomer) => {
    setIsLinking(customer.id)
    await onLinkShopifyCustomer(customer.id.toString())
    setIsLinking(null)
    setQuery('')
    setDebouncedQuery('')
    setMode('view')
  }

  const exitSearch = () => {
    setQuery('')
    setDebouncedQuery('')
    setMode('view')
  }

  // ── Create state ──
  const [createDraft, setCreateDraft] = useState({ first_name: '', last_name: '', email: '' })
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
      const json = await res.json()
      if (!res.ok || !json.customer) {
        setCreateError(typeof json.error === 'string' ? json.error : 'Failed to create customer.')
        return
      }
      await onLinkShopifyCustomer(json.customer.id.toString())
      setCreateDraft({ first_name: '', last_name: '', email: '' })
      setMode('view')
    } finally {
      setIsCreating(false)
    }
  }

  const shopifyAdminCustomerUrl = data?.shop && data?.customer
    ? `https://${data.shop}/admin/customers/${data.customer.id}`
    : null

  // ── Dropdown items by state ───────────────────────────────────────────────
  const dropdownItems = isLinked || (isEmailThread && data?.customer)
    ? [
        { label: 'Change customer', icon: <Link className="w-3 h-3" />, onClick: () => setMode('search') },
        { label: 'Unlink customer', icon: <Unlink className="w-3 h-3" />, onClick: () => onLinkShopifyCustomer(null), danger: true },
      ]
    : isEmailThread && !isLoading && !data?.customer
      ? [{ label: 'Link existing customer', icon: <Link className="w-3 h-3" />, onClick: () => setMode('search') }]
      : []

  // ── Section header (always rendered) ─────────────────────────────────────
  const header = (
    <div className="flex items-center gap-2 mb-3">
      <ShoppingBag className="w-3 h-3 text-[#96BF48] shrink-0" />
      <span className="text-xs font-medium text-[#96BF48] shrink-0">Shopify</span>
      <div className="flex-1 h-px bg-white/[0.07]" />
      {shopifyAdminCustomerUrl && (
        <a
          href={shopifyAdminCustomerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-white/30 hover:text-[#96BF48] transition-colors shrink-0"
          title="View customer in Shopify admin"
        >
          <ExternalLink className="w-3 h-3" />
          <span>View</span>
        </a>
      )}
      {dropdownItems.length > 0 && <ManageDropdown items={dropdownItems} />}
    </div>
  )

  // ── Search UI (shared across all channels) ────────────────────────────────
  const searchUI = (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-white/30">Search Shopify customers to link.</p>
        <button onClick={exitSearch} className="text-xs text-white/30 hover:text-white/60 transition-colors">Cancel</button>
      </div>

      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-white/25 pointer-events-none" />
        <input
          autoFocus
          type="text"
          placeholder="Name or email…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full pl-6 pr-7 py-1.5 text-xs text-white/70 rounded-md border border-white/[0.12] bg-white/[0.06] focus:outline-none focus:border-white/[0.25] placeholder:text-white/20"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2">
          {isSearching
            ? <RefreshCw className="w-3 h-3 text-white/20 animate-spin" />
            : query
              ? <button onClick={() => { setQuery(''); setDebouncedQuery('') }} className="text-white/20 hover:text-white/50"><X className="w-3 h-3" /></button>
              : null}
        </span>
      </div>

      {searchData?.customers?.length === 0 && (
        <p className="text-xs text-white/30 italic">No customers found.</p>
      )}

      {searchData?.customers && searchData.customers.length > 0 && (
        <div className="space-y-1">
          {searchData.customers.map(c => {
            const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ') || '—'
            return (
              <button key={c.id} onClick={() => handleLink(c)} disabled={isLinking === c.id}
                className="w-full flex items-center justify-between gap-2 rounded-md border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/[0.12] px-2.5 py-2 transition-colors text-left group">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white/70 truncate">{fullName}</p>
                  <p className="text-xs text-white/30 truncate">{c.email || 'No email'}</p>
                </div>
                <div className="shrink-0 flex items-center gap-1 text-xs text-white/30 group-hover:text-[#96BF48] transition-colors">
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

      {!isEmailThread && (
        <button
          onClick={() => setMode('create')}
          className="w-full flex items-center justify-center gap-1.5 text-xs text-white/30 hover:text-white/60 border border-dashed border-white/[0.12] hover:border-white/[0.25] rounded-md py-2 transition-colors"
        >
          <UserPlus className="w-3 h-3" /> Create new customer
        </button>
      )}
    </div>
  )

  // ── Create UI ─────────────────────────────────────────────────────────────
  const createUI = (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-white/30">New Shopify customer</p>
        <button onClick={() => setMode('search')} className="text-xs text-white/30 hover:text-white/60 transition-colors">Back</button>
      </div>
      <div className="space-y-1.5">
        {(['first_name', 'last_name', 'email'] as const).map(field => (
          <input
            key={field}
            type={field === 'email' ? 'email' : 'text'}
            placeholder={field === 'first_name' ? 'First name' : field === 'last_name' ? 'Last name' : 'Email'}
            value={createDraft[field]}
            onChange={e => setCreateDraft(d => ({ ...d, [field]: e.target.value }))}
            className="w-full text-xs text-white/70 rounded-md border border-white/[0.12] bg-white/[0.06] px-2.5 py-1.5 focus:outline-none focus:border-white/[0.25] placeholder:text-white/20"
          />
        ))}
      </div>
      {createError && <p className="text-xs text-red-400">{createError}</p>}
      <button
        onClick={handleCreate}
        disabled={isCreating || (!createDraft.first_name && !createDraft.last_name && !createDraft.email)}
        className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-[#96BF48] hover:bg-[#7da33a] disabled:opacity-50 rounded-md py-1.5 transition-colors"
      >
        {isCreating ? <RefreshCw className="w-3 h-3 animate-spin" /> : <UserPlus className="w-3 h-3" />}
        Create & link
      </button>
    </div>
  )

  // ── Render ────────────────────────────────────────────────────────────────

  if ((isEmailThread || isLinked) && isLoading) {
    return <>{header}<Skeleton /></>
  }

  if (mode === 'search') {
    return <div>{header}{searchUI}</div>
  }

  if (mode === 'create') {
    return <div>{header}{createUI}</div>
  }

  if (isEmailThread && !isLoading && !data?.customer) {
    return (
      <>
        {header}
        <p className="text-xs text-white/30 italic">No Shopify account found for this email.</p>
      </>
    )
  }

  if ((isEmailThread || isLinked) && data?.customer) {
    return (
      <div>
        {header}
        <div className="space-y-4">
          <CustomerInfo customer={data.customer} onSaved={handleCustomerSaved} />
          <div>
            <p className="text-xs text-white/30 mb-2">Orders</p>
            <OrderList orders={data.orders} shop={data.shop} />
          </div>
        </div>
      </div>
    )
  }

  // Non-email, no link: search UI is the default
  return (
    <div>
      {header}
      <div className="space-y-2">
        <p className="text-xs text-white/30">Search your Shopify customers to link one to this conversation.</p>

        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-white/25 pointer-events-none" />
          <input
            type="text"
            placeholder="Name or email…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full pl-6 pr-7 py-1.5 text-xs text-white/70 rounded-md border border-white/[0.12] bg-white/[0.06] focus:outline-none focus:border-white/[0.25] placeholder:text-white/20"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2">
            {isSearching
              ? <RefreshCw className="w-3 h-3 text-white/20 animate-spin" />
              : query
                ? <button onClick={() => { setQuery(''); setDebouncedQuery('') }} className="text-white/20 hover:text-white/50"><X className="w-3 h-3" /></button>
                : null}
          </span>
        </div>

        {searchData?.customers?.length === 0 && (
          <p className="text-xs text-white/30 italic">No customers found.</p>
        )}

        {searchData?.customers && searchData.customers.length > 0 && (
          <div className="space-y-1">
            {searchData.customers.map(c => {
              const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ') || '—'
              return (
                <button key={c.id} onClick={() => handleLink(c)} disabled={isLinking === c.id}
                  className="w-full flex items-center justify-between gap-2 rounded-md border border-white/[0.07] bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/[0.12] px-2.5 py-2 transition-colors text-left group">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white/70 truncate">{fullName}</p>
                    <p className="text-xs text-white/30 truncate">{c.email || 'No email'}</p>
                  </div>
                  <div className="shrink-0 flex items-center gap-1 text-xs text-white/30 group-hover:text-[#96BF48] transition-colors">
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

        <button
          onClick={() => setMode('create')}
          className="w-full flex items-center justify-center gap-1.5 text-xs text-white/30 hover:text-white/60 border border-dashed border-white/[0.12] hover:border-white/[0.25] rounded-md py-2 transition-colors"
        >
          <UserPlus className="w-3 h-3" /> Create new customer
        </button>
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
    <aside className="w-full lg:w-92 shrink-0 lg:border-l lg:border-border flex flex-col lg:overflow-y-auto bg-background">

      {/* Customer identity */}
      <div className="flex flex-col items-center text-center px-4 pt-6 pb-5 border-b border-border gap-2.5">
        <div className="w-14 h-14 rounded-full overflow-hidden bg-white/[0.10] flex items-center justify-center text-white text-base font-bold shrink-0">
          {thread.customer?.profilePicUrl ? (
            <Image src={thread.customer.profilePicUrl} alt={name} width={56} height={56} className="w-full h-full object-cover" />
          ) : initials}
        </div>
        <div>
          <p className="text-sm font-bold text-white/80 tracking-tight leading-tight">{name}</p>
          {showHandle && (
            <p className="text-xs text-white/35 font-mono mt-0.5 truncate max-w-[160px]">
              {thread.channelType === 'email' ? platformHandle : (platformHandle.startsWith('@') ? platformHandle : `@${platformHandle}`)}
            </p>
          )}
        </div>

        {/* Channel badge */}
        <div className="flex items-center gap-1.5 border border-border rounded-full px-2.5 py-1 bg-white/[0.04]">
          <Image src={channel.logo} alt={channel.name} width={12} height={12} className="object-contain opacity-60" />
          <span className="text-xs font-medium text-white/45">{channel.name}</span>
        </div>

        {/* Shopify stat strip */}
        {shopifyCustomer && (
          <p className="text-xs text-white/30">
            {shopifyCustomer.orders_count} order{shopifyCustomer.orders_count !== 1 ? 's' : ''} · ${parseFloat(shopifyCustomer.total_spent).toFixed(2)} spent
          </p>
        )}

        {/* Previous tickets */}
        {previousTicketsCount > 0 && (
          <p className="text-xs text-white/30">
            {previousTicketsCount} previous ticket{previousTicketsCount !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Shopify section */}
      {hasShopify && (
        <div className="px-4 py-4 border-b border-border">
          <ShopifySection
            thread={thread}
            onLinkShopifyCustomer={onLinkShopifyCustomer}
            onCustomerLoaded={setShopifyCustomer}
          />
        </div>
      )}

      {/* Conversation meta */}
      <div className="px-4 py-4">
        <SectionHeader title="Conversation" color="text-white/30" />
        <div className="rounded-md border border-white/[0.07] bg-white/[0.03] p-2.5 space-y-2.5">
          {aiSummary !== undefined && (
            <div>
              <div className="flex items-center justify-between mb-0.5">
                <div className="flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                  <p className="text-[10px] text-white/30">AI Summary</p>
                </div>
                {onRefreshSummary && (
                  <button
                    onClick={onRefreshSummary}
                    disabled={isRefreshingSummary}
                    className="text-white/20 hover:text-amber-400 transition-colors disabled:opacity-40"
                    title="Refresh summary"
                  >
                    <RefreshCw className={`w-2.5 h-2.5 ${isRefreshingSummary ? 'animate-spin' : ''}`} />
                  </button>
                )}
              </div>
              <p className="text-xs text-white/55 leading-relaxed">
                {aiSummary || <span className="text-white/25 italic">No summary yet.</span>}
              </p>
            </div>
          )}
          <div>
            <p className="text-[10px] text-white/30 mb-0.5">Topic</p>
            {isEditingTag ? (
              <input autoFocus value={tagDraft}
                onChange={e => setTagDraft(e.target.value)}
                onBlur={saveTag}
                onKeyDown={e => { if (e.key === 'Enter') saveTag(); if (e.key === 'Escape') setIsEditingTag(false) }}
                maxLength={40}
                className="mt-0.5 w-full text-xs font-medium text-white/70 bg-white/[0.06] border border-white/[0.15] rounded px-1.5 py-0.5 outline-none focus:border-white/[0.30]"
              />
            ) : (
              <button onClick={startEditingTag}
                className="mt-0.5 group flex items-center gap-1 text-xs font-medium text-white/60 hover:text-white/80 transition-colors text-left">
                <span>{thread.tag || 'General'}</span>
                <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 text-white/30 shrink-0" />
              </button>
            )}
          </div>
          <div>
            <p className="text-[10px] text-white/30 mb-1">Status</p>
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full border ${
              thread.status === 'open'
                ? 'text-amber-400 bg-amber-400/10 border-amber-400/20'
                : thread.status === 'pending'
                  ? 'text-blue-400 bg-blue-400/10 border-blue-400/20'
                  : 'text-green-400 bg-green-400/10 border-green-400/20'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                thread.status === 'open'
                  ? 'bg-amber-400'
                  : thread.status === 'pending'
                    ? 'bg-blue-400'
                    : 'bg-green-400'
              }`} />
              {thread.status.charAt(0).toUpperCase() + thread.status.slice(1)}
            </span>
          </div>
          <div>
            <p className="text-[10px] text-white/30 mb-0.5">Opened</p>
            <p className="text-xs font-medium text-white/60">{formatDate(thread.createdAt)}</p>
          </div>
        </div>
      </div>

    </aside>
  )
}
