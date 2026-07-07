"use client"

import { useEffect, useReducer } from "react"
import { getEmailReauthorizePath } from "@shopkeeper/email/providers"
import type { PlatformConfig } from "@/lib/integrations/catalog"
import { buildOAuthAuthUrl } from "@/lib/integrations/oauth-flow"
import { captureClientProductEvent } from "@/lib/product-events"
import type { Integration } from "@/types"

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

interface UseIntegrationCardActionsParams {
  config: PlatformConfig
  connected: Integration[]
  onConnect: (platform: string, email: string) => Promise<boolean>
  onUpdateEmailAddress?: (integrationId: string, email: string) => Promise<boolean>
  onLaunchOAuth?: (url: string, onClosed?: () => void) => void
  onOpenChange: (open: boolean) => void
}

export function useIntegrationCardActions({
  config,
  connected,
  onConnect,
  onUpdateEmailAddress,
  onLaunchOAuth,
  onOpenChange,
}: UseIntegrationCardActionsParams) {
  const [cardState, dispatchCardState] = useReducer(integrationCardReducer, INITIAL_INTEGRATION_CARD_STATE)
  const { email, kbSyncing, kbSyncResult, loading, shop } = cardState

  const setEmail = (nextEmail: string) => dispatchCardState({ type: "emailChanged", email: nextEmail })
  const setShop = (nextShop: string) => dispatchCardState({ type: "shopChanged", shop: nextShop })
  const connectedIntegrationId = connected[0]?.id
  const connectedFromEmail = connected[0]?.fromEmail
  const connectedExternalAccountId = connected[0]?.externalAccountId

  useEffect(() => {
    if (config.connectType !== "email" || !connectedIntegrationId) return
    dispatchCardState({
      type: "emailChanged",
      email: connectedFromEmail || connectedExternalAccountId || "",
    })
  }, [
    config.connectType,
    connectedExternalAccountId,
    connectedFromEmail,
    connectedIntegrationId,
  ])

  async function handleEmailConnect() {
    if (!email) return
    dispatchCardState({ type: "loadingChanged", loading: true })
    try {
      void captureClientProductEvent({
        event: "integration_connection_started",
        platform: "email",
      })
      const integration = connected[0]
      const ok = integration && onUpdateEmailAddress
        ? await onUpdateEmailAddress(integration.id, email)
        : await onConnect(config.platform!, email)
      if (ok && !integration) dispatchCardState({ type: "emailChanged", email: "" })
    } finally {
      dispatchCardState({ type: "loadingChanged", loading: false })
    }
  }

  function launchOAuth(path: string, params: Record<string, string | undefined>, onClosed?: () => void) {
    const url = buildOAuthAuthUrl(path, {
      returnTo: "/dashboard/integrations",
      ...params,
    })
    const platform = path.includes("/shopify/")
      ? "shopify"
      : path.includes("/instagram/")
        ? "ig_dm"
        : path.includes("/tiktok-shop/")
          ? "tiktok"
          : path.includes("/gmail/") || path.includes("/outlook/")
            ? "email"
            : null
    if (platform) {
      void captureClientProductEvent({
        event: "integration_connection_started",
        platform,
      })
    }
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
    } else if (config.connectType === "tiktok_shop") {
      launchOAuth("/api/integrations/tiktok-shop/auth", {})
    } else if (config.connectType === "shopify" && connected[0]) {
      launchOAuth("/api/integrations/shopify/auth", { shop: connected[0].externalAccountId })
    } else if (config.connectType === "email" && connected[0]) {
      const path = getEmailReauthorizePath(connected[0])
      if (path) {
        void captureClientProductEvent({
          event: "integration_connection_started",
          platform: "email",
        })
        window.location.href = path
      }
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
    if (config.connectType === "tiktok_shop") {
      launchOAuth("/api/integrations/tiktok-shop/auth", {})
      return
    }
    onOpenChange(true)
  }

  return {
    email,
    handleConnectClick,
    handleEmailConnect,
    handleKbSync,
    handleReauthorize,
    handleShopifyConnect,
    kbSyncing,
    kbSyncResult,
    loading,
    setEmail,
    setShop,
    shop,
  }
}
