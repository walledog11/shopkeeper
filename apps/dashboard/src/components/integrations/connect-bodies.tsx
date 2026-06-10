"use client"

import Image from "next/image"
import { BookOpen, Loader2, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/ui/cn"
import { getEmailProvider, getEmailProviderLabel } from "@/lib/messaging/email/providers"
import type { Integration } from "@/types"
import { EmailForwardingDisclosure } from "./EmailForwardingDisclosure"

function EmailRailStatus({ providerLabel }: { providerLabel: string }) {
  return (
    <div className="rounded-md border border-white/[0.06] bg-white/[0.015] px-3.5 py-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="size-1.5 rounded-full bg-emerald-400" />
        <span className="text-xs font-medium text-white/70">Sending</span>
        <span className="text-xs text-white/40">Connected via {providerLabel}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="size-1.5 rounded-full bg-amber-400" />
        <span className="text-xs font-medium text-white/70">Receiving</span>
        <span className="text-xs text-white/40">Forwarding required</span>
      </div>
      <p className="text-xs text-white/30 leading-relaxed">
        {providerLabel} sign-in lets Shopkeeper send replies. Until native inbox sync ships,
        forward your support inbox to the address below so incoming mail becomes tickets.
      </p>
    </div>
  )
}

export function EmailConnectBody({
  isConnected,
  connected,
  email,
  setEmail,
  loading,
  onSave,
}: {
  isConnected: boolean
  connected: Integration[]
  email: string
  setEmail: (v: string) => void
  loading: boolean
  onSave: () => void
}) {
  const oauthIntegration = connected.find((integration) => {
    const provider = getEmailProvider(integration)
    return provider === "gmail" || provider === "outlook"
  })

  return (
    <div className="space-y-3">
      {!isConnected && (
        <p className="text-xs text-white/40 leading-relaxed">
          Connect your support inbox. Replies will be sent from your real address.
        </p>
      )}
      {!isConnected && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <form action="/api/integrations/gmail/auth" method="post">
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 h-10 px-4 rounded-md bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.10] text-sm font-medium text-white/85 transition-colors"
            >
              <Image src="/logos/gmail.png" alt="" width={16} height={16} className="object-contain" />
              Connect Gmail
            </button>
          </form>
          <form action="/api/integrations/outlook/auth" method="post">
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 h-10 px-4 rounded-md bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.10] text-sm font-medium text-white/85 transition-colors"
            >
              <Mail className="size-4 text-white/65" />
              Connect Outlook
            </button>
          </form>
        </div>
      )}
      {oauthIntegration && <EmailRailStatus providerLabel={getEmailProviderLabel(oauthIntegration)} />}
      <EmailForwardingDisclosure
        isConnected={isConnected}
        email={email}
        setEmail={setEmail}
        loading={loading}
        defaultOpen={Boolean(oauthIntegration)}
        label={oauthIntegration ? "Set up inbound forwarding" : undefined}
        onSave={onSave}
      />
    </div>
  )
}

export function InstagramConnectBody({ isConnected }: { isConnected: boolean }) {
  return (
    <div className="space-y-3">
      {!isConnected && (
        <div className="space-y-2">
          <p className="text-xs text-white/40 leading-relaxed">
            Connect your Instagram Business account to manage DMs alongside every other channel.
          </p>
          <ol className="text-xs text-white/30 space-y-1 list-decimal list-inside leading-relaxed">
            <li>Make sure your Instagram is linked to a Facebook Business Page</li>
            <li>Click Connect below and authorize Shopkeeper via Meta OAuth</li>
            <li>DMs will start appearing as tickets immediately</li>
          </ol>
        </div>
      )}
      <form action="/api/integrations/instagram/auth" method="post">
        <Button type="submit" size="sm" className="h-9 px-4 font-medium">
          {isConnected ? "Reconnect" : "Connect with Instagram"}
        </Button>
      </form>
    </div>
  )
}

export function ShopifyConnectBody({
  isConnected,
  shop,
  setShop,
  loading,
  onConnect,
  kbSyncing,
  kbSyncResult,
  onKbSync,
}: {
  isConnected: boolean
  shop: string
  setShop: (v: string) => void
  loading: boolean
  onConnect: () => void
  kbSyncing: boolean
  kbSyncResult: string | null
  onKbSync: () => void
}) {
  return (
    <div className="space-y-3">
      {!isConnected && (
        <div className="space-y-2">
          <p className="text-xs text-white/40 leading-relaxed">
            Sync customer orders, returns, and Shopify Inbox messages directly into Shopkeeper.
          </p>
          <ol className="text-xs text-white/30 space-y-1 list-decimal list-inside leading-relaxed">
            <li>Enter your <span className="font-mono text-white/45">.myshopify.com</span> store domain below</li>
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
      {isConnected && (
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            disabled={kbSyncing}
            onClick={onKbSync}
            className="h-8 px-3 text-xs font-medium text-white/40 hover:text-white/70 hover:bg-white/[0.04]"
          >
            {kbSyncing
              ? <><Loader2 className="size-3 mr-1.5 animate-spin" />Syncing…</>
              : <><BookOpen className="size-3 mr-1.5" />Sync to KB</>
            }
          </Button>
          {kbSyncResult && (
            <span className={cn(
              "text-xs",
              kbSyncResult.startsWith("Sync failed") ? "text-red-400" : "text-emerald-400",
            )}>
              {kbSyncResult}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
