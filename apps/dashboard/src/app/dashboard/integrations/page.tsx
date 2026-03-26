"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import useSWR from "swr"
import { AlertCircle, CheckCircle2 } from "lucide-react"
import { fetcher } from "@/lib/fetcher"
import IntegrationCard, { type PlatformConfig } from "./_components/IntegrationCard"
import type { Integration } from "@/types"

const PLATFORM_CONFIG: PlatformConfig[] = [
  {
    id: "email",
    platform: "email",
    name: "Gmail / Email",
    logo: "/logos/gmail.png",
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

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'You cancelled the Instagram connection.',
  no_ig_account: 'No Instagram Business account was found on your Facebook account. Make sure you have classic Page admin access (not just Business Portfolio access) and that your Instagram Business account is linked to the Page.',
  token_exchange_failed: 'Authentication failed. Please try again.',
  state_mismatch: 'Security check failed. Please try again.',
  server_error: 'Something went wrong on our end. Please try again.',
  shopify_state_mismatch: 'Security check failed. Please try again.',
  shopify_hmac_invalid: 'Authentication failed — the response from Shopify could not be verified.',
  shopify_token_failed: 'Could not obtain a Shopify access token. Please try again.',
  shopify_server_error: 'Something went wrong connecting your Shopify store. Please try again.',
  shopify_invalid_callback: 'Invalid callback from Shopify. Please try again.',
}

export default function IntegrationsPage() {
  const { data: integrations = [], mutate } = useSWR<Integration[]>('/api/integrations', fetcher)
  const searchParams = useSearchParams()
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    const connected = searchParams.get('connected')
    const error = searchParams.get('error')
    if (connected === 'instagram') {
      setBanner({ type: 'success', message: 'Instagram connected successfully.' })
    } else if (connected === 'shopify') {
      setBanner({ type: 'success', message: 'Shopify store connected successfully.' })
    } else if (error) {
      setBanner({ type: 'error', message: ERROR_MESSAGES[error] ?? 'An unexpected error occurred.' })
    }
  }, [searchParams])

  const getConnected = (platform: string) => integrations.filter((i) => i.platform === platform)

  const connectedCount = PLATFORM_CONFIG.filter(
    (c) => c.platform && getConnected(c.platform).length > 0
  ).length

  const handleConnect = async (platform: string, emailAddress: string): Promise<boolean> => {
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

  const handleDisconnect = async (integrationId: string) => {
    try {
      const res = await fetch(`/api/integrations/${integrationId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      await mutate()
    } catch {
      setBanner({ type: 'error', message: 'Failed to disconnect. Please try again.' })
    }
  }

  return (
    <div className="h-full overflow-y-auto px-8 py-8">
      <div className="max-w-4xl mx-auto w-full space-y-8">

        {/* Page header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Integrations</h1>
            <p className="mt-1 text-sm text-slate-500">
              Connect your channels to route all customer messages into Clerk.
            </p>
          </div>
          {connectedCount > 0 && (
            <div className="flex items-center gap-1.5 shrink-0 bg-green-50 border border-green-200 rounded-full px-3 py-1.5">
              <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
              <span className="text-xs font-semibold text-green-700">
                {connectedCount} of {PLATFORM_CONFIG.filter(c => c.connectType !== 'coming-soon').length} connected
              </span>
            </div>
          )}
        </div>

        {/* Success / error banner */}
        {banner && (
          <div className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm border ${
            banner.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}>
            {banner.type === 'success'
              ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-green-600" />
              : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-500" />
            }
            <span>{banner.message}</span>
            <button
              onClick={() => setBanner(null)}
              aria-label="Dismiss"
              className="ml-auto text-current opacity-50 hover:opacity-100 shrink-0"
            >
              ✕
            </button>
          </div>
        )}

        {/* Integration cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PLATFORM_CONFIG.map((config) => (
            <IntegrationCard
              key={config.id}
              config={config}
              connected={config.platform ? getConnected(config.platform) : []}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
            />
          ))}
        </div>

      </div>
    </div>
  )
}
