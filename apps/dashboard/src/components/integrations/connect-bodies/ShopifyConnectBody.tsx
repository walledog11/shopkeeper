"use client"

import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function ShopifyConnectBody({
  isConnected,
  shop,
  setShop,
  loading,
  onConnect,
  disabled = false,
  claimShop = null,
  onClaim,
}: {
  isConnected: boolean
  shop: string
  setShop: (v: string) => void
  loading: boolean
  onConnect: () => void
  disabled?: boolean
  /** The store installed from Shopify admin, which connects without its domain or a second approval. */
  claimShop?: string | null
  onClaim?: () => void
}) {
  if (!isConnected && claimShop && onClaim) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-foreground/40 leading-relaxed">
          You installed Shopkeeper on this store and approved its access in Shopify. Connect it to this workspace.
        </p>
        <div className="flex items-center gap-2">
          <span className="flex h-9 min-w-0 flex-1 items-center truncate rounded-md border border-input px-3 text-sm">
            {claimShop}
          </span>
          <Button size="sm" disabled={disabled || loading} onClick={onClaim} className="shrink-0 h-9 px-4 font-medium">
            {loading ? <Loader2 className="size-4 animate-spin" /> : "Connect"}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {!isConnected && (
        <div className="space-y-2">
          <p className="text-xs text-foreground/40 leading-relaxed">
            Shopkeeper looks up this store&apos;s orders, customers and products when it answers customers.
            Refunds and order changes still wait for your approval.
          </p>
          <ol className="text-xs text-foreground/30 space-y-1 list-decimal list-inside leading-relaxed">
            <li>Enter your <span className="font-mono text-foreground/45">.myshopify.com</span> store domain below</li>
            <li>Approve Shopkeeper in Shopify</li>
            <li>Order lookups work as soon as you approve</li>
          </ol>
        </div>
      )}
      {!isConnected && (
        <div className="flex gap-2">
          <Input aria-label="mystore.myshopify.com"
            type="text"
            placeholder="mystore.myshopify.com"
            value={shop}
            disabled={disabled}
            onChange={(e) => setShop(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onConnect() }}
            className="h-9 text-sm"
          />
          <Button
            size="sm"
            disabled={disabled || !shop.trim() || loading}
            onClick={onConnect}
            className="shrink-0 h-9 px-4 font-medium"
          >
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : "Connect"}
          </Button>
        </div>
      )}
    </div>
  )
}
