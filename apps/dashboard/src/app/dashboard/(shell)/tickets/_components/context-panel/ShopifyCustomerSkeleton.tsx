import { cn } from "@/lib/ui/cn"
import { contextTanPanelClassName } from "./context-panel-styles"

export function ShopifyCustomerSkeleton() {
  return (
    <div className="animate-pulse space-y-2">
      <div className={cn(contextTanPanelClassName, "space-y-2")}>
        <div className="h-3 w-20 rounded-2xl bg-white/70" />
        <div className="h-10 rounded-2xl bg-white/80" />
        <div className="h-10 rounded-2xl bg-white/60" />
      </div>
    </div>
  )
}
