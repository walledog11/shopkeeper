"use client"

import { useState } from "react"
import Image from "next/image"
import { BadgeCheck, Mail } from "lucide-react"
import { cn } from "@/lib/ui/cn"
import { formatLastActivityTime } from "@/lib/format/date"
import { getEmailReauthorizePath } from "@/lib/messaging/email/providers"
import type { ConnectType, PlatformConfig } from "@/lib/integrations/catalog"
import type { Integration } from "@/types"
import { ConnectedAccountRow } from "./ConnectedAccountRow"
import { IntegrationActionsSection, IntegrationPermissionsSection } from "./IntegrationConfigureSections"
import { IntegrationConfigureDialog } from "./IntegrationConfigureDialog"
import { InstagramConnectBody, ShopifyConnectBody } from "./connect-bodies"
import { deriveIntegrationHealth } from "./integration-card-helpers"
import { buildOAuthAuthUrl } from "@/lib/integrations/oauth-flow"

export type { ConnectType, PlatformConfig }

const CARD_BUTTON_FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1a1a1a]"

export const CARD_SHELL = cn(
  "group rounded-2xl bg-[#1a1a1a] border border-white/[0.06] px-5 pt-6 pb-5 flex flex-col scroll-mt-6",
  "transition-all duration-200",
  "hover:border-white/[0.10] hover:shadow-[0_1px_2px_rgba(0,0,0,0.4),0_8px_24px_rgba(0,0,0,0.25)]",
)
const LOGO_TILE = cn(
  "size-14 rounded-2xl flex items-center justify-center shrink-0 overflow-hidden",
  "transition-all duration-200",
  "group-hover:ring-1 group-hover:ring-inset group-hover:ring-white/[0.10]",
)
const LOGO_SOFTEN = "opacity-[0.88] saturate-[0.9] transition-all duration-200 group-hover:opacity-100 group-hover:saturate-100"
const LOGO_IMAGE = cn("object-contain", LOGO_SOFTEN)
export const CARD_TITLE = "text-xl font-bold text-white leading-[22px]"
export const CARD_DESCRIPTION = "text-[13.5px] leading-[18px] text-[#b8b8b8]"
export const CARD_BUTTON = cn("h-10 flex-1 rounded-[10px] text-[17px] font-medium transition-colors", CARD_BUTTON_FOCUS)
export const CARD_BUTTON_PRIMARY = cn(CARD_BUTTON, "bg-[#3d3d3d] hover:bg-[#4a4a4a] text-white")
export const CARD_BUTTON_SECONDARY = cn(CARD_BUTTON, "bg-[#1f1f1f] hover:bg-[#2a2a2a] border border-[#3a3a3a] text-[#d5d5d5]")
export const CARD_BUTTON_AMBER = cn(CARD_BUTTON, "bg-amber-400/10 hover:bg-amber-400/15 border border-amber-400/25 text-amber-300")
export const CARD_BUTTON_DISABLED = cn(CARD_BUTTON, "bg-[#222222] text-white/30 cursor-default")

const FALLBACK_ICONS: Record<string, typeof Mail> = {
  email: Mail,
}

export function CardLogo({ config }: { config: PlatformConfig }) {
  const Icon = FALLBACK_ICONS[config.id]
  const tileClass = cn(LOGO_TILE, config.tileClass)

  if (!config.logo) {
    return (
      <div className={tileClass}>
        {Icon ? (
          <Icon className="size-7 text-white opacity-[0.88] transition-opacity duration-200 group-hover:opacity-100" />
        ) : null}
      </div>
    )
  }

  if (config.fullBleedLogo) {
    const image = (
      <Image
        src={config.logo}
        alt={`${config.name} logo`}
        width={56}
        height={56}
        className={cn(
          "size-full",
          config.tileClass ? "object-cover" : "object-contain",
          LOGO_SOFTEN,
        )}
      />
    )
    return <div className={cn(tileClass, config.tileClass && "p-0")}>{image}</div>
  }

  const logoSize = config.logoSize ?? 40
  return (
    <div className={tileClass}>
      <Image
        src={config.logo}
        alt={`${config.name} logo`}
        width={logoSize}
        height={logoSize}
        className={LOGO_IMAGE}
      />
    </div>
  )
}

export function ShopkeeperBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 self-start">
      <Image src="/logos/shopkeeper-shop-logo.png" alt="" width={20} height={20} className="rounded-[6px]" />
      <span className="text-[13px] font-semibold leading-none text-white">shopkeeper</span>
      <BadgeCheck aria-label="Verified" className="size-3.5 fill-[#1D9BF0] text-white" />
    </span>
  )
}

