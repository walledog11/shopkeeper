"use client"

import { useCallback } from "react"
import type { KeyedMutator } from "swr"
import type { Integration } from "@/types"
import { OAUTH_ERROR_MESSAGES, type OAuthOutcome } from "@/lib/integrations/oauth-contract"
import type { OAuthIntegrationDefinition } from "@/lib/integrations/catalog"
import { useOAuthLauncher } from "@/hooks/useOAuthLauncher"
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
  const handleOutcome = useCallback((nextOutcome: OAuthOutcome, refresh: boolean) => {
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
  }, [gmailNativeInboundEnabled, mutate, onGmailForwardingSetup, showToast])

  const { launch } = useOAuthLauncher({
    outcome,
    onOutcome: (nextOutcome, context) => handleOutcome(nextOutcome, context.refresh),
  })

  return useCallback((
    definition: OAuthIntegrationDefinition,
    params: Record<string, string | undefined>,
    onClosed?: () => void,
    reauthorize?: Integration,
  ) => {
    const authPath = reauthorize && definition.oauth.reauthorizePath
      ? definition.oauth.reauthorizePath(reauthorize) ?? definition.oauth.authPath
      : definition.oauth.authPath
    void launch({
      authPath,
      definition,
      params,
      returnTo: "/dashboard/integrations",
      onClosed: () => {
        void mutate()
        onClosed?.()
      },
    })
  }, [launch, mutate])
}
