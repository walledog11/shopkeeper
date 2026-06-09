"use client"

import { useState } from "react"
import Image from "next/image"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/ui/cn"
import { formatLastActivityTime } from "@/lib/format/date"
import { getEmailReauthorizePath } from "@/lib/messaging/email/providers"
import type { ConnectType, PlatformConfig } from "@/lib/integrations/catalog"
import type { Integration } from "@/types"
import { ConnectedAccounts } from "./ConnectedAccounts"
import { ShopifyPermissionsPanel } from "./ShopifyPermissionsPanel"
import { StatusPill } from "./StatusPill"
import {
  ComingSoonConnectBody,
  EmailConnectBody,
  InstagramConnectBody,
  ShopifyConnectBody,
} from "./connect-bodies"
import {
  isPostmarkEmail,
  isTokenExpired,
  isTokenExpiringSoon,
} from "./integration-card-helpers"
import { buildOAuthAuthUrl } from "@/lib/integrations/oauth-flow"
import type { PillState } from "./integration-card-types"

export type { ConnectType, PlatformConfig }

interface Props {
  config: PlatformConfig
  connected: Integration[]
  onConnect: (platform: string, email: string) => Promise<boolean>
  onDisconnect: (integrationId: string) => void
  onLaunchOAuth?: (url: string, onClosed?: () => void) => void
  lastActivity?: string | null
}

