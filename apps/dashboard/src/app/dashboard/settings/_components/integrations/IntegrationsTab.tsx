"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import useSWR from "swr"
import { CheckCircle2, AlertCircle } from "lucide-react"
import { fetcher } from "@/lib/api/fetcher"
import { OAUTH_ERROR_MESSAGES, PLATFORM_CONFIG } from "@/lib/integrations/catalog"
import IntegrationCard from "@/components/integrations/IntegrationCard"
import SmsCard from "@/components/integrations/SmsCard"
import type { Integration } from "@/types"

export default function IntegrationsTab() {
  const searchParams = useSearchParams()
  const { data: integrations = [], mutate } = useSWR<Integration[]>('/api/integrations', fetcher)
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    const connected = searchParams.get('connected')
    const error = searchParams.get('error')
    if (connected === 'instagram') setBanner({ type: 'success', message: 'Instagram connected successfully.' })
    else if (connected === 'shopify') setBanner({ type: 'success', message: 'Shopify store connected successfully.' })
    else if (error) setBanner({ type: 'error', message: OAUTH_ERROR_MESSAGES[error] ?? 'An unexpected error occurred.' })
  }, [searchParams])

  async function handleConnect(platform: string, emailAddress: string): Promise<boolean> {
    try {
      const res = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, externalAccountId: emailAddress }),
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-lg font-bold text-white/80">Integrations</h1>
        <p className="text-sm text-white/35 mt-0.5">Connect your channels and tools to Clerk.</p>
      </div>

      {banner && (
        <div className={`flex items-start gap-3 rounded-lg px-4 py-3.5 text-sm border ${
          banner.type === 'success'
            ? 'bg-emerald-400/[0.06] border-emerald-400/[0.15] text-emerald-400'
            : 'bg-red-400/[0.06] border-red-400/[0.15] text-red-400'
        }`}>
          {banner.type === 'success'
            ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          }
          <span>{banner.message}</span>
          <button
            onClick={() => setBanner(null)}
            className="ml-auto text-current opacity-40 hover:opacity-80 transition-opacity shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-[11px] font-semibold text-white/25 uppercase tracking-widest pb-1">Messaging</p>
        {PLATFORM_CONFIG.filter(c => ['email', 'instagram', 'tiktok'].includes(c.id)).map(config => (
          <IntegrationCard
            key={config.id}
            config={config}
            connected={config.platform ? getConnected(config.platform) : []}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
          />
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-semibold text-white/25 uppercase tracking-widest pb-1">Commerce</p>
        {PLATFORM_CONFIG.filter(c => c.id === 'shopify').map(config => (
          <IntegrationCard
            key={config.id}
            config={config}
            connected={config.platform ? getConnected(config.platform) : []}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
          />
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-semibold text-white/25 uppercase tracking-widest pb-1">Team</p>
        <SmsCard />
      </div>
    </div>
  )
}
