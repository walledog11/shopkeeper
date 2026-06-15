"use client"

import { useReducer } from "react"
import { cn } from "@/lib/ui/cn"
import { formatLastActivityTime } from "@/lib/format/date"
import { getEmailReauthorizePath } from "@shopkeeper/email/providers"
import type { PlatformConfig } from "@/lib/integrations/catalog"
import type { Integration } from "@/types"
import { ConnectedAccountRow } from "./ConnectedAccountRow"
import { IntegrationActionsSection, IntegrationPermissionsSection } from "./IntegrationConfigureSections"
import { IntegrationConfigureDialog } from "./IntegrationConfigureDialog"
import { InstagramConnectBody, ShopifyConnectBody } from "./connect-bodies"
import { isShopifyIntegrationLinked } from "@/lib/integrations/shopify-connection"
import { deriveIntegrationHealth } from "./integration-card-helpers"
import { buildOAuthAuthUrl } from "@/lib/integrations/oauth-flow"
import { CardLogo, ShopkeeperBadge } from "./IntegrationCardParts"
import {
  CARD_BUTTON_AMBER,
  CARD_BUTTON_DISABLED,
  CARD_BUTTON_PRIMARY,
  CARD_BUTTON_SECONDARY,
  CARD_DESCRIPTION,
  CARD_SHELL,
  CARD_TITLE,
} from "./integration-card-styles"

interface IntegrationCardState {
  email: string
  kbSyncing: boolean
  kbSyncResult: string | null
  loading: boolean
  shop: string
}

type IntegrationCardAction =
  | { type: "emailChanged"; email: string }
  | { type: "kbSyncingChanged"; kbSyncing: boolean }
  | { type: "kbSyncResultChanged"; kbSyncResult: string | null }
  | { type: "loadingChanged"; loading: boolean }
  | { type: "shopChanged"; shop: string }

const INITIAL_INTEGRATION_CARD_STATE: IntegrationCardState = {
  email: "",
  kbSyncing: false,
  kbSyncResult: null,
  loading: false,
  shop: "",
}

function integrationCardReducer(
  state: IntegrationCardState,
  action: IntegrationCardAction,
): IntegrationCardState {
  switch (action.type) {
    case "emailChanged":
      return { ...state, email: action.email }
    case "kbSyncingChanged":
      return { ...state, kbSyncing: action.kbSyncing }
    case "kbSyncResultChanged":
      return { ...state, kbSyncResult: action.kbSyncResult }
    case "loadingChanged":
      return { ...state, loading: action.loading }
    case "shopChanged":
      return { ...state, shop: action.shop }
  }
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
  const [cardState, dispatchCardState] = useReducer(integrationCardReducer, INITIAL_INTEGRATION_CARD_STATE)
  const { email, kbSyncing, kbSyncResult, loading, shop } = cardState
  const setEmail = (nextEmail: string) => dispatchCardState({ type: "emailChanged", email: nextEmail })
  const setShop = (nextShop: string) => dispatchCardState({ type: "shopChanged", shop: nextShop })

  const isConnected = config.connectType === "shopify"
    ? isShopifyIntegrationLinked(connected[0])
    : connected.length > 0
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
    dispatchCardState({ type: "loadingChanged", loading: true })
    try {
      const ok = await onConnect(config.platform!, email)
      if (ok) dispatchCardState({ type: "emailChanged", email: "" })
    } finally {
      dispatchCardState({ type: "loadingChanged", loading: false })
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
    dispatchCardState({ type: "loadingChanged", loading: true })
    launchOAuth("/api/integrations/shopify/auth", { shop: domain }, () => dispatchCardState({ type: "loadingChanged", loading: false }))
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
    dispatchCardState({ type: "kbSyncingChanged", kbSyncing: true })
    dispatchCardState({ type: "kbSyncResultChanged", kbSyncResult: null })
    try {
      const res = await fetch("/api/integrations/shopify/kb-sync", { method: "POST" })
      if (!res.ok) throw new Error()
      const { syncedPolicies, syncedPages } = await res.json() as { syncedPolicies: number; syncedPages: number }
      const total = syncedPolicies + syncedPages
      dispatchCardState({ type: "kbSyncResultChanged", kbSyncResult: `${total} note${total === 1 ? "" : "s"} synced to Memory` })
    } catch {
      dispatchCardState({ type: "kbSyncResultChanged", kbSyncResult: "Sync failed, please try again" })
    } finally {
      dispatchCardState({ type: "kbSyncingChanged", kbSyncing: false })
      setTimeout(() => dispatchCardState({ type: "kbSyncResultChanged", kbSyncResult: null }), 4000)
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