interface Props {
  config: PlatformConfig
  connected: Integration[]
  onConnect: (platform: string, email: string) => Promise<boolean>
  onDisconnect: (integrationId: string) => void
  onLaunchOAuth?: (url: string, onClosed?: () => void) => void
  lastActivity?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function IntegrationCard({ config, connected, onConnect, onDisconnect, onLaunchOAuth, lastActivity, open, onOpenChange }: Props) {
  const [email, setEmail] = useState("")
  const [shop, setShop] = useState("")
  const [loading, setLoading] = useState(false)
  const [kbSyncing, setKbSyncing] = useState(false)
  const [kbSyncResult, setKbSyncResult] = useState<string | null>(null)

  const isConnected = connected.length > 0
  const isOAuthEmail = config.emailProvider === "gmail" || config.emailProvider === "outlook"

  const health = config.connectType
    ? deriveIntegrationHealth(config.connectType, connected, lastActivity ?? null)
    : { state: 'not-connected' as const, note: null, canFix: false }

  const threadsThisWeek = isConnected ? connected[0].threadsThisWeek ?? 0 : 0
  const activityLabel = config.connectType === "shopify" ? "Last activity" : "Last message"
  const statusLine = !isConnected
    ? config.description
    : health.note ??
      [
        lastActivity ? `${activityLabel} ${formatLastActivityTime(lastActivity)}` : "No messages yet",
        ...(threadsThisWeek > 0
          ? [`${threadsThisWeek} conversation${threadsThisWeek === 1 ? "" : "s"} this week`]
          : []),
      ].join(" · ")

  const dialogStatusLine = isConnected
    ? health.note ?? (
        config.connectType === "email"
          ? null
          : [
              lastActivity ? `${activityLabel} ${formatLastActivityTime(lastActivity)}` : null,
              ...(threadsThisWeek > 0
                ? [`${threadsThisWeek} conversation${threadsThisWeek === 1 ? "" : "s"} this week`]
                : []),
            ].filter(Boolean).join(" · ") || null
      )
    : config.description

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
      setKbSyncResult(`${total} note${total === 1 ? "" : "s"} synced to Memory`)
    } catch {
      setKbSyncResult("Sync failed, please try again")
    } finally {
      setKbSyncing(false)
      setTimeout(() => setKbSyncResult(null), 4000)
    }
  }

  function handleConnectClick() {
    if (config.connectType === "ig") {
      launchOAuth("/api/integrations/instagram/auth", {})
      return
    }
    onOpenChange(true)
  }

  return (
    <>
      <div id={config.id} className={CARD_SHELL}>
        <CardLogo config={config} />

        <p className={cn("mt-4", CARD_TITLE)}>{config.name}</p>
        <p className={cn("mt-2 flex-1", CARD_DESCRIPTION)}>{config.description}</p>

        <div className="mt-3">
          <ShopkeeperBadge />
        </div>

        <div className="mt-4 flex gap-2">
          {config.comingSoon ? (
            <button type="button" disabled className={CARD_BUTTON_DISABLED}>Coming soon</button>
          ) : !isConnected ? (
            isOAuthEmail ? (
              <form action={`/api/integrations/${config.emailProvider}/auth`} method="post" className="flex-1 flex">
                <button type="submit" className={cn(CARD_BUTTON_PRIMARY, "w-full")}>Connect</button>
              </form>
            ) : (
              <button type="button" onClick={handleConnectClick} className={CARD_BUTTON_PRIMARY}>Connect</button>
            )
          ) : (
            <>
              {health.canFix && (
                <button type="button" onClick={handleReauthorize} className={CARD_BUTTON_AMBER}>Fix</button>
              )}
              <button type="button" onClick={() => onOpenChange(true)} className={CARD_BUTTON_SECONDARY}>Configure</button>
            </>
          )}
        </div>
      </div>

      <IntegrationConfigureDialog
        open={open}
        onOpenChange={onOpenChange}
        config={config}
        statusState={isConnected ? health.state : undefined}
        statusLine={dialogStatusLine}
        statusNote={!!health.note}
      >
        {isConnected && config.connectType && (
          <>
            <ConnectedAccountRow
              connectType={config.connectType}
              integration={connected[0]}
            />
            <IntegrationPermissionsSection
              config={config}
              connected={connected}
            />
            <IntegrationActionsSection
              config={config}
              connected={connected}
              kbSyncing={kbSyncing}
              kbSyncResult={kbSyncResult}
              onReauthorize={handleReauthorize}
              onKbSync={handleKbSync}
              onDisconnect={onDisconnect}
              email={config.connectType === "email" ? email : undefined}
              setEmail={config.connectType === "email" ? setEmail : undefined}
              emailLoading={config.connectType === "email" ? loading : undefined}
              onEmailSave={config.connectType === "email" ? handleEmailConnect : undefined}
            />
          </>
        )}

        {!isConnected && config.emailProvider === "postmark" && (
          <>
            <IntegrationPermissionsSection
              config={config}
              connected={connected}
            />
            <IntegrationActionsSection
              config={config}
              connected={connected}
              kbSyncing={kbSyncing}
              kbSyncResult={kbSyncResult}
              onReauthorize={handleReauthorize}
              onKbSync={handleKbSync}
              onDisconnect={onDisconnect}
              email={email}
              setEmail={setEmail}
              emailLoading={loading}
              onEmailSave={handleEmailConnect}
              defaultForwardingOpen
            />
          </>
        )}

        {config.connectType === "shopify" && !isConnected && (
          <ShopifyConnectBody
            isConnected={isConnected}
            shop={shop}
            setShop={setShop}
            loading={loading}
            onConnect={handleShopifyConnect}
          />
        )}

        {config.connectType === "ig" && !isConnected && (
          <InstagramConnectBody isConnected={isConnected} />
        )}

      </IntegrationConfigureDialog>
    </>
  )
}
