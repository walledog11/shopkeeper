"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  Check,
  Copy,
  ExternalLink,
  Loader2,
  MessageSquare,
  Pencil,
  RefreshCw,
  ShoppingBag,
  X,
} from "lucide-react"
import useSWR from "swr"
import {
  errorMessageFromPayload,
  errorMessageFromUnknown,
  fetcher,
  readJsonResponse,
} from "@/lib/api/fetcher"
import { CustomerAvatar } from "./CustomerAvatar"
import {
  formatDate,
  formatLTV,
  fulfillmentStyle,
  fullName,
  type CustomerDetailResponse,
  type CustomerRow,
  type EditState,
  type ShopifyOrder,
} from "./customers-page-utils"

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

interface CustomerDrawerContentProps {
  customer: CustomerRow
  shop: string
  onClose: () => void
  onCustomerUpdated: (c: Partial<CustomerRow>) => void
}

export function CustomerDrawerContent({
  customer: initial,
  shop,
  onClose,
  onCustomerUpdated,
}: CustomerDrawerContentProps) {
  const { push } = useRouter()

  const { data, mutate } = useSWR<CustomerDetailResponse>(
    `/api/shopify/customer?customerId=${initial.id}`,
    fetcher,
    { revalidateOnFocus: false },
  )

  const customer = data?.customer ?? initial
  const orders: ShopifyOrder[] = data?.orders ?? []
  const detailShop = data?.shop ?? shop
  const isLoadingDetail = !data

  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const makeDraft = (): EditState => {
    const addr = customer.default_address
    return {
      first_name: customer.first_name ?? "",
      last_name: customer.last_name ?? "",
      email: customer.email ?? "",
      phone: customer.phone ?? "",
      address1: addr?.address1 ?? "",
      city: addr?.city ?? "",
      province: addr?.province ?? "",
      zip: addr?.zip ?? "",
      country: addr?.country_name ?? "",
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
            last_name: draft.last_name,
            email: draft.email,
            phone: draft.phone || null,
            address: {
              address1: draft.address1 || null,
              city: draft.city || null,
              province: draft.province || null,
              zip: draft.zip || null,
              country: draft.country || null,
            },
          },
        }),
      })
      const json = await readJsonResponse<{ customer?: Partial<CustomerRow>; error?: unknown }>(res)
      if (!res.ok) {
        setSaveError(errorMessageFromPayload(json, "Failed to save customer."))
        return
      }
      if (!json?.customer) {
        setSaveError("Failed to save customer.")
        return
      }
      const updated = json.customer
      const nextCustomer = { ...customer, ...updated } as CustomerRow
      mutate(
        data
          ? { ...data, customer: nextCustomer }
          : { customer: nextCustomer, orders, shop: detailShop },
        false,
      )
      onCustomerUpdated({
        first_name: nextCustomer.first_name,
        last_name: nextCustomer.last_name,
        email: nextCustomer.email,
        phone: nextCustomer.phone ?? null,
      })
      setIsEditing(false)
    } catch (error) {
      setSaveError(errorMessageFromUnknown(error, "Failed to save customer."))
    } finally {
      setIsSaving(false)
    }
  }

  const [isStartingThread, setIsStartingThread] = useState(false)
  const [threadError, setThreadError] = useState<string | null>(null)

  const handleStartThread = async () => {
    setIsStartingThread(true)
    setThreadError(null)
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
      const json = await readJsonResponse<{ threadId?: string; error?: unknown }>(res)
      if (!res.ok) {
        setThreadError(errorMessageFromPayload(json, "Failed to start support thread."))
        return
      }
      if (res.ok && json?.threadId) {
        push(`/dashboard/tickets?thread=${json.threadId}`)
        return
      }
      setThreadError("Failed to start support thread.")
    } catch (error) {
      setThreadError(errorMessageFromUnknown(error, "Failed to start support thread."))
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

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-5">
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
                const fulfillment = fulfillmentStyle(order.fulfillment_status)
                const adminUrl = detailShop ? `https://${detailShop}/admin/orders/${order.id}` : null
                return (
                  <div key={order.id} className="rounded-md border border-white/[0.07] bg-white/[0.03] p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-bold text-white/70">{order.name}</span>
                        <CopyButton value={order.name} />
                      </div>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${fulfillment.cls}`}>{fulfillment.label}</span>
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
        {threadError && (
          <p className="mt-2 text-xs text-red-400" aria-live="polite">{threadError}</p>
        )}
      </div>
    </div>
  )
}
