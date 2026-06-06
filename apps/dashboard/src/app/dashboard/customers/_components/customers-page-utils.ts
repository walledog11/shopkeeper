export interface ShopifyAddress {
  address1: string | null
  city: string | null
  province: string | null
  country_name: string | null
  zip: string | null
}

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

export interface ShopifyOrder {
  id: number
  name: string
  created_at: string
  financial_status: string
  fulfillment_status: string | null
  total_price: string
  line_items: { title: string; quantity: number }[]
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

export function locationString(addr: ShopifyAddress | null) {
  if (!addr) return null
  return [addr.city, addr.country_name].filter(Boolean).join(", ") || null
}

export function fulfillmentStyle(status: string | null) {
  switch (status) {
    case "fulfilled":  return { label: "Fulfilled",   cls: "text-green-400 bg-green-400/10 border-green-400/20" }
    case "partial":    return { label: "Partial",     cls: "text-amber-400 bg-amber-400/10 border-amber-400/20" }
    case "restocked":  return { label: "Restocked",   cls: "text-white/40 bg-white/[0.06] border-white/[0.10]" }
    default:           return { label: "Unfulfilled", cls: "text-amber-400 bg-amber-400/10 border-amber-400/20" }
  }
}
