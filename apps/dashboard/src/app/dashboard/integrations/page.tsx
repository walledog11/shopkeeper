"use client"

import { useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Image from "next/image"
import { Check, Copy, Lock, ChevronRight } from "lucide-react"
import { fetcher } from "@/lib/fetcher"
import { Integration } from "@/types"

type PlatformConfig = {
  id: string;
  platform: string | null;
  name: string;
  logo: string;
  description: string;
  comingSoon?: boolean;
  emailConnect?: boolean;
  igConnect?: boolean;
};

const PLATFORM_CONFIG: PlatformConfig[] = [
  {
    id: "email",
    platform: "email",
    name: "Gmail / Email",
    logo: "/logos/gmail.png",
    description: "Route your support inbox directly into Clerk and reply from a verified sender address.",
    emailConnect: true,
  },
  {
    id: "instagram",
    platform: "ig_dm",
    name: "Instagram",
    logo: "/logos/instagram-logo.png",
    description: "Manage Direct Messages from your Instagram business account alongside every other channel.",
    igConnect: true,
  },
  {
    id: "tiktok",
    platform: "tiktok",
    name: "TikTok",
    logo: "/logos/tiktok-logo.png",
    description: "Manage TikTok Shop messages and video comments in one unified inbox.",
    comingSoon: true,
  },
  {
    id: "shopify",
    platform: null,
    name: "Shopify",
    logo: "/logos/shopify.svg",
    description: "Sync customer orders, returns, and Shopify Inbox messages directly into Clerk.",
    comingSoon: true,
  },
]

const INBOUND_DOMAIN = process.env.NEXT_PUBLIC_INBOUND_EMAIL_DOMAIN || 'inbound.yourapp.com'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={handleCopy}
      className="ml-1.5 text-slate-400 hover:text-slate-600 transition-colors"
      title="Copy"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

export default function IntegrationsPage() {
  const { data: integrations = [], mutate } = useSWR<Integration[]>('/api/integrations', fetcher)
  const { data: org } = useSWR<{ id: string; name: string }>('/api/org', fetcher)

  const [showEmailForm, setShowEmailForm] = useState<Record<string, boolean>>({})
  const [emailInputs, setEmailInputs] = useState<Record<string, string>>({})
  const [fromEmailInputs, setFromEmailInputs] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})

  const getConnected = (platform: string) =>
    integrations.filter((i) => i.platform === platform)

  const connectedCount = PLATFORM_CONFIG.filter(
    (c) => c.platform && getConnected(c.platform).length > 0
  ).length

  const handleConnect = async (configId: string, platform: string, emailAddress: string) => {
    setLoading((s) => ({ ...s, [configId]: true }))
    try {
      const fromEmail = fromEmailInputs[configId] || undefined
      const res = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, externalAccountId: emailAddress, fromEmail }),
      })
      if (!res.ok) throw new Error('Failed to connect')
      await mutate()
      setShowEmailForm((s) => ({ ...s, [configId]: false }))
      setEmailInputs((s) => ({ ...s, [configId]: '' }))
      setFromEmailInputs((s) => ({ ...s, [configId]: '' }))
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
    <div className="w-full space-y-8">

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
              {connectedCount} of {PLATFORM_CONFIG.filter(c => !c.comingSoon).length} connected
            </span>
          </div>
        )}
      </div>

      {/* Integration cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {PLATFORM_CONFIG.map((config) => {
          const connected = config.platform ? getConnected(config.platform) : []
          const isConnected = connected.length > 0
          const isComingSoon = !!config.comingSoon

          return (
            <div
              key={config.id}
              className={[
                "flex flex-col rounded-2xl border bg-white transition-all duration-200",
                isComingSoon
                  ? "border-slate-200 opacity-55"
                  : isConnected
                    ? "border-green-200 shadow-sm ring-1 ring-green-100/80"
                    : "border-slate-200 hover:border-slate-300 hover:shadow-sm",
              ].join(" ")}
            >

              {/* Card header */}
              <div className="flex items-center gap-4 p-5 pb-4">
                <div className={[
                  "h-11 w-11 rounded-xl flex items-center justify-center p-2 shrink-0 border transition-colors",
                  isConnected
                    ? "bg-green-50 border-green-200"
                    : "bg-slate-50 border-slate-200",
                ].join(" ")}>
                  <Image
                    src={config.logo}
                    alt={`${config.name} logo`}
                    width={28}
                    height={28}
                    className="object-contain"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 leading-none mb-1.5">{config.name}</p>
                  {isComingSoon ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600">
                      <Lock className="w-3 h-3" />
                      Coming soon
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${isConnected ? "bg-green-500" : "bg-slate-300"}`} />
                      <span className={`text-[11px] font-semibold ${isConnected ? "text-green-700" : "text-slate-400"}`}>
                        {isConnected ? "Connected" : "Not connected"}
                      </span>
                    </span>
                  )}
                </div>
              </div>

              {/* Description */}
              <p className="px-5 pb-4 text-sm text-slate-500 leading-relaxed">
                {config.description}
              </p>

              {/* Connected accounts */}
              {isConnected && (
                <div className="mx-5 mb-4 rounded-xl border border-slate-100 overflow-hidden divide-y divide-slate-100">
                  {connected.map((integration) => (
                    <div key={integration.id} className="flex items-center gap-3 px-4 py-3 bg-slate-50/70">
                      <div className="flex-1 min-w-0">
                        {config.igConnect ? (
                          <p className="text-xs font-semibold text-slate-700 truncate">
                            {integration.fromEmail || integration.externalAccountId}
                          </p>
                        ) : (
                          <>
                            <div className="flex items-center">
                              <p className="text-xs font-mono font-medium text-slate-700 truncate">
                                {integration.externalAccountId}
                              </p>
                              <CopyButton text={integration.externalAccountId} />
                            </div>
                            {integration.fromEmail && (
                              <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                                Replies from{" "}
                                <span className="font-semibold text-slate-600">{integration.fromEmail}</span>
                              </p>
                            )}
                          </>
                        )}
                      </div>
                      <button
                        onClick={() => handleDisconnect(integration.id)}
                        className="text-[11px] font-semibold text-slate-400 hover:text-red-500 transition-colors whitespace-nowrap shrink-0"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Email setup form */}
              {config.emailConnect && showEmailForm[config.id] && (
                <div className="mx-5 mb-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                      Inbound address
                    </label>
                    <Input
                      type="email"
                      placeholder="abc123@inbound.postmarkapp.com"
                      value={emailInputs[config.id] ?? ''}
                      onChange={(e) => setEmailInputs((s) => ({ ...s, [config.id]: e.target.value }))}
                      className="text-sm bg-white h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                      Reply-from address
                    </label>
                    <p className="text-xs text-slate-400">
                      Must be a verified{" "}
                      <span className="font-semibold text-slate-600">Postmark Sender Signature</span>.
                      Customers will see this on your replies.
                    </p>
                    <div className="flex gap-2">
                      <Input
                        type="email"
                        placeholder="support@yourstore.com"
                        value={fromEmailInputs[config.id] ?? ''}
                        onChange={(e) => setFromEmailInputs((s) => ({ ...s, [config.id]: e.target.value }))}
                        className="text-sm bg-white h-9"
                      />
                      <Button
                        size="sm"
                        disabled={!emailInputs[config.id] || loading[config.id]}
                        onClick={() => handleConnect(config.id, 'email', emailInputs[config.id] ?? '')}
                        className="shrink-0 h-9 bg-slate-900 text-white hover:bg-slate-700 font-semibold"
                      >
                        {loading[config.id] ? 'Saving…' : 'Save'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="mt-auto px-5 py-4 border-t border-slate-100 flex justify-end">
                {!isComingSoon && config.emailConnect && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={loading[config.id]}
                    onClick={() => setShowEmailForm((s) => ({ ...s, [config.id]: !s[config.id] }))}
                    className="font-semibold text-slate-700 border-slate-200 hover:bg-slate-50 h-8 text-xs gap-1"
                  >
                    {showEmailForm[config.id]
                      ? 'Cancel'
                      : isConnected
                        ? 'Manage'
                        : <>Connect <ChevronRight className="w-3.5 h-3.5" /></>
                    }
                  </Button>
                )}
                {!isComingSoon && config.igConnect && (
                  <Button
                    size="sm"
                    onClick={() => { window.location.href = '/api/integrations/instagram/connect' }}
                    className="font-semibold h-8 text-xs bg-gradient-to-r from-purple-600 to-pink-500 text-white hover:from-purple-700 hover:to-pink-600 border-0 gap-1"
                  >
                    {isConnected
                      ? 'Reconnect'
                      : <>Connect <ChevronRight className="w-3.5 h-3.5" /></>
                    }
                  </Button>
                )}
                {isComingSoon && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled
                    className="font-semibold h-8 text-xs text-slate-400 border-slate-200 cursor-not-allowed"
                  >
                    Notify me
                  </Button>
                )}
              </div>

            </div>
          )
        })}
      </div>

    </div>
  )
}
