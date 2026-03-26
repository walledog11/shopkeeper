"use client"

import { useState, useEffect, useRef } from "react"
import Image from "next/image"
import { RefreshCw, Pencil, ExternalLink, ShoppingBag, X, Search, UserPlus, Check, Bot, Send, AlertCircle } from "lucide-react"
import useSWR from "swr"
import { getChannelInfo } from "@/lib/channels"
import { getCustomerName } from "@/lib/utils"
import { formatDate } from "@/lib/utils"
import { fetcher } from "@/lib/fetcher"
import type { Thread, Ticket } from "@/types"

interface Props {
  thread: Thread
  ticket: Ticket
  hasShopify: boolean
  isRefreshingSummary: boolean
  onRefreshSummary: () => void
  onTagUpdate: (tag: string) => void
  onLinkShopifyCustomer: (customerId: string | null) => void
  onAgentActionsComplete?: () => void
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
    case 'fulfilled':  return { label: 'Fulfilled',   color: 'text-green-700 bg-green-50 border-green-200' }
    case 'partial':    return { label: 'Partial',     color: 'text-amber-700 bg-amber-50 border-amber-200' }
    case 'restocked':  return { label: 'Restocked',   color: 'text-slate-600 bg-slate-100 border-slate-200' }
    default:           return { label: 'Unfulfilled', color: 'text-slate-500 bg-slate-50 border-slate-200' }
  }
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

  const [draft, setDraft] = useState<EditState>({
    first_name: customer.first_name ?? '',
    last_name:  customer.last_name  ?? '',
    email:      customer.email      ?? '',
    phone:      customer.phone      ?? '',
    address1:   addr?.address1      ?? '',
    city:       addr?.city          ?? '',
    province:   addr?.province      ?? '',
    zip:        addr?.zip           ?? '',
    country:    addr?.country_name  ?? '',
  })

  const startEdit = () => {
    setSaveError(null)
    setDraft({
      first_name: customer.first_name ?? '',
      last_name:  customer.last_name  ?? '',
      email:      customer.email      ?? '',
      phone:      customer.phone      ?? '',
      address1:   addr?.address1      ?? '',
      city:       addr?.city          ?? '',
      province:   addr?.province      ?? '',
      zip:        addr?.zip           ?? '',
      country:    addr?.country_name  ?? '',
    })
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
        default_address: data.customer.default_address ?? null,
      })
      setIsEditing(false)
    } finally {
      setIsSaving(false)
    }
  }

  const field = (label: string, key: keyof EditState) => (
    <div>
      <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">{label}</p>
      {isEditing ? (
        <input
          value={draft[key]}
          onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
          className="w-full text-[11px] text-slate-800 bg-white border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:border-slate-400"
        />
      ) : (
        <p className="text-[11px] text-slate-700">{(draft[key] as string) || <span className="text-slate-300">—</span>}</p>
      )}
    </div>
  )

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Customer</p>
        {!isEditing ? (
          <button onClick={startEdit} className="text-slate-300 hover:text-slate-500 transition-colors">
            <Pencil className="w-3 h-3" />
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setIsEditing(false); setSaveError(null) }}
              className="text-[10px] font-semibold text-slate-400 hover:text-slate-600"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1 text-[10px] font-semibold text-white bg-[#96BF48] hover:bg-[#7da33a] disabled:opacity-50 rounded px-2 py-0.5 transition-colors"
            >
              {isSaving ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : <Check className="w-2.5 h-2.5" />}
              Save
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/60 p-2.5">
        <div className="grid grid-cols-2 gap-2">
          {field('First name', 'first_name')}
          {field('Last name',  'last_name')}
        </div>
        {field('Email',   'email')}
        {field('Phone',   'phone')}
        {field('Address', 'address1')}
        <div className="grid grid-cols-2 gap-2">
          {field('City',     'city')}
          {field('Province', 'province')}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {field('ZIP',     'zip')}
          {field('Country', 'country')}
        </div>
      </div>

      {saveError && (
        <p className="text-[11px] text-red-500">{saveError}</p>
      )}
    </div>
  )
}

