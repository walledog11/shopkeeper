"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import useSWR from "swr"
import Image from "next/image"
import {
  CheckCircle2, AlertCircle, AlertTriangle, Loader2,
  BookOpen, Check, Copy, X, Zap,
} from "lucide-react"
import { fetcher } from "@/lib/fetcher"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import SmsCard from "../../settings/_components/integrations/SmsCard"
import type { Integration } from "@/types"

// ── Types ──────────────────────────────────────────────────────────────────────

interface PlatformDef {
  id: string
  platform: string | null
  name: string
  logo: string
  description: string
  connectType: 'email' | 'ig' | 'shopify' | 'coming-soon'
}

const PLATFORMS: PlatformDef[] = [
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
    description: "Manage Direct Messages from your Instagram business account.",
    connectType: 'ig',
  },
  {
    id: "tiktok",
    platform: "tiktok",
    name: "TikTok",
    logo: "/logos/tiktok-logo.png",
    description: "Manage TikTok Shop messages and video comments.",
    connectType: 'coming-soon',
  },
  {
    id: "shopify",
    platform: "shopify",
    name: "Shopify",
    logo: "/logos/shopify.svg",
    description: "Sync customer orders, returns, and product data directly into Clerk.",
    connectType: 'shopify',
  },
]

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'You cancelled the Instagram connection.',
  no_ig_account: 'No Instagram Business account found on your Facebook account.',
  token_exchange_failed: 'Authentication failed. Please try again.',
  state_mismatch: 'Security check failed. Please try again.',
  server_error: 'Something went wrong. Please try again.',
  shopify_state_mismatch: 'Security check failed. Please try again.',
  shopify_hmac_invalid: 'Shopify response could not be verified. Please try again.',
  shopify_token_failed: 'Could not obtain a Shopify access token. Please try again.',
  shopify_server_error: 'Something went wrong connecting your Shopify store. Please try again.',
  shopify_invalid_callback: 'Invalid callback from Shopify. Please try again.',
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatLastActivity(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function isExpired(i: Integration) {
  return !!i.tokenExpiresAt && new Date(i.tokenExpiresAt).getTime() < Date.now()
}

function isExpiringSoon(i: Integration) {
  if (!i.tokenExpiresAt) return false
  const ms = new Date(i.tokenExpiresAt).getTime() - Date.now()
  return ms > 0 && ms / 86_400_000 < 10
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
      className="text-white/20 hover:text-white/50 transition-colors"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
    </button>
  )
}

// ── Platform card ──────────────────────────────────────────────────────────────

interface CardProps {
  def: PlatformDef
  connected: Integration[]
  lastActivity: string | null
  onConnect: (platform: string, value: string) => Promise<boolean>
  onDisconnect: (id: string) => void
}

