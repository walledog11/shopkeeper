"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import useSWR from "swr"
import { CheckCircle2, AlertCircle } from "lucide-react"
import { fetcher } from "@/lib/api/fetcher"
import IntegrationCard, { type PlatformConfig } from "../../../integrations/_components/IntegrationCard"
import SmsCard from "./SmsCard"
import type { Integration } from "@/types"

const PLATFORM_CONFIG: PlatformConfig[] = [
  {
    id: "email",
    platform: "email",
    name: "Email",
    logo: "/logos/email.svg",
    description: "Route your support inbox directly into Clerk and reply from a verified sender address.",
    connectType: 'email',
  },
  {
    id: "instagram",
    platform: "ig_dm",
    name: "Instagram",
    logo: "/logos/instagram-logo.png",
    description: "Manage Direct Messages from your Instagram business account alongside every other channel.",
    connectType: 'ig',
  },
  {
    id: "tiktok",
    platform: "tiktok",
    name: "TikTok",
    logo: "/logos/tiktok-logo.png",
    description: "Manage TikTok Shop messages and video comments in one unified inbox.",
    connectType: 'coming-soon',
  },
  {
    id: "shopify",
    platform: "shopify",
    name: "Shopify",
    logo: "/logos/shopify.svg",
    description: "Sync customer orders, returns, and Shopify Inbox messages directly into Clerk.",
    connectType: 'shopify',
  },
]

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'You cancelled the Instagram connection.',
  no_ig_account: 'No Instagram Business account was found on your Facebook account.',
  token_exchange_failed: 'Authentication failed. Please try again.',
  state_mismatch: 'Security check failed. Please try again.',
  server_error: 'Something went wrong on our end. Please try again.',
  shopify_state_mismatch: 'Security check failed. Please try again.',
  shopify_hmac_invalid: 'Authentication failed — the response from Shopify could not be verified.',
  shopify_token_failed: 'Could not obtain a Shopify access token. Please try again.',
  shopify_server_error: 'Something went wrong connecting your Shopify store. Please try again.',
  shopify_invalid_callback: 'Invalid callback from Shopify. Please try again.',
}

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
