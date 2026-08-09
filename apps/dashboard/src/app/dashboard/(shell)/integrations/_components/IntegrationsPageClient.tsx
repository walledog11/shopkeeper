"use client"

import { Suspense, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useOrganization } from "@clerk/nextjs"
import { CheckCircle2, AlertCircle, AlertTriangle, Info } from "lucide-react"
import { cn } from "@/lib/ui/cn"
import { useIntegrations } from "@/hooks/useIntegrations"
import { getEmailProvider } from "@shopkeeper/email/providers"
import { INTEGRATION_CHANNEL_SECTIONS, PLATFORM_CONFIG, sortPlatformConfigsByChannelKind, type IntegrationChannelKind, type PlatformConfig } from "@/lib/integrations/catalog"
import { OAUTH_ERROR_MESSAGES, parseOAuthOutcome } from "@/lib/integrations/oauth-contract"
import {
  openOAuthPopup,
  subscribeOAuthDone,
  watchOAuthPopup,
  type OAuthDoneMessage,
} from "@/lib/integrations/oauth-flow"
import { filterOperatorPlatformConfigs } from "@/lib/integrations/operator-channel-visibility"
import type { TelegramMemberStatus } from "@/lib/integrations/telegram-status"
import IntegrationCard from "@/components/integrations/IntegrationCard"
import { CARD_ACTIONS, CARD_DESCRIPTION, CARD_SHELL } from "@/components/integrations/integration-card-styles"
import TelegramCard from "@/components/integrations/TelegramCard"
import ImessageCard from "@/components/integrations/ImessageCard"
import {
  getShopifyDisconnectMessage,
  resolveShopifyConnectionState,
} from "@/lib/integrations/shopify-connection"
import { hasIntegrationTokenAlert } from "@/components/integrations/integration-card-helpers"
import { Skeleton } from "@/components/ui/skeleton"
import type { Integration } from "@/types"

const INTEGRATION_CARD_GRID = "grid items-stretch gap-4 grid-cols-[repeat(auto-fill,minmax(340px,1fr))]"

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
        <p className="text-xs text-faint mt-1">{description}</p>
      </div>
      <div className={cn(INTEGRATION_CARD_GRID, "w-fit max-w-full")}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className={CARD_SHELL}>
            <div className="flex items-center gap-3">
              <Skeleton className="size-8 rounded-lg shrink-0" />
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

