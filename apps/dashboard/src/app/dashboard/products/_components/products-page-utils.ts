export interface ProductVariant {
  id: number
  title: string
  price: string
  sku: string | null
  inventory_quantity: number
  compare_at_price: string | null
}

export interface ProductRow {
  id: number
  title: string
  status: string
  vendor: string | null
  product_type: string | null
  tags: string[]
  image: string | null
  variant_count: number
  price_min: number | null
  price_max: number | null
  total_inventory: number
  variants: ProductVariant[]
}

export interface ProductsResponse {
  products: ProductRow[]
  nextPageInfo: string | null
  shop: string
}

export const STATUS_FILTERS = [
  { id: 'any',      label: 'All' },
  { id: 'active',   label: 'Active' },
  { id: 'draft',    label: 'Draft' },
  { id: 'archived', label: 'Archived' },
] as const

export type StatusFilter = typeof STATUS_FILTERS[number]['id']

export function formatPrice(min: number | null, max: number | null) {
  if (min === null) return ','
  if (min === max || max === null) return `$${min.toFixed(2)}`
  return `$${min.toFixed(2)} – $${max.toFixed(2)}`
}

export function inventoryStyle(qty: number): string {
  if (qty <= 0)  return 'text-red-400'
  if (qty <= 5)  return 'text-amber-400'
  return 'text-green-400'
}

export function inventoryLabel(qty: number) {
  if (qty <= 0) return 'Out of stock'
  if (qty <= 5) return `Low (${qty})`
  return String(qty)
}

export function statusStyle(status: string) {
  switch (status) {
    case 'active':   return { label: 'Active',   cls: 'text-green-400 bg-green-400/10 border-green-400/20' }
    case 'draft':    return { label: 'Draft',    cls: 'text-white/40 bg-white/[0.06] border-white/[0.10]' }
    case 'archived': return { label: 'Archived', cls: 'text-white/25 bg-white/[0.04] border-white/[0.08]' }
    default:         return { label: status,     cls: 'text-white/40 bg-white/[0.06] border-white/[0.10]' }
  }
}