// ── Order list ────────────────────────────────────────────────────────────────

function OrderList({ orders, shop }: { orders: ShopifyOrder[]; shop?: string }) {
  if (orders.length === 0) {
    return <p className="text-[11px] text-slate-400 italic">No orders found.</p>
  }
  return (
    <div className="space-y-2">
      {orders.map(order => {
        const { label, color } = fulfillmentLabel(order.fulfillment_status)
        const itemSummary = order.line_items.map(li => `${li.quantity}× ${li.title}`).join(', ')
        const date = new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        const adminUrl = shop ? `https://${shop}/admin/orders/${order.id}` : null
        return (
          <div key={order.id} className="rounded-lg border border-slate-100 bg-slate-50/80 p-2.5 space-y-1.5">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] font-bold text-slate-800">{order.name}</span>
              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${color}`}>{label}</span>
            </div>
            <p className="text-[10px] text-slate-500 truncate" title={itemSummary}>{itemSummary}</p>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-slate-700">${parseFloat(order.total_price).toFixed(2)}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-400">{date}</span>
                {adminUrl && (
                  <a href={adminUrl} target="_blank" rel="noopener noreferrer"
                    className="text-slate-400 hover:text-slate-600 transition-colors" title="View in Shopify">
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
      <div className="rounded-lg border border-slate-100 bg-slate-50 p-2.5 space-y-2">
        <div className="h-2 w-16 bg-slate-200 rounded" />
        <div className="h-2.5 w-28 bg-slate-200 rounded" />
        <div className="h-2 w-32 bg-slate-100 rounded" />
        <div className="h-2 w-20 bg-slate-100 rounded" />
      </div>
      {[1, 2].map(i => (
        <div key={i} className="rounded-lg border border-slate-100 bg-slate-50 p-2.5 space-y-1.5">
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
  agentRefreshTick,
}: {
  thread: Thread
  onLinkShopifyCustomer: (id: string | null) => void
  agentRefreshTick: number
}) {
  const isEmailThread = thread.channelType === 'email'
  const isLinked = !!thread.shopifyCustomerId

  // Build SWR key: auto by email, by customerId if linked, null if neither applies
  const swrKey = isEmailThread
    ? `/api/shopify/customer?email=${encodeURIComponent(thread.customer.platformId)}`
    : isLinked
      ? `/api/shopify/customer?customerId=${encodeURIComponent(thread.shopifyCustomerId!)}`
      : null

  const { data, isLoading, mutate } = useSWR<ShopifyData>(swrKey, fetcher)

  // Re-fetch whenever the agent completes actions that may have changed Shopify data
  useEffect(() => {
    if (agentRefreshTick > 0) mutate()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentRefreshTick])

  // Optimistically update local customer data after an edit
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

  // ── Render ────────────────────────────────────────────────────────────────

  // Loading
  if ((isEmailThread || isLinked) && isLoading) {
    return <Skeleton />
  }

  // Email thread: customer not in Shopify
  if (isEmailThread && !isLoading && !data?.customer) {
    return <p className="text-[11px] text-slate-400 italic">No Shopify account found for this email.</p>
  }

  // Linked or email: show customer info + orders
  if ((isEmailThread || isLinked) && data?.customer) {
    return (
      <div className="space-y-4">
        {/* Unlink button for manually linked threads */}
        {isLinked && (
          <button
            onClick={() => onLinkShopifyCustomer(null)}
            className="flex items-center gap-1 text-[10px] font-semibold text-slate-400 hover:text-red-400 transition-colors"
          >
            <X className="w-3 h-3" /> Unlink customer
          </button>
        )}

        <CustomerInfo customer={data.customer} onSaved={handleCustomerSaved} />

        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Orders</p>
          <OrderList orders={data.orders} shop={data.shop} />
        </div>
      </div>
    )
  }

  // Non-email, no link: search UI
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-slate-400">Search your Shopify customers to link one to this conversation.</p>

      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
        <input
          type="text"
          placeholder="Name or email…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full pl-6 pr-7 py-1.5 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:border-slate-400 placeholder:text-slate-300"
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
          {[1, 2].map(i => <div key={i} className="h-8 rounded-lg bg-slate-100" />)}
        </div>
      )}

      {searchData?.customers?.length === 0 && (
        <p className="text-[11px] text-slate-400 italic">No customers found.</p>
      )}

      {searchData?.customers && searchData.customers.length > 0 && (
        <div className="space-y-1">
          {searchData.customers.map(c => {
            const fullName = [c.first_name, c.last_name].filter(Boolean).join(' ') || '—'
            return (
              <button key={c.id} onClick={() => handleLink(c)} disabled={isLinking === c.id}
                className="w-full flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50/80 hover:bg-slate-100 hover:border-slate-200 px-2.5 py-2 transition-colors text-left group">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-slate-800 truncate">{fullName}</p>
                  <p className="text-[10px] text-slate-400 truncate">{c.email || 'No email'}</p>
                </div>
                <div className="shrink-0 flex items-center gap-1 text-[10px] text-slate-400 group-hover:text-[#96BF48] transition-colors">
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
  )
}

// ── Agent panel ───────────────────────────────────────────────────────────────

interface ActionEntry {
  tool: string;
  result: string;
}

interface AgentTurn {
  instruction: string;
  actions: ActionEntry[];
  summary: string | null;
  error: string | null;
}

const TOOL_LABELS: Record<string, string> = {
  get_shopify_customer:            "Fetched Shopify customer",
  update_shopify_customer_info:    "Updated customer info",
  get_shopify_orders:              "Fetched orders",
  get_order_by_name:               "Looked up order by number",
  update_shopify_order_address:    "Updated order shipping address",
  create_refund:                   "Issued refund",
  cancel_order:                    "Cancelled order",
  add_shopify_customer_note:       "Added Shopify note",
  add_internal_note:               "Logged note",
  send_reply:                      "Sent reply to customer",
  update_thread_status:            "Updated thread status",
  update_thread_tag:               "Updated thread tag",
}

interface QuickChip {
  label: string;
  instruction: string;
  autoSubmit?: boolean;
}

function getQuickChips(hasShopify: boolean): QuickChip[] {
  const chips: QuickChip[] = [
    { label: "Look up orders", instruction: "Look up this customer's Shopify orders and give me a summary." },
    { label: "Close as resolved", instruction: "Mark this thread as closed.", autoSubmit: true },
  ];
  if (hasShopify) {
    chips.splice(1, 0,
      { label: "Issue a refund", instruction: "Check their most recent order and issue a refund if appropriate." },
      { label: "Update shipping address", instruction: "Update the shipping address on their most recent unfulfilled order." },
    );
  }
  chips.push(
    { label: "Send follow-up", instruction: "Draft a friendly follow-up message asking if their issue was resolved." },
    { label: "Escalate", instruction: "Add an internal note that this ticket needs human review and update the tag to 'Escalated'." },
  );
  return chips;
}

function AgentPanel({ thread, hasShopify, onActionsComplete }: { thread: Thread; hasShopify: boolean; onActionsComplete: () => void }) {
  const [instruction, setInstruction] = useState("")
  const [isRunning, setIsRunning]     = useState(false)
  const [turns, setTurns]             = useState<AgentTurn[]>([])
  const historyEndRef                 = useRef<HTMLDivElement>(null)
  const chips                         = getQuickChips(hasShopify)

  // Scroll history to bottom after each new turn
  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [turns, isRunning])

  const handleChipClick = (chip: QuickChip) => {
    if (isRunning) return
    if (chip.autoSubmit) {
      handleRun(chip.instruction)
    } else {
      setInstruction(chip.instruction)
    }
  }

  const handleRun = async (override?: string) => {
    const text = override ?? instruction
    if (!text.trim() || isRunning) return
    const sent = text.trim()
    if (!override) setInstruction("")
    setIsRunning(true)

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: thread.id, instruction: sent }),
      })
      const data = await res.json()
      if (!res.ok) {
        setTurns(t => [...t, { instruction: sent, actions: [], summary: null, error: data.error ?? "Agent failed." }])
      } else {
        setTurns(t => [...t, {
          instruction: sent,
          actions: data.actionsPerformed ?? [],
          summary: data.summary ?? null,
          error: null,
        }])
        onActionsComplete()
      }
    } catch {
      setTurns(t => [...t, { instruction: sent, actions: [], summary: null, error: "Network error — please try again." }])
    } finally {
      setIsRunning(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleRun()
    }
  }

  return (
    <div className="px-4 py-4 border-b border-slate-100 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-1.5 mb-3">
        <Bot className="w-3 h-3 text-violet-500" />
        <p className="text-[10px] font-bold text-violet-500 uppercase tracking-widest">Agent</p>
      </div>

      {/* Conversation history */}
      {(turns.length > 0 || isRunning) && (
        <div className="mb-2 space-y-3 max-h-64 overflow-y-auto pr-0.5">
          {turns.map((turn, i) => (
            <div key={i} className="space-y-1.5">
              {/* User instruction — right aligned */}
              <div className="flex justify-end">
                <div className="max-w-[85%] bg-violet-600 text-white text-[11px] leading-relaxed px-3 py-2 rounded-xl rounded-tr-sm">
                  {turn.instruction}
                </div>
              </div>

              {/* Agent response — left aligned */}
              <div className="flex justify-start">
                <div className="max-w-[90%] bg-slate-100 rounded-xl rounded-tl-sm px-3 py-2 space-y-1.5">
                  {turn.error ? (
                    <p className="text-[11px] text-red-500">{turn.error}</p>
                  ) : (
                    <>
                      {turn.actions.length > 0 && (
                        <div className="space-y-0.5">
                          {turn.actions.map((a, j) => {
                            const isErr = a.result.startsWith("Error:")
                            return (
                              <div key={j} className="flex items-start gap-1">
                                {isErr
                                  ? <AlertCircle className="w-2.5 h-2.5 text-red-400 shrink-0 mt-0.5" />
                                  : <Check       className="w-2.5 h-2.5 text-green-500 shrink-0 mt-0.5" />
                                }
                                <span className={`text-[10px] ${isErr ? 'text-red-500' : 'text-slate-500'}`}>
                                  {isErr ? a.result : (TOOL_LABELS[a.tool] ?? a.tool)}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                      {turn.summary && (
                        <p className="text-[11px] text-slate-700 leading-relaxed">
                          {turn.summary}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Typing indicator while running */}
          {isRunning && (
            <div className="flex justify-start">
              <div className="bg-slate-100 rounded-xl rounded-tl-sm px-3 py-2">
                <div className="flex items-center gap-1 text-[10px] text-violet-400">
                  <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                  <span>Running…</span>
                </div>
              </div>
            </div>
          )}

          <div ref={historyEndRef} />
        </div>
      )}

      {/* Quick action chips */}
      {!isRunning && turns.length === 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {chips.map((chip, i) => (
            <button
              key={i}
              onClick={() => handleChipClick(chip)}
              className="bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1 text-[10px] text-slate-500 hover:bg-violet-50 hover:border-violet-200 hover:text-violet-600 transition-colors"
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="relative">
        <textarea
          rows={2}
          value={instruction}
          onChange={e => setInstruction(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Tell the agent what to do…"
          disabled={isRunning}
          className="w-full resize-none text-[11px] text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 pr-8 placeholder:text-slate-300 focus:outline-none focus:border-violet-300 disabled:opacity-50 leading-relaxed"
        />
        <button
          onClick={() => handleRun()}
          disabled={!instruction.trim() || isRunning}
          className="absolute right-2 bottom-2 text-violet-400 hover:text-violet-600 disabled:opacity-30 transition-colors"
          title="Run (Enter)"
        >
          {isRunning
            ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            : <Send className="w-3.5 h-3.5" />
          }
        </button>
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function ContextPanel({
  thread, ticket, hasShopify,
  isRefreshingSummary, onRefreshSummary, onTagUpdate, onLinkShopifyCustomer,
  onAgentActionsComplete,
}: Props) {
  const channel = getChannelInfo(thread.channelType)
  const name = getCustomerName(thread.customer)
  const initials = name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
  const platformHandle = thread.customer?.platformId || '—'

  const [isEditingTag, setIsEditingTag] = useState(false)
  const [tagDraft, setTagDraft] = useState('')
  const [agentRefreshTick, setAgentRefreshTick] = useState(0)

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
          <p className="text-[11px] text-slate-400 font-mono mt-0.5 truncate max-w-[160px]">
            {thread.channelType === 'email' ? platformHandle : (platformHandle.startsWith('@') ? platformHandle : `@${platformHandle}`)}
          </p>
        </div>
        <div className="flex items-center gap-1.5 border border-slate-200 rounded-full px-2.5 py-1 bg-slate-50">
          <Image src={channel.logo} alt={channel.name} width={12} height={12} className="object-contain" />
          <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">{channel.name}</span>
        </div>
      </div>

      {/* Clerk Context */}
      <div className="px-4 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold text-yellow-600 uppercase tracking-widest">Clerk Context</p>
          <button onClick={onRefreshSummary} disabled={isRefreshingSummary} title="Refresh summary"
            className="text-slate-300 hover:text-slate-500 transition-colors disabled:opacity-40">
            <RefreshCw className={`w-3 h-3 ${isRefreshingSummary ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <p className="text-[11px] text-slate-500 leading-relaxed">{ticket.aiSummary}</p>
      </div>

      {/* Shopify section */}
      {hasShopify && (
        <div className="px-4 py-4 border-b border-slate-100">
          <div className="flex items-center gap-1.5 mb-3">
            <ShoppingBag className="w-3 h-3 text-[#96BF48]" />
            <p className="text-[10px] font-bold text-[#96BF48] uppercase tracking-widest">Shopify</p>
          </div>
          <ShopifySection thread={thread} onLinkShopifyCustomer={onLinkShopifyCustomer} agentRefreshTick={agentRefreshTick} />
        </div>
      )}

      {/* Agent */}
      <AgentPanel
        thread={thread}
        hasShopify={hasShopify}
        onActionsComplete={() => {
          setAgentRefreshTick(t => t + 1)
          onAgentActionsComplete?.()
        }}
      />

      {/* Conversation meta */}
      <div className="px-4 py-4">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Conversation</p>
        <div className="space-y-2.5">
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Topic</p>
            {isEditingTag ? (
              <input autoFocus value={tagDraft}
                onChange={e => setTagDraft(e.target.value)}
                onBlur={saveTag}
                onKeyDown={e => { if (e.key === 'Enter') saveTag(); if (e.key === 'Escape') setIsEditingTag(false) }}
                maxLength={40}
                className="mt-0.5 w-full text-xs font-medium text-slate-700 bg-slate-50 border border-slate-300 rounded px-1.5 py-0.5 outline-none focus:border-slate-500"
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
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Status</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`w-1.5 h-1.5 rounded-full ${thread.status === 'open' ? 'bg-yellow-500' : 'bg-green-500'}`} />
              <span className={`text-xs font-semibold ${thread.status === 'open' ? 'text-yellow-700' : 'text-green-700'}`}>
                {thread.status.charAt(0).toUpperCase() + thread.status.slice(1)}
              </span>
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Date Ticket Opened</p>
            <p className="text-xs font-medium text-slate-700 mt-0.5">{formatDate(thread.createdAt)}</p>
          </div>
        </div>
      </div>

    </aside>
  )
}