export default function IntegrationsPageClient({
  telegramBotUsername,
  initialTelegramStatus,
  imessageHandle,
  gmailNativeInboundEnabled,
  instagramIntegrationEnabled,
  tiktokShopConfigured,
  initialIntegrations,
}: {
  telegramBotUsername: string | null
  initialTelegramStatus: TelegramMemberStatus | null
  imessageHandle: string | null
  gmailNativeInboundEnabled: boolean
  instagramIntegrationEnabled: boolean
  tiktokShopConfigured: boolean
  initialIntegrations?: Integration[]
}) {
  return (
    <Suspense fallback={null}>
      <IntegrationsPageContent
        telegramBotUsername={telegramBotUsername}
        initialTelegramStatus={initialTelegramStatus}
        imessageHandle={imessageHandle}
        gmailNativeInboundEnabled={gmailNativeInboundEnabled}
        instagramIntegrationEnabled={instagramIntegrationEnabled}
        tiktokShopConfigured={tiktokShopConfigured}
        initialIntegrations={initialIntegrations}
      />
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
}: {
  telegramBotUsername: string | null
  initialTelegramStatus: TelegramMemberStatus | null
  imessageHandle: string | null
  gmailNativeInboundEnabled: boolean
  instagramIntegrationEnabled: boolean
  tiktokShopConfigured: boolean
  initialIntegrations?: Integration[]
}) {
  const searchParams = useSearchParams()
  const { membership } = useOrganization()
  const isAdmin = membership?.role === 'org:admin'
  const { data, mutate } = useIntegrations({
    fallbackData: initialIntegrations,
  })
  const integrations = useMemo(() => data ?? [], [data])
  const loaded = data !== undefined
  const [openId, setOpenId] = useState<string | null>(null)
  const shopifyPresenceRef = useRef<ReturnType<typeof resolveShopifyConnectionState> | null>(null)

  const [toast, setToast] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showToast = useCallback((tone: 'success' | 'error', message: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    setToast({ tone, message })
    toastTimeoutRef.current = setTimeout(() => setToast(null), 5000)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    const outcome = parseOAuthOutcome(params)
    if (outcome?.status === 'connected' && outcome.provider === 'instagram') showToast('success', 'Instagram connected.')
    else if (outcome?.status === 'connected' && outcome.provider === 'shopify') showToast('success', 'Shopify store connected.')
    else if (outcome?.status === 'connected' && outcome.provider === 'gmail') {
      showToast('success', 'Gmail connected.')
      if (!gmailNativeInboundEnabled) {
        setOpenId('gmail')
      }
    }
    else if (outcome?.status === 'connected' && outcome.provider === 'tiktok-shop') showToast('success', 'TikTok Shop connected.')
    else if (outcome?.status === 'failed') showToast('error', OAUTH_ERROR_MESSAGES[outcome.error])
  }, [gmailNativeInboundEnabled, searchParams, showToast])

  const handleOAuthResult = useEffectEvent((payload: OAuthDoneMessage) => {
    void mutate()
    if (payload.outcome.status === 'failed') {
      showToast('error', OAUTH_ERROR_MESSAGES[payload.outcome.error])
      return
    }
    const provider = payload.outcome.provider
    if (provider === 'gmail' && !gmailNativeInboundEnabled) {
      setOpenId('gmail')
    }
    if (provider === 'instagram') {
      showToast('success', 'Instagram connected.')
    } else if (provider === 'shopify') {
      showToast('success', 'Shopify store connected.')
    } else if (provider === 'gmail') {
      showToast('success', 'Gmail connected.')
    } else if (provider === 'tiktok-shop') {
      showToast('success', 'TikTok Shop connected.')
    }
  })

  useEffect(() => subscribeOAuthDone((payload) => handleOAuthResult(payload)), [])

  useEffect(() => {
    if (!loaded) return
    const shopify = integrations.find(i => i.platform === 'shopify')
    const nextPresence = resolveShopifyConnectionState(shopify)
    const previousPresence = shopifyPresenceRef.current
    shopifyPresenceRef.current = nextPresence

    if (previousPresence !== 'active') return

    const message = getShopifyDisconnectMessage(nextPresence)
    if (!message) return

    setOpenId(prev => (prev === 'shopify' ? null : prev))
    showToast('error', message)
  }, [integrations, loaded, showToast])

  const launchOAuth = useCallback((url: string, onClosed?: () => void) => {
    const launch = openOAuthPopup(url)
    if (launch.mode === 'redirect') {
      onClosed?.()
      return
    }
    watchOAuthPopup(launch.popup, () => {
      void mutate()
      onClosed?.()
    })
  }, [mutate])

  async function handleConnect(platform: string, value: string): Promise<boolean> {
    try {
      const res = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, externalAccountId: value }),
      })
      if (!res.ok) throw new Error()
      await mutate()
      return true
    } catch {
      showToast('error', 'Failed to connect. Please try again.')
      return false
    }
  }

  async function handleDisconnect(integrationId: string) {
    try {
      const res = await fetch(`/api/integrations/${integrationId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      await mutate()
      setOpenId(null)
      showToast('success', 'Disconnected.')
    } catch {
      showToast('error', 'Failed to disconnect. Please try again.')
    }
  }

  async function handleUpdateEmailAddress(
    integrationId: string,
    fromEmail: string,
  ): Promise<boolean> {
    try {
      const res = await fetch(`/api/integrations/${integrationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromEmail }),
      })
      if (!res.ok) throw new Error()
      await mutate()
      showToast('success', 'Support address updated.')
      return true
    } catch {
      showToast('error', 'Enter a valid support email address and try again.')
      return false
    }
  }

  async function handleSetDefaultEmail(integrationId: string): Promise<void> {
    try {
      const res = await fetch('/api/integrations/email/default', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integrationId }),
      })
      if (!res.ok) throw new Error()
      await mutate()
      showToast('success', 'Default email integration updated.')
    } catch {
      showToast('error', 'Failed to update the default email integration.')
    }
  }

  const getConnected = (def: PlatformConfig) => {
    if (!def.platform) return []
    return integrations.filter(i =>
      i.platform === def.platform &&
      (!def.emailProvider || getEmailProvider(i) === def.emailProvider)
    )
  }
  const getLastActivity = (def: PlatformConfig) =>
    getConnected(def)[0]?.lastActivity ?? null

  const alertCount = integrations.filter(hasIntegrationTokenAlert).length

  const telegramAvailability = useMemo(
    () => ({
      botUsername: telegramBotUsername
        ?? initialTelegramStatus?.botUsername
        ?? null,
    }),
    [telegramBotUsername, initialTelegramStatus?.botUsername],
  )
  const runtimePlatformConfig = useMemo(
    () => PLATFORM_CONFIG.map(def => {
      if (def.id === 'instagram') {
        return {
          ...def,
          connectDisabled: !instagramIntegrationEnabled,
          description: instagramIntegrationEnabled
            ? def.description
            : 'Instagram DM connections are currently limited to the private beta.',
        }
      }
      return def.id === 'tiktok-shop'
        ? {
          ...def,
          comingSoon: !tiktokShopConfigured,
          description: tiktokShopConfigured
            ? def.description
            : 'Buyer messages from your TikTok Shop, answered in the same inbox. Not open yet — we will turn it on for you when it is.',
          }
        : def
    }),
    [instagramIntegrationEnabled, tiktokShopConfigured],
  )
  const visiblePlatformConfig = useMemo(
    () => filterOperatorPlatformConfigs(runtimePlatformConfig, {
      telegram: telegramAvailability,
      imessage: { lineHandle: imessageHandle },
    }),
    [runtimePlatformConfig, telegramAvailability, imessageHandle],
  )
  const platformConfigsByChannelKind = useMemo(() => ({
    support: sortPlatformConfigsByChannelKind(visiblePlatformConfig, 'support'),
    operator: sortPlatformConfigsByChannelKind(visiblePlatformConfig, 'operator'),
  }), [visiblePlatformConfig])

  function renderIntegrationCard(def: PlatformConfig) {
    if (def.id === 'telegram') {
      return (
        <TelegramCard
          key={def.id}
          config={def}
          botUsername={telegramBotUsername}
          initialStatus={initialTelegramStatus}
        />
      )
    }

    if (def.id === 'imessage') {
      return <ImessageCard key={def.id} config={def} handle={imessageHandle} />
    }

    return (
      <IntegrationCard
        key={def.id}
        config={def}
        connected={getConnected(def)}
        lastActivity={getLastActivity(def)}
        onConnect={handleConnect}
        onUpdateEmailAddress={handleUpdateEmailAddress}
        onDisconnect={handleDisconnect}
        onSetDefaultEmail={handleSetDefaultEmail}
        onLaunchOAuth={launchOAuth}
        open={openId === def.id}
        onOpenChange={(o) => setOpenId(o ? def.id : null)}
        gmailNativeInboundEnabled={gmailNativeInboundEnabled}
      />
    )
  }

  function renderIntegrationSection(
    sectionKind: IntegrationChannelKind,
    title: string,
    description: string,
    configs: PlatformConfig[],
  ) {
    if (configs.length === 0) return null

    return (
      <section key={sectionKind} className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-strong">{title}</h2>
          <p className="text-xs text-faint mt-1">{description}</p>
        </div>
        <div className={cn(INTEGRATION_CARD_GRID, "w-fit max-w-full")}>
          {configs.map(renderIntegrationCard)}
        </div>
      </section>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="w-full px-6 py-6 space-y-6">

        {/* Connecting or disconnecting a store binds provider credentials to the
            whole workspace, so it is admin-only server-side. Binding your own
            Telegram/iMessage device stays open to every member. */}
        {!isAdmin && (
          <div className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm border border-foreground/[0.10] bg-foreground/[0.03] text-muted-foreground">
            <Info className="size-4 shrink-0" />
            <span>
              Only workspace admins can connect or disconnect integrations. You can still link your own Telegram or iMessage.
            </span>
          </div>
        )}

        {/* Attention banner — only when something needs fixing */}
        {alertCount > 0 && (
          <div className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm border border-amber-600/[0.20] bg-amber-600/[0.04] text-amber-600">
            <AlertTriangle className="size-4 shrink-0" />
            <span>
              {alertCount} connection{alertCount > 1 ? 's' : ''} need{alertCount > 1 ? '' : 's'} attention — use the Fix button below.
            </span>
          </div>
        )}

        {/* Integrations */}
        {loaded ? (
          <div className="grid gap-8 lg:grid-cols-2 items-start">
            {INTEGRATION_CHANNEL_SECTIONS.map(section => renderIntegrationSection(
              section.kind,
              section.title,
              section.description,
              platformConfigsByChannelKind[section.kind],
            ))}
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-2 items-start">
            {INTEGRATION_CHANNEL_SECTIONS.map(section => renderIntegrationSkeletonSection(
              section.kind,
              section.title,
              section.description,
              4,
            ))}
          </div>
        )}

        </div>
      </div>

      {/* Toast */}
      {toast && (
        <button
          type="button"
          onClick={() => setToast(null)}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-secondary border border-border text-foreground text-sm font-medium px-4 py-2.5 rounded-md shadow-lg cursor-pointer hover:bg-accent transition-colors"
        >
          {toast.tone === 'error'
            ? <AlertCircle className="size-4 text-red-600 shrink-0" />
            : <CheckCircle2 className="size-4 text-green-600 shrink-0" />
          }
          {toast.message}
        </button>
      )}
    </div>
  )
}
