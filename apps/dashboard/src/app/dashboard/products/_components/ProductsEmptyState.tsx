import { Package } from "lucide-react"

export function ProductsEmptyState({ isSearch, query }: { isSearch: boolean; query: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="size-10 rounded-md bg-white/[0.05] border border-white/[0.07] flex items-center justify-center mb-3">
        <Package className="size-4 text-white/30" />
      </div>
      <p className="text-sm font-semibold text-white/40 mb-1">
        {isSearch ? `No products match "${query}"` : "No products found"}
      </p>
      {isSearch && (
        <p className="text-xs text-white/25">Try a different title or clear the search.</p>
      )}
    </div>
  )
}
