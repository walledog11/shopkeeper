"use client"

import { useCallback, useEffect, useEffectEvent, useRef } from "react"
import type { KeyedMutator } from "swr"
import type { Integration } from "@/types"
import { OAUTH_ERROR_MESSAGES, type OAuthOutcome } from "@/lib/integrations/oauth-contract"
import {
  buildOAuthAuthUrl,
  openOAuthPopup,
  subscribeOAuthDone,
  watchOAuthPopup,
} from "@/lib/integrations/oauth-flow"
import type { OAuthIntegrationDefinition } from "@/lib/integrations/catalog"
import { captureClientProductEvent } from "@/lib/product-events"
import { oauthDefinitionForProvider } from "./integration-presentation"

export function useIntegrationsOAuth({
  gmailNativeInboundEnabled,
  mutate,
  onGmailForwardingSetup,
  outcome,
  showToast,
}: {
  gmailNativeInboundEnabled: boolean
  mutate: KeyedMutator<Integration[]>
  onGmailForwardingSetup: () => void
  outcome: OAuthOutcome | null
  showToast: (tone: "success" | "error", message: string) => void
}) {
  const mountedRef = useRef(true)
  const popupWatcherDisposers = useRef(new Set<() => void>())

  const handleOutcome = useEffectEvent((nextOutcome: OAuthOutcome, refresh: boolean) => {
    if (!mountedRef.current) return
    if (refresh) void mutate()
    if (nextOutcome.status === "failed") {
      showToast("error", OAUTH_ERROR_MESSAGES[nextOutcome.error])
      return
    }

    const definition = oauthDefinitionForProvider(nextOutcome.provider)
    if (!definition) return
    showToast("success", definition.oauth.successCopy)
    if (definition.id === "gmail" && !gmailNativeInboundEnabled) {
      onGmailForwardingSetup()
    }
  })

  useEffect(() => {
    mountedRef.current = true
    const disposers = popupWatcherDisposers.current
    return () => {
      mountedRef.current = false
      for (const dispose of disposers) dispose()
      disposers.clear()
    }
  }, [])

  useEffect(() => subscribeOAuthDone((payload) => handleOutcome(payload.outcome, true)), [])

  useEffect(() => {
    if (outcome) handleOutcome(outcome, false)
  }, [outcome])

  return useCallback((
    definition: OAuthIntegrationDefinition,
    params: Record<string, string | undefined>,
    onClosed?: () => void,
    reauthorize?: Integration,
  ) => {
    const authPath = reauthorize && definition.oauth.reauthorizePath
      ? definition.oauth.reauthorizePath(reauthorize) ?? definition.oauth.authPath
      : definition.oauth.authPath
    const url = buildOAuthAuthUrl(authPath, {
      returnTo: "/dashboard/integrations",
      ...params,
    })
    void captureClientProductEvent({
      event: "integration_connection_started",
      platform: definition.oauth.analyticsPlatform,
    })

    const launch = openOAuthPopup(url)
    if (launch.mode === "redirect") {
      onClosed?.()
      return
    }

    let dispose = () => {}
    dispose = watchOAuthPopup(launch.popup, () => {
      popupWatcherDisposers.current.delete(dispose)
      if (!mountedRef.current) return
      void mutate()
      onClosed?.()
    })
    popupWatcherDisposers.current.add(dispose)
  }, [mutate])
}
