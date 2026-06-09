import type { ShopifyAddress, ShopifyCustomer } from "@/types/shopify"

export function locationString(addr: ShopifyAddress | null | undefined) {
  if (!addr) return null
  return [addr.city, addr.province].filter(Boolean).join(", ") || [addr.city, addr.country_name].filter(Boolean).join(", ") || null
}

export function shopifyName(customer: ShopifyCustomer | null | undefined) {
  if (!customer) return null
  return [customer.first_name, customer.last_name].filter(Boolean).join(" ") || null
}
