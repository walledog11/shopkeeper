import {
  formatMonthYear as formatSharedMonthYear,
  formatShortDate as formatSharedShortDate,
} from "@/lib/format/date"
import type { ShopifyAddress, ShopifyCustomer } from "@/types/shopify"

export function fulfillmentLabel(status: string | null): { label: string; textClass: string; dotClass: string } {
  switch (status) {
    case 'fulfilled': return { label: 'Fulfilled', textClass: 'text-emerald-400', dotClass: 'bg-emerald-500' }
    case 'partial': return { label: 'Partial', textClass: 'text-amber-400', dotClass: 'bg-amber-500' }
    case 'restocked': return { label: 'Restocked', textClass: 'text-white/50', dotClass: 'bg-white/30' }
    default: return { label: 'Unfulfilled', textClass: 'text-amber-400', dotClass: 'bg-amber-500' }
  }
}

export function formatMoney(value: string | number | null | undefined, currency?: string | null) {
  const n = typeof value === 'number' ? value : parseFloat(value ?? '')
  const amount = Number.isFinite(n) ? n : 0
  if (currency) {
    try {
      return amount.toLocaleString('en-US', { style: 'currency', currency })
    } catch {
      // Fall through to a compact numeric fallback for unexpected currency codes.
    }
  }
  return `$${amount.toFixed(2)}`
}

export function formatMonthYear(iso: string | null | undefined) {
  return formatSharedMonthYear(iso, { fallback: '-', timeZone: 'UTC' })
}

export function formatShortDate(iso: string | null | undefined) {
  return formatSharedShortDate(iso, { fallback: '', timeZone: 'UTC' })
}

export function locationString(addr: ShopifyAddress | null | undefined) {
  if (!addr) return null
  return [addr.city, addr.province].filter(Boolean).join(', ') || [addr.city, addr.country_name].filter(Boolean).join(', ') || null
}

export function shopifyName(customer: ShopifyCustomer | null | undefined) {
  if (!customer) return null
  return [customer.first_name, customer.last_name].filter(Boolean).join(' ') || null
}
