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
}: {
  isConnected: boolean
  shop: string
  setShop: (v: string) => void
  loading: boolean
  onConnect: () => void
}) {
  return (
    <div className="space-y-3">
      {!isConnected && (
        <div className="space-y-2">
          <p className="text-xs text-foreground/40 leading-relaxed">
            Sync customer orders, returns, and Shopify Inbox messages directly into Shopkeeper.
          </p>
          <ol className="text-xs text-foreground/30 space-y-1 list-decimal list-inside leading-relaxed">
            <li>Enter your <span className="font-mono text-foreground/45">.myshopify.com</span> store domain below</li>
            <li>You&apos;ll be redirected to Shopify to authorize Shopkeeper</li>
            <li>Order data and messages will sync automatically</li>
          </ol>
        </div>
      )}
      {!isConnected && (
        <div className="flex gap-2">
          <Input aria-label="mystore.myshopify.com"
            type="text"
            placeholder="mystore.myshopify.com"
            value={shop}
            onChange={(e) => setShop(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") onConnect() }}
            className="h-9 text-sm"
          />
          <Button
            size="sm"
            disabled={!shop.trim() || loading}
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
