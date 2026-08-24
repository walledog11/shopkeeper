"use client"

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useOrganization } from "@clerk/nextjs"
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react"
import { cn } from "@/lib/ui/cn"
import { errorMessageFromUnknown } from "@/lib/api/fetcher"
import { useIntegrations } from "@/hooks/useIntegrations"
import {
  INTEGRATION_CHANNEL_SECTIONS,
  sortIntegrationDefinitionsByChannelKind,
  type IntegrationChannelKind,
} from "@/lib/integrations/catalog"
import { parseOAuthOutcome } from "@/lib/integrations/oauth-contract"
import type { TelegramMemberStatus } from "@/lib/integrations/telegram-status"
import {
  connectForwardingEmail,
  disconnectIntegration,
  setDefaultEmailIntegration,
  syncShopifyKnowledgeBase,
  updateIntegrationEmail,
  updateShopifyStorefrontChat,
} from "@/lib/integrations/requests"
import IntegrationCard from "@/components/integrations/IntegrationCard"
import type { IntegrationCardCallbacks } from "@/components/integrations/IntegrationCardDetails"
import {
  deriveIntegrationCardModels,
  integrationAttentionSummary,
  type IntegrationCardModel,
} from "@/components/integrations/integration-presentation"
import { useIntegrationsOAuth } from "@/components/integrations/useIntegrationsOAuth"
import { CARD_ACTIONS, CARD_DESCRIPTION, CARD_SHELL } from "@/components/integrations/integration-card-styles"
import TelegramCard from "@/components/integrations/TelegramCard"
import ImessageCard from "@/components/integrations/ImessageCard"
import { dashboardChromeColumnClassName } from "@/app/dashboard/_components/sidebar/sidebar-helpers"
import { getShopifyDisconnectMessage, resolveShopifyConnectionState } from "@/lib/integrations/shopify-connection"
import { Skeleton } from "@/components/ui/skeleton"
import type { Integration } from "@/types"
import { EmailSpamFilterCard } from "./EmailSpamFilterCard"

const INTEGRATION_CARD_GRID = "grid items-stretch gap-4 auto-rows-fr grid-cols-[repeat(auto-fill,minmax(340px,1fr))]"