function PlatformCard({ def, connected, lastActivity, onConnect, onDisconnect }: CardProps) {
  const [emailInput, setEmailInput] = useState('')
  const [shopInput, setShopInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [kbSyncing, setKbSyncing] = useState(false)
  const [kbResult, setKbResult] = useState<string | null>(null)

  const isConnected = connected.length > 0
  const hasExpired = isConnected && connected.some(isExpired)
  const hasExpiringSoon = isConnected && connected.some(isExpiringSoon)
  const isComingSoon = def.connectType === 'coming-soon'

  async function handleEmailSave() {
    if (!emailInput) return
    setLoading(true)
    try {
      await onConnect(def.platform!, emailInput)
      setEmailInput('')
    } finally {
      setLoading(false)
    }
  }

  function handleShopifyConnect() {
    const domain = shopInput.trim()
    if (!domain) return
    setLoading(true)
    window.location.href = `/api/integrations/shopify/auth?shop=${encodeURIComponent(domain)}`
  }

  async function handleKbSync() {
    setKbSyncing(true)
    setKbResult(null)
    try {
      const res = await fetch('/api/integrations/shopify/kb-sync', { method: 'POST' })
      if (!res.ok) throw new Error()
      const { syncedPolicies, syncedPages } = await res.json() as { syncedPolicies: number; syncedPages: number }
      const total = syncedPolicies + syncedPages
      setKbResult(`${total} article${total === 1 ? '' : 's'} synced`)
    } catch {
      setKbResult('Sync failed')
    } finally {
      setKbSyncing(false)
      setTimeout(() => setKbResult(null), 4000)
    }
  }

  // Status pill
  const statusPill = isComingSoon ? (
    <span className="text-[11px] font-medium text-white/20 bg-white/[0.04] border border-white/[0.06] rounded-full px-2.5 py-1">
      Coming soon
    </span>
  ) : hasExpired ? (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-red-400 bg-red-400/[0.08] border border-red-400/[0.15] rounded-full px-2.5 py-1">
      <AlertTriangle className="w-3 h-3" /> Token expired
    </span>
  ) : hasExpiringSoon ? (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-400 bg-amber-400/[0.08] border border-amber-400/[0.15] rounded-full px-2.5 py-1">
      <AlertTriangle className="w-3 h-3" /> Expiring soon
    </span>
  ) : isConnected ? (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 bg-emerald-400/[0.06] border border-emerald-400/[0.15] rounded-full px-2.5 py-1">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Connected
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-white/30 bg-white/[0.04] border border-white/[0.06] rounded-full px-2.5 py-1">
      <span className="w-1.5 h-1.5 rounded-full bg-white/20" /> Not connected
    </span>
  )

  return (
    <div className={cn(
      "rounded-xl border bg-card overflow-hidden",
      isComingSoon ? "border-white/[0.04] opacity-40" : "border-white/[0.08]"
    )}>
      {/* Header */}
      <div className="flex items-start gap-4 px-5 pt-5 pb-4">
        <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-white/[0.06] border border-white/[0.08]">
          <Image src={def.logo} alt={def.name} width={22} height={22} className="object-contain" />
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-white/85">{def.name}</p>
            {statusPill}
          </div>
          <p className="text-xs text-white/35 mt-1 leading-relaxed">{def.description}</p>
        </div>
      </div>

      {/* Body — connected state */}
      {isConnected && (
        <div className="border-t border-white/[0.05] px-5 py-4 space-y-3">
          {/* Connected accounts */}
          <div className="space-y-1">
            {connected.map(integration => (
              <div key={integration.id} className="flex items-center justify-between gap-3 py-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  {def.connectType === 'ig' ? (
                    <span className="text-xs text-white/55 font-medium truncate">
                      {integration.fromEmail || integration.externalAccountId}
                    </span>
                  ) : (
                    <>
                      <span className="text-xs font-mono text-white/50 truncate">{integration.externalAccountId}</span>
                      <CopyButton text={integration.externalAccountId} />
                    </>
                  )}
                  {isExpired(integration) && (
                    <span className="text-[10px] font-semibold text-red-400 shrink-0">Expired</span>
                  )}
                </div>
                <button
                  onClick={() => onDisconnect(integration.id)}
                  className="text-[11px] font-medium text-white/20 hover:text-red-400 transition-colors shrink-0"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          {/* Footer row: last activity + actions */}
          <div className="flex items-center justify-between pt-1">
            <p className="text-[11px] text-white/25">
              {lastActivity ? `Last activity ${formatLastActivity(lastActivity)}` : 'No activity yet'}
            </p>
            <div className="flex items-center gap-2">
              {def.connectType === 'shopify' && (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={kbSyncing}
                    onClick={handleKbSync}
                    className="h-7 px-2.5 text-[11px] font-medium text-white/35 hover:text-white/70 hover:bg-white/[0.04]"
                  >
                    {kbSyncing
                      ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Syncing…</>
                      : <><BookOpen className="w-3 h-3 mr-1" />Sync KB</>}
                  </Button>
                  {kbResult && (
                    <span className={cn("text-[11px]", kbResult.startsWith('Sync failed') ? "text-red-400" : "text-emerald-400")}>
                      {kbResult}
                    </span>
                  )}
                </>
              )}
              {def.connectType === 'ig' && (
                <a href="/api/integrations/instagram/auth">
                  <Button variant="ghost" size="sm" className="h-7 px-2.5 text-[11px] font-medium text-white/35 hover:text-white/70 hover:bg-white/[0.04]">
                    Reconnect
                  </Button>
                </a>
              )}
              {def.connectType === 'email' && (
                <div className="flex gap-1.5">
                  <Input
                    type="email"
                    placeholder="Add another address"
                    value={emailInput}
                    onChange={e => setEmailInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleEmailSave() }}
                    className="h-7 text-xs w-44"
                  />
                  <Button
                    size="sm"
                    disabled={!emailInput || loading}
                    onClick={handleEmailSave}
                    className="h-7 px-3 text-[11px] font-medium shrink-0"
                  >
                    {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Add'}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Body — not connected state */}
      {!isConnected && !isComingSoon && (
        <div className="border-t border-white/[0.05] px-5 py-4">
          {def.connectType === 'email' && (
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="support@yourstore.com"
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleEmailSave() }}
                className="h-8 text-sm"
              />
              <Button
                size="sm"
                disabled={!emailInput || loading}
                onClick={handleEmailSave}
                className="h-8 px-4 font-medium shrink-0"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Connect'}
              </Button>
            </div>
          )}
          {def.connectType === 'ig' && (
            <a href="/api/integrations/instagram/auth">
              <Button size="sm" className="h-8 px-4 font-medium">
                Connect with Instagram
              </Button>
            </a>
          )}
          {def.connectType === 'shopify' && (
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="mystore.myshopify.com"
                value={shopInput}
                onChange={e => setShopInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleShopifyConnect() }}
                className="h-8 text-sm font-mono"
              />
              <Button
                size="sm"
                disabled={!shopInput.trim() || loading}
                onClick={handleShopifyConnect}
                className="h-8 px-4 font-medium shrink-0"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Connect'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function IntegrationsPageClient() {
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
  const activePlatforms = PLATFORMS.filter(p => p.connectType !== 'coming-soon')
  const connectedCount = activePlatforms.filter(p => p.platform && getConnected(p.platform).length > 0).length
  const alertCount = integrations.filter(i => {
    const expired = !!i.tokenExpiresAt && new Date(i.tokenExpiresAt).getTime() < Date.now()
    const expiringSoon = !expired && !!i.tokenExpiresAt && (new Date(i.tokenExpiresAt).getTime() - Date.now()) / 86_400_000 < 10
    return expired || expiringSoon
  }).length

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="max-w-2xl w-full mx-auto px-6 py-8 space-y-8">

        {/* Header */}
        <div>
          <h1 className="text-lg font-bold text-white/80">Integrations</h1>
          <p className="text-sm text-white/35 mt-0.5">Connect your channels and tools to Clerk.</p>
        </div>

        {/* Stat strip */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3.5">
            <p className="text-[11px] font-semibold text-white/30 uppercase tracking-widest mb-1">Connected</p>
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
              "text-[11px] font-semibold uppercase tracking-widest mb-1",
              alertCount > 0 ? "text-amber-400/70" : "text-white/30"
            )}>
              {alertCount > 0 ? 'Needs attention' : 'Health'}
            </p>
            <div className="flex items-center gap-2">
              {alertCount > 0 ? (
                <>
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-semibold text-amber-400">{alertCount} alert{alertCount > 1 ? 's' : ''}</span>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-emerald-400" />
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
              ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
              : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            }
            <span>{banner.message}</span>
            <button
              onClick={() => setBanner(null)}
              className="ml-auto text-current opacity-40 hover:opacity-80 transition-opacity shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Messaging */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold text-white/25 uppercase tracking-widest">Messaging</p>
          {PLATFORMS.filter(p => ['email', 'instagram', 'tiktok'].includes(p.id)).map(def => (
            <PlatformCard
              key={def.id}
              def={def}
              connected={def.platform ? getConnected(def.platform) : []}
              lastActivity={def.platform ? getLastActivity(def.platform) : null}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
            />
          ))}
        </div>

        {/* Commerce */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold text-white/25 uppercase tracking-widest">Commerce</p>
          {PLATFORMS.filter(p => p.id === 'shopify').map(def => (
            <PlatformCard
              key={def.id}
              def={def}
              connected={def.platform ? getConnected(def.platform) : []}
              lastActivity={def.platform ? getLastActivity(def.platform) : null}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
            />
          ))}
        </div>

        {/* Team */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold text-white/25 uppercase tracking-widest">Team</p>
          <SmsCard />
        </div>

      </div>
    </div>
  )
}
