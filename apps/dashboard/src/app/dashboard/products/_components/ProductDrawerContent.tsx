import { ExternalLink, Package, X } from "lucide-react"
import { ProductImage } from "./ProductImage"
import {
  formatPrice,
  inventoryStyle,
  statusStyle,
  type ProductRow,
} from "./products-page-utils"

export function ProductDrawerContent({ product, shop, onClose }: {
  product: ProductRow
  shop: string
  onClose: () => void
}) {
  const ss = statusStyle(product.status)
  const shopifyAdminUrl = shop ? `https://${shop}/admin/products/${product.id}` : null

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-4 py-3.5 border-b border-border shrink-0">
        <div className="flex items-start gap-3 min-w-0">
          <ProductImage src={product.image} title={product.title} />
          <div className="min-w-0">
            <p className="text-sm font-bold text-white/85 leading-tight">{product.title}</p>
            {product.vendor && (
              <p className="text-xs text-white/35 mt-0.5">{product.vendor}</p>
            )}
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
          <button type="button" onClick={onClose} className="text-white/25 hover:text-white/60 transition-colors">
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-5 px-4 py-3 border-b border-border shrink-0 flex-wrap">
        <div>
          <p className="text-xs text-white/30 mb-0.5">Price</p>
          <p className="text-base font-bold text-white/70">{formatPrice(product.price_min, product.price_max)}</p>
        </div>
        <div className="w-px h-8 bg-white/[0.07]" />
        <div>
          <p className="text-xs text-white/30 mb-0.5">Inventory</p>
          <p className={`text-base font-bold ${inventoryStyle(product.total_inventory)}`}>
            {product.total_inventory}
          </p>
        </div>
        <div className="w-px h-8 bg-white/[0.07]" />
        <div>
          <p className="text-xs text-white/30 mb-0.5">Status</p>
          <span className={`inline-flex text-xs font-semibold px-2 py-0.5 rounded-full border ${ss.cls}`}>
            {ss.label}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-5">

        {/* Meta */}
        {(product.product_type || product.tags.length > 0) && (
          <section>
            <span className="text-xs font-semibold text-white/30 uppercase tracking-wider">Details</span>
            <div className="mt-2 rounded-md border border-white/[0.07] bg-white/[0.03] p-3 space-y-2">
              {product.product_type && (
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-white/30 shrink-0">Type</span>
                  <span className="text-xs text-white/60">{product.product_type}</span>
                </div>
              )}
              {product.tags.length > 0 && (
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs text-white/30 shrink-0 mt-0.5">Tags</span>
                  <div className="flex flex-wrap gap-1 justify-end">
                    {product.tags.map(tag => (
                      <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.09] text-white/50">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Variants */}
        <section>
          <div className="flex items-center gap-2 mb-2.5">
            <Package className="size-3 text-[#96BF48]" />
            <span className="text-xs font-semibold text-white/30 uppercase tracking-wider">
              Variants ({product.variant_count})
            </span>
          </div>

          <div className="rounded-md border border-white/[0.07] overflow-hidden">
            {/* Column headers */}
            <div className="grid grid-cols-[1fr_60px_60px] gap-2 px-3 py-2 border-b border-white/[0.07] bg-white/[0.03]">
              {['Variant', 'Price', 'Stock'].map(h => (
                <span key={h} className="text-xs font-semibold uppercase tracking-wider text-white/20">{h}</span>
              ))}
            </div>

            <div className="divide-y divide-white/[0.05]">
              {product.variants.map(v => (
                <div key={v.id} className="grid grid-cols-[1fr_60px_60px] gap-2 items-center px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-xs text-white/70 truncate font-medium">
                      {v.title === 'Default Title' ? product.title : v.title}
                    </p>
                    {v.sku && (
                      <p className="text-xs text-white/30 truncate mt-0.5">SKU: {v.sku}</p>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white/60">${parseFloat(v.price).toFixed(2)}</p>
                    {v.compare_at_price && parseFloat(v.compare_at_price) > parseFloat(v.price) && (
                      <p className="text-xs text-white/25 line-through">${parseFloat(v.compare_at_price).toFixed(2)}</p>
                    )}
                  </div>
                  <div className="min-w-0">
                    <span className={`text-xs font-semibold ${inventoryStyle(v.inventory_quantity)}`}>
                      {v.inventory_quantity}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
