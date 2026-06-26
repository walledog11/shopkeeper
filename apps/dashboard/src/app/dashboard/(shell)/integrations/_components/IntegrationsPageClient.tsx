"use client"

import { Suspense, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import useSWR from "swr"
import { CheckCircle2, AlertCircle, AlertTriangle } from "lucide-react"
import { fetcher } from "@/lib/api/fetcher"
import { cn } from "@/lib/ui/cn"
import { useIntegrations } from "@/hooks/useIntegrations"
import { getEmailProvider } from "@shopkeeper/email/providers"
import { OAUTH_ERROR_MESSAGES, INTEGRATION_CHANNEL_SECTIONS, PLATFORM_CONFIG, sortPlatformConfigsByChannelKind, type IntegrationChannelKind, type PlatformConfig } from "@/lib/integrations/catalog"
import {
  openOAuthPopup,
  subscribeOAuthDone,
  watchOAuthPopup,
  type OAuthDoneMessage,
} from "@/lib/integrations/oauth-flow"
import { filterTelegramPlatformConfigs, shouldShowTelegramIntegration } from "@/lib/integrations/telegram-visibility"
import IntegrationCard from "@/components/integrations/IntegrationCard"
import { CARD_SHELL } from "@/components/integrations/integration-card-styles"
import TelegramCard from "@/components/integrations/TelegramCard"
import ImessageCard from "@/components/integrations/ImessageCard"
import {
  getShopifyDisconnectMessage,
  isShopifyIntegrationActive,
  resolveShopifyConnectionState,
} from "@/lib/integrations/shopify-connection"
import { hasIntegrationTokenAlert } from "@/components/integrations/integration-card-helpers"
import { Skeleton } from "@/components/ui/skeleton"
import type { Integration } from "@/types"

// ── Page ───────────────────────────────────────────────────────────────────────

const INTEGRATION_CARD_GRID = "grid gap-4 grid-cols-[repeat(auto-fill,minmax(340px,1fr))]"

export default function IntegrationsPageClient({
  telegramBotUsername,
  imessageHandle,
}: {
  telegramBotUsername: string | null
  imessageHandle: string | null
}) {
  return (
    <Suspense fallback={null}>
      <IntegrationsPageContent telegramBotUsername={telegramBotUsername} imessageHandle={imessageHandle} />
    </Suspense>
  )
}

function IntegrationsPageContent({
  telegramBotUsername,
  imessageHandle,
}: {
  telegramBotUsername: string | null
  imessageHandle: string | null
}) {
  const searchParams = useSearchParams()
  const { data, mutate } = useIntegrations()
  const { data: telegramStatus } = useSWR<{ connected: boolean; botUsername: string | null }>('/api/integrations/telegram', fetcher)
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
    const connected = params.get('connected')
    const error = params.get('error')
    if (connected === 'instagram') showToast('success', 'Instagram connected.')
    else if (connected === 'shopify') showToast('success', 'Shopify store connected.')
    else if (connected === 'gmail') showToast('success', 'Gmail connected.')
    else if (connected === 'outlook') showToast('success', 'Outlook connected.')
    else if (error) showToast('error', OAUTH_ERROR_MESSAGES[error] ?? 'An unexpected error occurred.')
  }, [searchParams, showToast])

  const handleOAuthResult = useEffectEvent((payload: OAuthDoneMessage) => {
    void mutate()
    setOpenId(null)
    if (payload.connected === 'instagram') {
      showToast('success', 'Instagram connected.')
    } else if (payload.connected === 'shopify') {
      showToast('success', 'Shopify store connected.')
    } else if (payload.connected === 'gmail') {
      showToast('success', 'Gmail connected.')
    } else if (payload.connected === 'outlook') {
      showToast('success', 'Outlook connected.')
    } else if (payload.error) {
      showToast('error', OAUTH_ERROR_MESSAGES[payload.error] ?? 'An unexpected error occurred.')
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
    const popup = openOAuthPopup(url)
    if (!popup) {
      onClosed?.()
      return
    }
    watchOAuthPopup(popup, () => {
      void mutate()
      setOpenId(null)
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
      showToast('success', 'Disconnected.')
    } catch {
      showToast('error', 'Failed to disconnect. Please try again.')
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
    def.platform ? integrations.find(i => i.platform === def.platform)?.lastActivity ?? null : null

  const alertCount = integrations.filter(hasIntegrationTokenAlert).length

  const hasShopify = integrations.some(i => i.platform === 'shopify' && isShopifyIntegrationActive(i))
  const hasEmail = integrations.some(i => i.platform === 'email')
  const telegramAvailability = useMemo(
    () => ({ botUsername: telegramBotUsername ?? telegramStatus?.botUsername ?? null }),
    [telegramBotUsername, telegramStatus?.botUsername],
  )
  const showTelegram = shouldShowTelegramIntegration(telegramAvailability)
  const visiblePlatformConfig = useMemo(
    () => filterTelegramPlatformConfigs(PLATFORM_CONFIG, telegramAvailability),
    [telegramAvailability],
  )
  const platformConfigsByChannelKind = useMemo(() => ({
    support: sortPlatformConfigsByChannelKind(visiblePlatformConfig, 'support'),
    operator: sortPlatformConfigsByChannelKind(visiblePlatformConfig, 'operator'),
  }), [visiblePlatformConfig])
  const setupSteps = [
    { id: 'shopify', label: 'Connect your Shopify store', detail: 'So Shopkeeper can look up orders and customers for you.', done: hasShopify },
    { id: 'email', label: 'Connect your support email', detail: 'Customer emails become tickets you can answer in one place.', done: hasEmail },
    showTelegram ? { id: 'telegram', label: 'Link Telegram on your phone', detail: 'Approve replies and get updates wherever you are.', done: telegramStatus?.connected ?? false } : null,
  ].filter((step): step is { id: string; label: string; detail: string; done: boolean } => step !== null)
  const showSetup = loaded && (!hasShopify || !hasEmail)
  const nextStepIndex = setupSteps.findIndex(s => !s.done)
  const setupDoneCount = setupSteps.filter(s => s.done).length

  function goToStep(stepId: string) {
    if (stepId === 'shopify') {
      setOpenId('shopify')
      return
    }
    const targetId = stepId === 'email' ? 'gmail' : stepId
    document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  function renderIntegrationCard(def: PlatformConfig) {
    if (def.id === 'telegram') {
      return <TelegramCard key={def.id} config={def} botUsername={telegramBotUsername} />
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
        onDisconnect={handleDisconnect}
        onLaunchOAuth={launchOAuth}
        open={openId === def.id}
        onOpenChange={(o) => setOpenId(o ? def.id : null)}
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
          <h2 className="text-sm font-semibold text-foreground/80">{title}</h2>
          <p className="text-xs text-foreground/35 mt-1">{description}</p>
        </div>
        <div className={cn(INTEGRATION_CARD_GRID, "w-fit max-w-full")}>
          {configs.map(renderIntegrationCard)}
        </div>
      </section>
    )
  }

  function renderIntegrationSkeletonSection(
    sectionKind: IntegrationChannelKind,
    title: string,
    description: string,
    count: number,
  ) {
    return (
      <section key={sectionKind} className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground/80">{title}</h2>
          <p className="text-xs text-foreground/35 mt-1">{description}</p>
        </div>
        <div className={cn(INTEGRATION_CARD_GRID, "w-fit max-w-full")}>
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className={cn(CARD_SHELL, "space-y-4")}>
              <Skeleton className="size-14 rounded-2xl" />
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-10 w-full rounded-[10px]" />
            </div>
          ))}
        </div>
      </section>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="w-full px-6 py-6 space-y-6">

        {/* Attention banner — only when something needs fixing */}
        {alertCount > 0 && (
          <div className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm border border-amber-400/[0.20] bg-amber-400/[0.04] text-amber-400">
            <AlertTriangle className="size-4 shrink-0" />
            <span>
              {alertCount} connection{alertCount > 1 ? 's' : ''} need{alertCount > 1 ? '' : 's'} attention — use the Fix button below.
            </span>
          </div>
        )}

        {/* Setup progress — until Shopify and email are connected */}
        {showSetup && (
          <div className="rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] px-5 py-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold text-foreground/80">Connect your channels</p>
              <p className="text-xs text-foreground/35">{setupDoneCount} of {setupSteps.length} connected</p>
            </div>
            <ol className="mt-3 space-y-2.5">
              {setupSteps.map((step, i) => (
                <li key={step.id} className="flex items-start gap-3">
                  {step.done ? (
                    <CheckCircle2 className="size-4 mt-0.5 text-emerald-400 shrink-0" />
                  ) : (
                    <span className={cn(
                      "size-4 mt-0.5 rounded-full border text-[10px] font-semibold flex items-center justify-center shrink-0",
                      i === nextStepIndex ? "border-foreground/40 text-foreground/70" : "border-foreground/[0.15] text-foreground/30",
                    )}>
                      {i + 1}
                    </span>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-xs font-medium", step.done ? "text-foreground/35" : "text-foreground/70")}>
                      {step.label}
                    </p>
                    {!step.done && i === nextStepIndex && (
                      <p className="text-xs text-foreground/35 mt-0.5">{step.detail}</p>
                    )}
                  </div>
                  {!step.done && i === nextStepIndex && (
                    <button type="button"
                      onClick={() => goToStep(step.id)}
                      className="text-xs font-semibold text-foreground/90 bg-foreground/[0.08] hover:bg-foreground/[0.14] border border-foreground/[0.15] rounded-md px-3 py-1.5 transition-colors shrink-0"
                    >
                      Connect
                    </button>
                  )}
                </li>
              ))}
            </ol>
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
              section.kind === 'support' ? 5 : 3,
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
            ? <AlertCircle className="size-4 text-red-400 shrink-0" />
            : <CheckCircle2 className="size-4 text-green-400 shrink-0" />
          }
          {toast.message}
        </button>
      )}
    </div>
  )
}
