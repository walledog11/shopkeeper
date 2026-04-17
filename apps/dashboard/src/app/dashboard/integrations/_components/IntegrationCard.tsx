"use client"

import { useState } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Check, Copy, ChevronDown, AlertTriangle, Loader2, BookOpen } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Integration } from "@/types"

export type ConnectType = 'email' | 'ig' | 'shopify' | 'twilio' | 'coming-soon'

export interface PlatformConfig {
  id: string
  platform: string | null
  name: string
  logo: string
  description: string
  connectType: ConnectType
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      aria-label="Copy"
      title="Copy"
      className="ml-1 text-white/20 hover:text-white/50 transition-colors"
    >
      {copied
        ? <Check className="w-3 h-3 text-emerald-400" />
        : <Copy className="w-3 h-3" />
      }
    </button>
  )
}

// ── Card ───────────────────────────────────────────────────────────────────────

interface Props {
  config: PlatformConfig
  connected: Integration[]
  onConnect: (platform: string, email: string) => Promise<boolean>
  onDisconnect: (integrationId: string) => void
  lastActivity?: string | null
}

function formatLastActivity(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export default function IntegrationCard({ config, connected, onConnect, onDisconnect, lastActivity }: Props) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [shop, setShop] = useState('')
  const [loading, setLoading] = useState(false)
  const [notified, setNotified] = useState(false)
  const [kbSyncing, setKbSyncing] = useState(false)
  const [kbSyncResult, setKbSyncResult] = useState<string | null>(null)

  const isConnected = connected.length > 0
  const isComingSoon = config.connectType === 'coming-soon'

  const isTokenExpired = (integration: Integration) => {
    if (!integration.tokenExpiresAt) return false
    return new Date(integration.tokenExpiresAt).getTime() < Date.now()
  }

  const isTokenExpiringSoon = (integration: Integration) => {
    if (!integration.tokenExpiresAt) return false
    const msLeft = new Date(integration.tokenExpiresAt).getTime() - Date.now()
    return msLeft > 0 && msLeft / 86_400_000 < 10
  }

  async function handleEmailConnect() {
    if (!email) return
    setLoading(true)
    try {
      const ok = await onConnect(config.platform!, email)
      if (ok) setEmail('')
    } finally {
      setLoading(false)
    }
  }

  function handleShopifyConnect() {
    const domain = shop.trim()
    if (!domain) return
    setLoading(true)
    window.location.href = `/api/integrations/shopify/auth?shop=${encodeURIComponent(domain)}`
  }

  async function handleKbSync() {
    setKbSyncing(true)
    setKbSyncResult(null)
    try {
      const res = await fetch('/api/integrations/shopify/kb-sync', { method: 'POST' })
      if (!res.ok) throw new Error()
      const { syncedPolicies, syncedPages } = await res.json() as { syncedPolicies: number; syncedPages: number }
      const total = syncedPolicies + syncedPages
      setKbSyncResult(`${total} article${total === 1 ? '' : 's'} synced to Knowledge Base`)
    } catch {
      setKbSyncResult('Sync failed — please try again')
    } finally {
      setKbSyncing(false)
      setTimeout(() => setKbSyncResult(null), 4000)
    }
  }

  return (
    <div className={cn(
      "rounded-lg border bg-card overflow-hidden transition-colors",
      isComingSoon
        ? "border-white/[0.04] opacity-40 pointer-events-none select-none"
        : "border-white/[0.08]"
    )}>

      {/* ── Row header ── */}
      <button
        disabled={isComingSoon}
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 bg-white/[0.06] border border-white/[0.08]">
          <Image src={config.logo} alt={`${config.name} logo`} width={20} height={20} className="object-contain" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white/85">{config.name}</p>
          <p className="text-xs text-white/35 mt-0.5 truncate">{config.description}</p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {isConnected && lastActivity && (
            <span className="text-[11px] text-white/25 hidden sm:block">{formatLastActivity(lastActivity)}</span>
          )}
          {isComingSoon ? (
            <span className="text-[11px] font-medium text-white/25">Coming soon</span>
          ) : isConnected && connected.some(isTokenExpired) ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-400">
              <AlertTriangle className="w-3 h-3" />
              Token expired
            </span>
          ) : isConnected ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/25">
              <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
              Not connected
            </span>
          )}
          <ChevronDown className={cn("w-4 h-4 text-white/25 transition-transform duration-200", open && "rotate-180")} />
        </div>
      </button>

      {/* ── Expanded body ── */}
      {open && (
        <div className="border-t border-white/[0.06] px-5 py-4 space-y-4">

          {/* Connected accounts */}
          {isConnected && (
            <div className="rounded-md overflow-hidden border border-white/[0.07] divide-y divide-white/[0.05]">
              {connected.map((integration) => (
                <div key={integration.id} className="flex items-center gap-2.5 px-3.5 py-2.5 bg-white/[0.02]">
                  <div className="flex-1 min-w-0">
                    {config.connectType === 'ig' ? (
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-medium text-white/55 truncate">
                          {integration.fromEmail || integration.externalAccountId}
                        </p>
                        {isTokenExpired(integration) ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-red-400 bg-red-400/[0.08] border border-red-400/[0.15] rounded-full px-1.5 py-0.5 shrink-0">
                            <AlertTriangle className="w-2.5 h-2.5" /> Expired — Reconnect
                          </span>
                        ) : isTokenExpiringSoon(integration) ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-400 bg-amber-400/[0.08] border border-amber-400/[0.15] rounded-full px-1.5 py-0.5 shrink-0">
                            <AlertTriangle className="w-2.5 h-2.5" /> Expiring
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <div className="flex items-center">
                        <p className="text-xs font-mono text-white/50 truncate">{integration.externalAccountId}</p>
                        <CopyButton text={integration.externalAccountId} />
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => onDisconnect(integration.id)}
                    className="text-[11px] font-medium text-white/25 hover:text-red-400 transition-colors whitespace-nowrap shrink-0"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Email */}
          {config.connectType === 'email' && (
            <div className="space-y-3">
              {!isConnected && (
                <div className="space-y-2">
                  <p className="text-xs text-white/40 leading-relaxed">
                    Enter the email address your customers write to. Clerk will receive those emails and convert them into support tickets.
                  </p>
                  <ol className="text-xs text-white/30 space-y-1 list-decimal list-inside leading-relaxed">
                    <li>Set your inbound email routing to forward to Clerk's inbound address</li>
                    <li>Enter your support address below and save</li>
                  </ol>
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="support@yourstore.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleEmailConnect() }}
                  className="h-9 text-sm"
                />
                <Button
                  size="sm"
                  disabled={!email || loading}
                  onClick={handleEmailConnect}
                  className="shrink-0 h-9 px-4 font-medium"
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isConnected ? 'Add another' : 'Save'}
                </Button>
              </div>
            </div>
          )}

          {/* Instagram */}
          {config.connectType === 'ig' && (
            <div className="space-y-3">
              {!isConnected && (
                <div className="space-y-2">
                  <p className="text-xs text-white/40 leading-relaxed">
                    Connect your Instagram Business account to manage DMs alongside every other channel.
                  </p>
                  <ol className="text-xs text-white/30 space-y-1 list-decimal list-inside leading-relaxed">
                    <li>Make sure your Instagram is linked to a Facebook Business Page</li>
                    <li>Click Connect below and authorize Clerk via Meta OAuth</li>
                    <li>DMs will start appearing as tickets immediately</li>
                  </ol>
                </div>
              )}
              <a href="/api/integrations/instagram/auth">
                <Button size="sm" className="h-9 px-4 font-medium">
                  {isConnected ? 'Reconnect' : 'Connect with Instagram'}
                </Button>
              </a>
            </div>
          )}

          {/* Shopify */}
          {config.connectType === 'shopify' && (
            <div className="space-y-3">
              {!isConnected && (
                <div className="space-y-2">
                  <p className="text-xs text-white/40 leading-relaxed">
                    Sync customer orders, returns, and Shopify Inbox messages directly into Clerk.
                  </p>
                  <ol className="text-xs text-white/30 space-y-1 list-decimal list-inside leading-relaxed">
                    <li>Enter your <span className="font-mono text-white/45">.myshopify.com</span> store domain below</li>
                    <li>You'll be redirected to Shopify to authorize Clerk</li>
                    <li>Order data and messages will sync automatically</li>
                  </ol>
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="mystore.myshopify.com"
                  value={shop}
                  onChange={(e) => setShop(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleShopifyConnect() }}
                  className="h-9 text-sm"
                />
                <Button
                  size="sm"
                  disabled={!shop.trim() || loading}
                  onClick={handleShopifyConnect}
                  className="shrink-0 h-9 px-4 font-medium"
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isConnected ? 'Reconnect' : 'Connect'}
                </Button>
              </div>
              {isConnected && (
                <div className="flex items-center gap-3 pt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={kbSyncing}
                    onClick={handleKbSync}
                    className="h-8 px-3 text-xs font-medium text-white/40 hover:text-white/70 hover:bg-white/[0.04]"
                  >
                    {kbSyncing
                      ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Syncing…</>
                      : <><BookOpen className="w-3 h-3 mr-1.5" />Sync to KB</>
                    }
                  </Button>
                  {kbSyncResult && (
                    <span className={cn(
                      "text-xs",
                      kbSyncResult.startsWith('Sync failed') ? "text-red-400" : "text-emerald-400"
                    )}>
                      {kbSyncResult}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Coming soon */}
          {config.connectType === 'coming-soon' && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-white/30">This integration isn't available yet.</p>
              <Button
                variant="ghost"
                size="sm"
                disabled={notified}
                onClick={() => { setNotified(true); setTimeout(() => setNotified(false), 3000) }}
                className={cn(
                  "h-8 px-3 text-xs font-medium",
                  notified ? "text-emerald-400 pointer-events-none" : "text-white/30 hover:text-white/55"
                )}
              >
                {notified ? <><Check className="w-3 h-3 mr-1" />Notified</> : "Notify me"}
              </Button>
            </div>
          )}

        </div>
      )}

    </div>
  )
}