export default function IntegrationCard({ config, connected, onConnect, onDisconnect, onLaunchOAuth, lastActivity }: Props) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [shop, setShop] = useState("")
  const [loading, setLoading] = useState(false)
  const [notified, setNotified] = useState(false)
  const [kbSyncing, setKbSyncing] = useState(false)
  const [kbSyncResult, setKbSyncResult] = useState<string | null>(null)

  const isConnected = connected.length > 0
  const isComingSoon = config.connectType === "coming-soon"

  const hasExpired = isConnected && connected.some(isTokenExpired)
  const hasExpiringSoon = isConnected && !hasExpired && connected.some(isTokenExpiringSoon)
  const needsReauth = hasExpired || hasExpiringSoon

  const isAwaitingFirstInbound =
    isConnected &&
    !lastActivity &&
    config.connectType === "email" &&
    connected.every(isPostmarkEmail)

  const pillState: PillState = isComingSoon
    ? "coming-soon"
    : hasExpired
    ? "action-needed"
    : hasExpiringSoon
    ? "auth-expiring"
    : isAwaitingFirstInbound
    ? "waiting-for-inbound"
    : isConnected
    ? "connected"
    : "not-connected"

  const accountIdInline: string | null = isConnected
    ? (config.connectType === "ig"
        ? (connected[0].fromEmail || `@${connected[0].externalAccountId}`)
        : connected[0].externalAccountId)
    : null

  async function handleEmailConnect() {
    if (!email) return
    setLoading(true)
    try {
      const ok = await onConnect(config.platform!, email)
      if (ok) setEmail("")
    } finally {
      setLoading(false)
    }
  }

  function launchOAuth(path: string, params: Record<string, string | undefined>, onClosed?: () => void) {
    const url = buildOAuthAuthUrl(path, {
      returnTo: "/dashboard/integrations",
      ...params,
    })
    if (onLaunchOAuth) {
      onLaunchOAuth(url, onClosed)
      return
    }
    window.location.href = url
  }

  function handleShopifyConnect() {
    const domain = shop.trim()
    if (!domain) return
    setLoading(true)
    launchOAuth("/api/integrations/shopify/auth", { shop: domain }, () => setLoading(false))
  }

  function handleReauthorize() {
    if (config.connectType === "ig") {
      launchOAuth("/api/integrations/instagram/auth", {})
    } else if (config.connectType === "shopify" && connected[0]) {
      launchOAuth("/api/integrations/shopify/auth", { shop: connected[0].externalAccountId })
    } else if (config.connectType === "email" && connected[0]) {
      const path = getEmailReauthorizePath(connected[0])
      if (path) window.location.href = path
    }
  }

  async function handleKbSync() {
    setKbSyncing(true)
    setKbSyncResult(null)
    try {
      const res = await fetch("/api/integrations/shopify/kb-sync", { method: "POST" })
      if (!res.ok) throw new Error()
      const { syncedPolicies, syncedPages } = await res.json() as { syncedPolicies: number; syncedPages: number }
      const total = syncedPolicies + syncedPages
      setKbSyncResult(`${total} article${total === 1 ? "" : "s"} synced to Knowledge Base`)
    } catch {
      setKbSyncResult("Sync failed , please try again")
    } finally {
      setKbSyncing(false)
      setTimeout(() => setKbSyncResult(null), 4000)
    }
  }

  return (
    <div className={cn(
      "rounded-xl border bg-card overflow-hidden transition-colors",
      isComingSoon
        ? "border-white/[0.04] opacity-50"
        : "border-white/[0.08]",
    )}>
      <div className="relative">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-start gap-4 px-5 py-4 transition-colors hover:bg-white/[0.02] cursor-pointer border-0 bg-transparent text-left [font-family:inherit]"
        >
          <div className={cn(
            "size-11 rounded-lg flex items-center justify-center shrink-0 border",
            config.accentBg,
            config.accentBorder,
          )}>
            <Image src={config.logo} alt={`${config.name} logo`} width={22} height={22} className="object-contain" />
          </div>

          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <p className="text-[15px] font-bold text-white/95 leading-none">{config.name}</p>
              <StatusPill state={pillState} />
              {accountIdInline && (
                <span className="text-xs font-mono text-white/35 truncate max-w-[260px]">{accountIdInline}</span>
              )}
            </div>
            <p className="text-xs text-white/40 leading-relaxed">{config.description}</p>
          </div>

          <div className="flex items-center gap-3 shrink-0 mt-1">
            {isConnected && lastActivity && !needsReauth && (
              <span className="text-xs text-white/30 hidden sm:block">
                synced {formatLastActivityTime(lastActivity)}
              </span>
            )}
            <ChevronDown className={cn("size-4 text-white/25 transition-transform duration-200", open && "rotate-180")} />
          </div>
        </button>
        {needsReauth && (
          <button type="button"
            onClick={handleReauthorize}
            className="absolute right-12 top-4 text-xs font-semibold text-white/80 bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.12] rounded-md px-3 py-1.5 transition-colors"
          >
            Reauthorize
          </button>
        )}
      </div>

      {open && !isComingSoon && (
        <div className="border-t border-white/[0.06] px-5 py-4 space-y-4">
          <ShopifyPermissionsPanel enabled={config.connectType === "shopify" && isConnected} />
          <ConnectedAccounts
            connectType={config.connectType}
            connected={connected}
            onDisconnect={onDisconnect}
          />

          {config.connectType === "email" && (
            <EmailConnectBody
              isConnected={isConnected}
              email={email}
              setEmail={setEmail}
              loading={loading}
              onSave={handleEmailConnect}
            />
          )}

          {config.connectType === "ig" && (
            <InstagramConnectBody isConnected={isConnected} />
          )}

          {config.connectType === "shopify" && (
            <ShopifyConnectBody
              isConnected={isConnected}
              shop={shop}
              setShop={setShop}
              loading={loading}
              onConnect={handleShopifyConnect}
              kbSyncing={kbSyncing}
              kbSyncResult={kbSyncResult}
              onKbSync={handleKbSync}
            />
          )}
        </div>
      )}

      {open && isComingSoon && (
        <ComingSoonConnectBody
          notified={notified}
          onNotify={() => {
            setNotified(true)
            setTimeout(() => setNotified(false), 3000)
          }}
        />
      )}
    </div>
  )
}
