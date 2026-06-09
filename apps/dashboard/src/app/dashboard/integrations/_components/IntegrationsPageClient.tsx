"use client"

import { Suspense, useCallback, useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import useSWR from "swr"
import { CheckCircle2, AlertCircle, AlertTriangle, X, Zap } from "lucide-react"
import { fetcher } from "@/lib/api/fetcher"
import { cn } from "@/lib/ui/cn"
import { OAUTH_ERROR_MESSAGES, PLATFORM_CONFIG } from "@/lib/integrations/catalog"
import {
  isOAuthDoneMessage,
  openOAuthPopup,
  watchOAuthPopup,
} from "@/lib/integrations/oauth-flow"
import IntegrationCard from "@/components/integrations/IntegrationCard"
import TelegramCard from "@/components/integrations/TelegramCard"
import { hasIntegrationTokenAlert } from "@/components/integrations/integration-card-helpers"
import type { Integration } from "@/types"

// ── Page ───────────────────────────────────────────────────────────────────────

export default function IntegrationsPageClient() {
  return (
    <Suspense fallback={null}>
      <IntegrationsPageContent />
    </Suspense>
  )
}

function IntegrationsPageContent() {
  const searchParams = useSearchParams()
  const { data: integrations = [], mutate } = useSWR<Integration[]>('/api/integrations', fetcher)
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    const connected = params.get('connected')
    const error = params.get('error')
    if (connected === 'instagram') setBanner({ type: 'success', message: 'Instagram connected successfully.' })
    else if (connected === 'shopify') setBanner({ type: 'success', message: 'Shopify store connected successfully.' })
    else if (connected === 'gmail') setBanner({ type: 'success', message: 'Gmail connected successfully.' })
    else if (connected === 'outlook') setBanner({ type: 'success', message: 'Outlook connected successfully.' })
    else if (error) setBanner({ type: 'error', message: OAUTH_ERROR_MESSAGES[error] ?? 'An unexpected error occurred.' })
  }, [searchParams])

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin || !isOAuthDoneMessage(event.data)) return
      void mutate()
      if (event.data.connected === 'instagram') {
        setBanner({ type: 'success', message: 'Instagram connected successfully.' })
      } else if (event.data.connected === 'shopify') {
        setBanner({ type: 'success', message: 'Shopify store connected successfully.' })
      } else if (event.data.connected === 'gmail') {
        setBanner({ type: 'success', message: 'Gmail connected successfully.' })
      } else if (event.data.connected === 'outlook') {
        setBanner({ type: 'success', message: 'Outlook connected successfully.' })
      } else if (event.data.error) {
        setBanner({
          type: 'error',
          message: OAUTH_ERROR_MESSAGES[event.data.error] ?? 'An unexpected error occurred.',
        })
      }
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [mutate])

  const launchOAuth = useCallback((url: string, onClosed?: () => void) => {
    const popup = openOAuthPopup(url)
    if (!popup) {
      onClosed?.()
      return
    }
    watchOAuthPopup(popup, () => {
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
      setBanner({ type: 'error', message: 'Failed to connect. Please try again.' })
      return false
    }
  }

  async function handleDisconnect(integrationId: string) {
    try {
      const res = await fetch(`/api/integrations/${integrationId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      await mutate()
    } catch {
      setBanner({ type: 'error', message: 'Failed to disconnect. Please try again.' })
    }
  }

  const getConnected = (platform: string) => integrations.filter(i => i.platform === platform)
  const getLastActivity = (platform: string) =>
    integrations.find(i => i.platform === platform)?.lastActivity ?? null

  // Stat strip
  const activePlatforms = PLATFORM_CONFIG.filter(p => p.connectType !== 'coming-soon')
  const connectedCount = activePlatforms.filter(p => p.platform && getConnected(p.platform).length > 0).length
  const alertCount = integrations.filter(hasIntegrationTokenAlert).length

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="max-w-4xl w-full mx-auto px-6 py-8 space-y-8">

        {/* Header */}
        <div>
          <h1 className="text-lg font-bold text-white/80">Integrations</h1>
          <p className="text-sm text-white/35 mt-0.5">Connect your channels and tools to Shopkeeper.</p>
        </div>

        {/* Stat strip */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3.5">
            <p className="text-xs font-semibold text-white/30 uppercase tracking-widest mb-1">Connected</p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-white/80">{connectedCount}</span>
              <span className="text-sm text-white/30">of {activePlatforms.length}</span>
            </div>
          </div>
          <div className={cn(
            "rounded-xl border px-4 py-3.5",
            alertCount > 0
              ? "border-amber-400/[0.20] bg-amber-400/[0.04]"
              : "border-white/[0.07] bg-white/[0.02]"
          )}>
            <p className={cn(
              "text-xs font-semibold uppercase tracking-widest mb-1",
              alertCount > 0 ? "text-amber-400/70" : "text-white/30"
            )}>
              {alertCount > 0 ? 'Needs attention' : 'Health'}
            </p>
            <div className="flex items-center gap-2">
              {alertCount > 0 ? (
                <>
                  <AlertTriangle className="size-4 text-amber-400" />
                  <span className="text-sm font-semibold text-amber-400">{alertCount} alert{alertCount > 1 ? 's' : ''}</span>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <Zap className="size-4 text-emerald-400" />
                  <span className="text-sm font-semibold text-emerald-400">All good</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Banner */}
        {banner && (
          <div className={cn(
            "flex items-start gap-3 rounded-lg px-4 py-3.5 text-sm border",
            banner.type === 'success'
              ? 'bg-emerald-400/[0.06] border-emerald-400/[0.15] text-emerald-400'
              : 'bg-red-400/[0.06] border-red-400/[0.15] text-red-400'
          )}>
            {banner.type === 'success'
              ? <CheckCircle2 className="size-4 mt-0.5 shrink-0" />
              : <AlertCircle className="size-4 mt-0.5 shrink-0" />
            }
            <span>{banner.message}</span>
            <button type="button"
              onClick={() => setBanner(null)}
              className="ml-auto text-current opacity-40 hover:opacity-80 transition-opacity shrink-0"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        {/* Data sources */}
        <div className="space-y-3">
          <div className="flex items-baseline gap-3 flex-wrap">
            <p className="text-xs font-semibold text-white/30 uppercase tracking-widest">Data sources</p>
            <p className="text-xs italic text-white/25">What Concierge reads from to answer questions and take action.</p>
          </div>
          {PLATFORM_CONFIG.flatMap(def => def.id === 'shopify' ? [(
            <IntegrationCard
              key={def.id}
              config={def}
              connected={def.platform ? getConnected(def.platform) : []}
              lastActivity={def.platform ? getLastActivity(def.platform) : null}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              onLaunchOAuth={launchOAuth}
            />
          )] : [])}
        </div>

        {/* Channels */}
        <div className="space-y-3">
          <div className="flex items-baseline gap-3 flex-wrap">
            <p className="text-xs font-semibold text-white/30 uppercase tracking-widest">Channels</p>
            <p className="text-xs italic text-white/25">Where Concierge talks to your customers and team.</p>
          </div>
          {PLATFORM_CONFIG.flatMap(def => def.id === 'email' || def.id === 'instagram' ? [(
            <IntegrationCard
              key={def.id}
              config={def}
              connected={def.platform ? getConnected(def.platform) : []}
              lastActivity={def.platform ? getLastActivity(def.platform) : null}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              onLaunchOAuth={launchOAuth}
            />
          )] : [])}
          <TelegramCard />
          {PLATFORM_CONFIG.flatMap(def => def.id === 'tiktok' ? [(
            <IntegrationCard
              key={def.id}
              config={def}
              connected={def.platform ? getConnected(def.platform) : []}
              lastActivity={def.platform ? getLastActivity(def.platform) : null}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
            />
          )] : [])}
        </div>

      </div>
    </div>
  )
}
