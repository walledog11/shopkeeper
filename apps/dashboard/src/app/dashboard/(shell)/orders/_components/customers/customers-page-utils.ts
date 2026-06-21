import type { ShopifyAddress, ShopifyOrder } from "@/types/shopify"

export type { ShopifyAddress, ShopifyOrder }

export interface CustomerRow {
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

export interface CustomerDetailResponse {
  customer: CustomerRow | null
  orders: ShopifyOrder[]
  shop: string
}

export interface CustomersResponse {
  customers: CustomerRow[]
  nextPageInfo: string | null
  shop: string
}

export interface EditState {
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

export function fullName(c: CustomerRow) {
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || ","
}

export function initials(c: CustomerRow) {
  const parts = [c.first_name, c.last_name].filter(Boolean)
  return parts.map(p => p[0]).join("").toUpperCase().slice(0, 2) || "?"
}

export function formatLTV(val: string) {
  const n = parseFloat(val)
  if (isNaN(n)) return "$0"
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${n.toFixed(2)}`
}

export type CustomerSegment = "vip" | "repeat" | "new" | "prospect"

export const SEGMENT_LABEL: Record<CustomerSegment, string> = {
  vip: "VIP",
  repeat: "Repeat",
  new: "New",
  prospect: "No orders",
}

/** Lifetime spend at or above this marks a customer VIP regardless of order count. */
export const VIP_LTV_THRESHOLD = 500

export function customerSegment(c: CustomerRow): CustomerSegment {
  const spent = parseFloat(c.total_spent)
  if (!isNaN(spent) && spent >= VIP_LTV_THRESHOLD) return "vip"
  if (c.orders_count >= 2) return "repeat"
  if (c.orders_count === 1) return "new"
  return "prospect"
}

export function fulfillmentStyle(status: string | null) {
  switch (status) {
    case "fulfilled":  return { label: "Fulfilled",   cls: "text-green-400 bg-green-400/10 border-green-400/20" }
    case "partial":    return { label: "Partial",     cls: "text-amber-400 bg-amber-400/10 border-amber-400/20" }
    case "restocked":  return { label: "Restocked",   cls: "text-foreground/40 bg-foreground/[0.06] border-foreground/[0.10]" }
    default:           return { label: "Unfulfilled", cls: "text-amber-400 bg-amber-400/10 border-amber-400/20" }
  }
}