function renderIntegrationSkeletonSection(
  sectionKind: IntegrationChannelKind,
  title: string,
  description: string,
  count: number,
) {
  return (
    <section key={sectionKind} className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-strong">{title}</h2>
        <p className="mt-1 text-xs text-faint">{description}</p>
      </div>
      <div className={cn(INTEGRATION_CARD_GRID, "w-full")}>
        {Array.from({ length: count }).map((_, index) => (
          <div key={index} className={CARD_SHELL}>
            <div className="flex items-center gap-3">
              <Skeleton className="size-8 shrink-0 rounded-lg" />
              <Skeleton className="h-5 w-28" />
            </div>
            <div className={CARD_DESCRIPTION}>
              <div className="space-y-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-3 w-3/5" />
              </div>
            </div>
            <div className={CARD_ACTIONS}>
              <Skeleton className="h-10 w-full rounded-[10px]" />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

interface IntegrationsPageProps {
  telegramBotUsername: string | null
  initialTelegramStatus: TelegramMemberStatus | null
  imessageHandle: string | null
  gmailNativeInboundEnabled: boolean
  instagramIntegrationEnabled: boolean
  tiktokShopConfigured: boolean
  initialIntegrations?: Integration[]
  shopifyClientId: string | null
  storefrontChatGloballyEnabled: boolean
}

export default function IntegrationsPageClient(props: IntegrationsPageProps) {
  return (
    <Suspense fallback={null}>
      <IntegrationsPageContent {...props} />
    </Suspense>
  )
}

function IntegrationsPageContent({
  telegramBotUsername,
  initialTelegramStatus,
  imessageHandle,
  gmailNativeInboundEnabled,
  instagramIntegrationEnabled,
  tiktokShopConfigured,
  initialIntegrations,
  shopifyClientId,
  storefrontChatGloballyEnabled,
}: IntegrationsPageProps) {
  const searchParams = useSearchParams()
  const { membership } = useOrganization()
  const isAdmin = membership?.role === "org:admin"
  const { data, mutate } = useIntegrations({ fallbackData: initialIntegrations })
  const integrations = useMemo(() => data ?? [], [data])
  const loaded = data !== undefined
  const [openId, setOpenId] = useState<string | null>(null)
  const shopifyPresenceRef = useRef<ReturnType<typeof resolveShopifyConnectionState> | null>(null)
  const mountedRef = useRef(true)
  const [toast, setToast] = useState<{ tone: "success" | "error"; message: string } | null>(null)
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    }
  }, [])

  const showToast = useCallback((tone: "success" | "error", message: string) => {
    if (!mountedRef.current) return
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    setToast({ tone, message })
    toastTimeoutRef.current = setTimeout(() => {
      if (mountedRef.current) setToast(null)
    }, 5000)
  }, [])

  const oauthOutcome = useMemo(
    () => parseOAuthOutcome(new URLSearchParams(searchParams.toString())),
    [searchParams],
  )
  const launchOAuth = useIntegrationsOAuth({
    gmailNativeInboundEnabled,
    mutate,
    onGmailForwardingSetup: () => setOpenId("gmail"),
    outcome: oauthOutcome,
    showToast,
  })

  const models = useMemo(() => deriveIntegrationCardModels({
    integrations,
    flags: {
      gmailNativeInboundEnabled,
      instagramIntegrationEnabled,
      tiktokShopConfigured,
      telegramBotUsername: telegramBotUsername ?? initialTelegramStatus?.botUsername ?? null,
      imessageHandle,
    },
    isAdmin,
  }), [
    gmailNativeInboundEnabled,
    imessageHandle,
    initialTelegramStatus?.botUsername,
    instagramIntegrationEnabled,
    integrations,
    isAdmin,
    telegramBotUsername,
    tiktokShopConfigured,
  ])

  const visibleModels = useMemo(() => models.filter((model) => model.visible), [models])
  const modelsByChannelKind = useMemo(() => ({
    support: sortIntegrationDefinitionsByChannelKind(
      visibleModels.map((model) => model.definition),
      "support",
    ).flatMap((definition) => {
      const model = visibleModels.find((candidate) => candidate.definition.id === definition.id)
      return model ? [model] : []
    }),
    operator: sortIntegrationDefinitionsByChannelKind(
      visibleModels.map((model) => model.definition),
      "operator",
    ).flatMap((definition) => {
      const model = visibleModels.find((candidate) => candidate.definition.id === definition.id)
      return model ? [model] : []
    }),
  }), [visibleModels])
  const attention = useMemo(() => integrationAttentionSummary(models), [models])
  const emailConnected = integrations.some((integration) => integration.platform === "email")

  useEffect(() => {
    if (!loaded) return
    const shopify = models.find((model) => model.definition.id === "shopify")?.selectedConnection ?? undefined
    const nextPresence = resolveShopifyConnectionState(shopify)
    const previousPresence = shopifyPresenceRef.current
    shopifyPresenceRef.current = nextPresence
    if (previousPresence !== "active") return

    const message = getShopifyDisconnectMessage(nextPresence)
    if (!message) return
    setOpenId((previous) => previous === "shopify" ? null : previous)
    showToast("error", message)
  }, [loaded, models, showToast])

  const requireAdmin = useCallback(() => {
    if (isAdmin) return true
    showToast("error", "Only workspace admins can manage integrations.")
    return false
  }, [isAdmin, showToast])

  const callbacks = useMemo<IntegrationCardCallbacks>(() => ({
    async connectForwardingEmail(email) {
      if (!requireAdmin()) return false
      try {
        await connectForwardingEmail("email", email)
        await mutate()
        return true
      } catch (error) {
        showToast("error", errorMessageFromUnknown(error, "Failed to connect. Please try again."))
        return false
      }
    },
    async disconnect(integrationId) {
      if (!requireAdmin()) return false
      try {
        await disconnectIntegration(integrationId)
        void mutate(
          current => current?.filter(integration => integration.id !== integrationId),
          { revalidate: true },
        ).catch(() => undefined)
        setOpenId(null)
        showToast("success", "Disconnect started.")
        return true
      } catch (error) {
        showToast("error", errorMessageFromUnknown(error, "Failed to disconnect. Please try again."))
        return false
      }
    },
    launchOAuth(definition, params, onClosed, reauthorize) {
      if (!requireAdmin()) return
      launchOAuth(definition, params, onClosed, reauthorize)
    },
    async setDefaultEmail(integrationId) {
      if (!requireAdmin()) return
      try {
        await setDefaultEmailIntegration(integrationId)
        await mutate()
        showToast("success", "Default email integration updated.")
      } catch (error) {
        showToast("error", errorMessageFromUnknown(error, "Failed to update the default email integration."))
      }
    },
    async syncShopifyKnowledgeBase() {
      if (!requireAdmin()) throw new Error("Only workspace admins can manage integrations.")
      return syncShopifyKnowledgeBase()
    },
    async updateShopifyStorefrontChat(enabled) {
      if (!requireAdmin()) return false
      try {
        await updateShopifyStorefrontChat(enabled)
        await mutate()
        showToast("success", enabled ? "Storefront chat enabled." : "Storefront chat disabled.")
        return true
      } catch (error) {
        showToast("error", errorMessageFromUnknown(error, "Failed to update storefront chat. Please try again."))
        return false
      }
    },
    async updateEmailAddress(integrationId, email) {
      if (!requireAdmin()) return false
      try {
        await updateIntegrationEmail(integrationId, email)
        await mutate()
        showToast("success", "Support address updated.")
        return true
      } catch (error) {
        showToast("error", errorMessageFromUnknown(error, "Enter a valid support email address and try again."))
        return false
      }
    },
  }), [launchOAuth, mutate, requireAdmin, showToast])

  function renderIntegrationCard(model: IntegrationCardModel) {
    const { definition } = model
    if (definition.kind === "personal-device" && definition.device === "telegram") {
      return (
        <TelegramCard
          key={definition.id}
          config={definition}
          botUsername={telegramBotUsername}
          initialStatus={initialTelegramStatus}
        />
      )
    }
    if (definition.kind === "personal-device" && definition.device === "imessage") {
      return <ImessageCard key={definition.id} config={definition} handle={imessageHandle} />
    }
    return (
      <IntegrationCard
        key={definition.id}
        model={model}
        callbacks={callbacks}
        open={openId === definition.id}
        onOpenChange={(open) => setOpenId(open ? definition.id : null)}
        shopifyClientId={shopifyClientId}
        storefrontChatGloballyEnabled={storefrontChatGloballyEnabled}
      />
    )
  }

  function renderIntegrationSection(
    sectionKind: IntegrationChannelKind,
    title: string,
    description: string,
    sectionModels: IntegrationCardModel[],
  ) {
    if (sectionModels.length === 0) return null
    return (
      <section key={sectionKind} className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-strong">{title}</h2>
          <p className="mt-1 text-xs text-faint">{description}</p>
        </div>
        <div className={cn(INTEGRATION_CARD_GRID, "w-full")}>
          {sectionModels.map(renderIntegrationCard)}
        </div>
      </section>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className={cn(dashboardChromeColumnClassName(), "space-y-6 py-6 md:pt-16")}>
          {!isAdmin ? (
            <div className="flex items-center gap-3 rounded-lg border border-foreground/[0.10] bg-foreground/[0.03] px-4 py-3 text-sm text-muted-foreground">
              <Info className="size-4 shrink-0" />
              <span>Only workspace admins can connect or disconnect integrations. You can still link your own Telegram or iMessage.</span>
            </div>
          ) : null}

          {attention.copy ? (
            <div className="flex items-center gap-3 rounded-lg border border-amber-600/[0.20] bg-amber-600/[0.04] px-4 py-3 text-sm text-amber-600">
              <AlertTriangle className="size-4 shrink-0" />
              <span>{attention.copy}</span>
            </div>
          ) : null}

          {loaded && emailConnected ? (
            <section className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-strong">Inbound email</h2>
                <p className="mt-1 text-xs text-faint">How customer mail is filtered before it becomes a ticket.</p>
              </div>
              <EmailSpamFilterCard />
            </section>
          ) : null}

          {loaded ? (
            <div className="grid items-start gap-8 lg:grid-cols-2">
              {INTEGRATION_CHANNEL_SECTIONS.map((section) => renderIntegrationSection(
                section.kind,
                section.title,
                section.description,
                modelsByChannelKind[section.kind],
              ))}
            </div>
          ) : (
            <div className="grid items-start gap-8 lg:grid-cols-2">
              {INTEGRATION_CHANNEL_SECTIONS.map((section) => renderIntegrationSkeletonSection(
                section.kind,
                section.title,
                section.description,
                4,
              ))}
            </div>
          )}
        </div>
      </div>

      {toast ? (
        <button
          type="button"
          onClick={() => setToast(null)}
          className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 cursor-pointer items-center gap-2 rounded-md border border-border bg-secondary px-4 py-2.5 text-sm font-medium text-foreground shadow-lg transition-colors hover:bg-accent"
        >
          {toast.tone === "error"
            ? <AlertCircle className="size-4 shrink-0 text-red-600" />
            : <CheckCircle2 className="size-4 shrink-0 text-green-600" />}
          {toast.message}
        </button>
      ) : null}
    </div>
  )
}
