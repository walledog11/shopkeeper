"use client"

import { useState } from "react"
import useSWR from "swr"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import Image from "next/image"
import { fetcher } from "@/lib/fetcher"
import { Integration } from "@/types"

// Platforms the user can actively connect (others are coming soon)
type PlatformConfig = {
  id: string;
  platform: string | null; // null = coming soon
  name: string;
  logo: string;
  description: string;
  comingSoon?: boolean;
  emailConnect?: boolean;
};

const PLATFORM_CONFIG: PlatformConfig[] = [
  {
    id: "email",
    platform: "email",
    name: "Gmail / Email",
    logo: "/logos/gmail.png",
    description: "Route your customer support email (e.g., help@yourstore.com) directly to your Clerk inbox.",
    emailConnect: true,
  },
  {
    id: "instagram",
    platform: "ig_dm",
    name: "Instagram",
    logo: "/logos/instagram-logo.png",
    description: "Reply to Direct Messages from your Instagram business account.",
    comingSoon: true,
  },
  {
    id: "tiktok",
    platform: "tiktok",
    name: "TikTok",
    logo: "/logos/tiktok-logo.png",
    description: "Manage TikTok Shop messages and video comments in one unified place.",
    comingSoon: true,
  },
  {
    id: "shopify",
    platform: null,
    name: "Shopify",
    logo: "/logos/shopify.svg",
    description: "Connect your store to sync customer orders, returns, and Shopify Inbox messages directly into Clerk.",
    comingSoon: true,
  },
]

export default function IntegrationsPage() {
  const { data: integrations = [], mutate } = useSWR<Integration[]>('/api/integrations', fetcher)

  // Track per-card UI state
  const [showEmailForm, setShowEmailForm] = useState<Record<string, boolean>>({})
  const [emailInputs, setEmailInputs] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})

  // All connected accounts for a given platform string
  const getConnected = (platform: string) =>
    integrations.filter((i) => i.platform === platform)

  const handleConnect = async (configId: string, platform: string, emailAddress: string) => {
    setLoading((s) => ({ ...s, [configId]: true }))
    try {
      const res = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, externalAccountId: emailAddress }),
      })
      if (!res.ok) throw new Error('Failed to connect')
      await mutate()
      setShowEmailForm((s) => ({ ...s, [configId]: false }))
      setEmailInputs((s) => ({ ...s, [configId]: '' }))
    } catch {
      alert('Failed to connect. Please try again.')
    } finally {
      setLoading((s) => ({ ...s, [configId]: false }))
    }
  }

  const handleDisconnect = async (integrationId: string) => {
    try {
      const res = await fetch(`/api/integrations/${integrationId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to disconnect')
      await mutate()
    } catch {
      alert('Failed to disconnect. Please try again.')
    }
  }

  return (
    <div className="space-y-6 md:space-y-8 w-full bg-white rounded-[2rem] p-8 border border-slate-200 min-h-[600px]">

      {/* Page Header */}
      <div className="border-b border-slate-200 pb-6">
        <h1 className="text-3xl font-extrabold tracking-tight mb-2 text-slate-900">Integrations</h1>
        <p className="text-base font-medium text-slate-500">
          Connect your favorite apps and platforms to route all customer messages into Clerk.
        </p>
      </div>

      {/* Integrations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
        {PLATFORM_CONFIG.map((config) => {
          const connected = config.platform ? getConnected(config.platform) : []
          const isConnected = connected.length > 0
          const isComingSoon = !!config.comingSoon

          return (
            <Card key={config.id} className="flex flex-col border-slate-200 shadow-sm rounded-[1.5rem] hover:shadow-md transition-shadow bg-white relative">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2 pt-6 px-6">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-slate-50 flex items-center justify-center p-2 border border-slate-200 shrink-0">
                    <Image
                      src={config.logo}
                      alt={`${config.name} logo`}
                      width={32}
                      height={32}
                      className="object-contain"
                    />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-extrabold text-slate-900">{config.name}</CardTitle>
                  </div>
                </div>
                {isComingSoon ? (
                  <Badge variant="outline" className="font-bold uppercase tracking-wider text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                    Coming Soon
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className={`font-bold uppercase tracking-wider text-[10px] ${
                      isConnected
                        ? "bg-green-50 text-green-700 border-green-200"
                        : "bg-slate-50 text-slate-500 border-slate-200"
                    }`}
                  >
                    {isConnected ? "Connected" : "Disconnected"}
                  </Badge>
                )}
              </CardHeader>

              <CardContent className="flex-1 mt-4 px-6">
                <p className="text-sm font-medium text-slate-600 leading-relaxed">
                  {config.description}
                </p>

                {/* Connected accounts list */}
                {isConnected && (
                  <div className="mt-6 space-y-3 border-t border-slate-100 pt-5">
                    <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">
                      Connected Accounts
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {connected.map((integration) => (
                        <div key={integration.id} className="group relative inline-flex">
                          <Badge
                            variant="outline"
                            className="font-bold bg-slate-50 border-slate-200 text-slate-700 text-xs py-1 cursor-default"
                          >
                            {integration.externalAccountId}
                          </Badge>
                          <button
                            onClick={() => handleDisconnect(integration.id)}
                            className="ml-1 text-slate-400 hover:text-red-500 text-xs font-bold transition-colors"
                            title="Disconnect"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Email connect form */}
                {config.emailConnect && showEmailForm[config.id] && (
                  <div className="mt-4 flex gap-2">
                    <Input
                      type="email"
                      placeholder="support@yourstore.com"
                      value={emailInputs[config.id] ?? ''}
                      onChange={(e) => setEmailInputs((s) => ({ ...s, [config.id]: e.target.value }))}
                      className="text-sm"
                    />
                    <Button
                      size="sm"
                      disabled={!emailInputs[config.id] || loading[config.id]}
                      onClick={() => handleConnect(config.id, 'email', emailInputs[config.id] ?? '')}
                      className="shrink-0 bg-slate-900 text-white hover:bg-slate-800 font-bold"
                    >
                      {loading[config.id] ? 'Adding...' : 'Add'}
                    </Button>
                  </div>
                )}
              </CardContent>

              <CardFooter className="pt-4 pb-6 px-6 border-t border-slate-100 mt-auto bg-slate-50/50 rounded-b-[1.5rem]">
                <div className="flex w-full justify-between items-center gap-4">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider line-clamp-1">
                    {isComingSoon ? "Coming Soon" : isConnected ? "Active Integration" : "Auth Required"}
                  </span>
                  {!isComingSoon && config.emailConnect && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={loading[config.id]}
                      onClick={() => setShowEmailForm((s) => ({ ...s, [config.id]: !s[config.id] }))}
                      className="shrink-0 font-bold border-slate-300 text-slate-700 hover:bg-slate-100"
                    >
                      {showEmailForm[config.id] ? 'Cancel' : 'Connect Email'}
                    </Button>
                  )}
                  {isComingSoon && (
                    <Button variant="outline" size="sm" disabled className="shrink-0 font-bold border-slate-200 text-slate-400 cursor-not-allowed">
                      Coming Soon
                    </Button>
                  )}
                </div>
              </CardFooter>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
