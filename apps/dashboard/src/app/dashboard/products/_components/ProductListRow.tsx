import { ChevronRight } from "lucide-react"
import { ProductImage } from "./ProductImage"
import {
  formatPrice,
  inventoryLabel,
  inventoryStyle,
  statusStyle,
  type ProductRow,
} from "./products-page-utils"

export function ProductListRow({ product, isSelected, onClick }: {
  product: ProductRow
  isSelected: boolean
  onClick: () => void
}) {
  const ss = statusStyle(product.status)
  const priceStr = formatPrice(product.price_min, product.price_max)

  return (
    <button type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors group ${
        isSelected ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
      }`}
    >
      <ProductImage src={product.image} title={product.title} />

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white/80 truncate leading-tight">{product.title}</p>
        <p className="text-xs text-white/35 truncate mt-0.5">
          {product.variant_count} variant{product.variant_count !== 1 ? 's' : ''}
          {product.vendor ? ` · ${product.vendor}` : ''}
        </p>
      </div>

      <div className="hidden sm:flex flex-col items-end gap-0.5 shrink-0">
        <span className="text-sm font-bold text-white/60">{priceStr}</span>
        <span className={`text-xs ${inventoryStyle(product.total_inventory)}`}>
          {inventoryLabel(product.total_inventory)}
        </span>
      </div>

      <span className={`hidden md:inline-flex text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0 ${ss.cls}`}>
        {ss.label}
      </span>

      <ChevronRight className={`size-4 shrink-0 transition-colors ${
        isSelected ? "text-white/40" : "text-white/15 group-hover:text-white/30"
      }`} />
    </button>
  )
}
