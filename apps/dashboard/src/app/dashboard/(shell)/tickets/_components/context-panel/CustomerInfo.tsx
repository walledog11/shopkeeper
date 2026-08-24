"use client"

import { useState } from "react"
import { Check, RefreshCw } from "lucide-react"
import { cn } from "@/lib/ui/cn"
import { formatMoney, formatMonthYear } from "./formatters"
import type { ShopifyCustomer } from "@/types/shopify"
import {
  contextGhostButtonClassName,
  contextInputClassName,
  contextLabelClassName,
  contextPrimaryButtonClassName,
  contextTanPanelClassName,
} from "./context-panel-styles"

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

interface CustomerInfoProps {
  customer: ShopifyCustomer
  isEditing: boolean
  onEditingChange: (editing: boolean) => void
  onSaved: (updated: Partial<ShopifyCustomer>) => void
  showStats?: boolean
}

function makeCustomerDraft(customer: ShopifyCustomer): EditState {
  const addr = customer.default_address

  return {
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
  }
}

export function CustomerInfo({ customer, isEditing, onEditingChange, onSaved, showStats = true }: CustomerInfoProps) {
  if (isEditing) {
    return (
      <CustomerInfoEditor
        key={customer.id}
        customer={customer}
        onEditingChange={onEditingChange}
        onSaved={onSaved}
      />
    )
  }

  if (!showStats) return null

  const stats = [
    { label: "Orders", value: String(customer.orders_count) },
    { label: "Spent", value: formatMoney(customer.total_spent, customer.currency) },
    { label: "Since", value: formatMonthYear(customer.created_at) },
  ]

  return (
    <div className="grid grid-cols-3 gap-2">
      {stats.map(stat => (
        <div
          key={stat.label}
          className="min-w-0 rounded-2xl bg-[#f5ebe0] px-2 py-2.5 text-center"
        >
          <span className="block truncate text-[13px] font-semibold leading-4 text-[#1a1a1a] tabular-nums">{stat.value}</span>
          <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-[#6b5d4f]">{stat.label}</span>
        </div>
      ))}
    </div>
  )
}

function CustomerInfoEditor({
  customer,
  onEditingChange,
  onSaved,
}: Pick<CustomerInfoProps, "customer" | "onEditingChange" | "onSaved">) {
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [draft, setDraft] = useState<EditState>(() => makeCustomerDraft(customer))

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
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.customer) {
        setSaveError(typeof data.error === 'string' ? data.error : 'Failed to save customer.')
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
      onEditingChange(false)
    } catch (error) {
      console.error('Failed to save Shopify customer', error)
      setSaveError('Failed to save customer.')
    } finally {
      setIsSaving(false)
    }
  }

  const field = (label: string, key: keyof EditState, textarea?: boolean) => (
      <div key={key}>
        <label htmlFor={`shopify-customer-${customer.id}-${key}`} className={cn(contextLabelClassName, "mb-1.5 block")}>{label}</label>
        {textarea ? (
          <textarea
            aria-label={label}
            id={`shopify-customer-${customer.id}-${key}`}
            value={draft[key]}
            onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
            rows={3}
            className={cn(contextInputClassName, "resize-none py-2.5")}
          />
        ) : (
          <input
            aria-label={label}
            id={`shopify-customer-${customer.id}-${key}`}
            type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'}
            value={draft[key]}
            onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
            className={cn(contextInputClassName, "h-10")}
          />
        )}
      </div>
  )

  return (
    <div className="space-y-2.5">
      <div className={cn(contextTanPanelClassName, "space-y-3")}>
        <div className="flex items-center justify-between gap-3">
          <span className={contextLabelClassName}>
            Edit customer
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => { onEditingChange(false); setSaveError(null) }}
              className={contextGhostButtonClassName}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className={contextPrimaryButtonClassName}
            >
              {isSaving ? <RefreshCw className="size-3 animate-spin" /> : <Check className="size-3" />}
              Save
            </button>
          </div>
        </div>
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
        {field('Notes', 'note', true)}
      </div>
      {saveError && <p className="text-xs text-red-600">{saveError}</p>}
    </div>
  )
}
