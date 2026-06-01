"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Check, Copy, ChevronDown, AlertTriangle, Loader2, BookOpen, Mail } from "lucide-react"
import { cn } from "@/lib/ui/cn"
import { fetcher } from "@/lib/api/fetcher"
import { resolveAgentSettings } from "@/lib/agent/settings"
import {
  getEmailProvider,
  getEmailProviderLabel,
  getEmailReauthorizePath,
  isEmailAuthReauthorizationRequired,
} from "@/lib/messaging/email/providers"
import type { ConnectType, PlatformConfig } from "@/lib/integrations/catalog"
import type { Integration, OrgSettings } from "@/types"
import { PermissionToggleRow } from "./PermissionToggleRow"
import { StatusPill } from "./StatusPill"
import type { PillState } from "./integration-card-types"

export type { ConnectType, PlatformConfig }

// ── Helpers ────────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button type="button"
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      aria-label="Copy"
      title="Copy"
      className="ml-1 text-white/20 hover:text-white/50 transition-colors"
    >
      {copied
        ? <Check className="size-3 text-emerald-400" />
        : <Copy className="size-3" />
      }
    </button>
  )
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

function isTokenExpired(integration: Integration) {
  if (!integration.tokenExpiresAt) return false
  if (integration.platform === 'email') return isEmailAuthReauthorizationRequired(integration)
  return new Date(integration.tokenExpiresAt).getTime() < Date.now()
}

function isTokenExpiringSoon(integration: Integration) {
  if (!integration.tokenExpiresAt) return false
  if (integration.platform === 'email') return false
  const msLeft = new Date(integration.tokenExpiresAt).getTime() - Date.now()
  return msLeft > 0 && msLeft / 86_400_000 < 10
}

function isPostmarkEmail(integration: Integration): boolean {
  if (integration.platform !== 'email') return false
  return getEmailProvider(integration) === 'postmark'
}

const FORWARDING_GUIDES = [
  {
    id: 'google',
    label: 'Google Workspace',
    steps: [
      'Gmail → Settings (gear) → See all settings → Forwarding and POP/IMAP.',
      'Click "Add a forwarding address" and paste the address above.',
      'Gmail sends a verification code to that address , it will appear as a new ticket in Clerk. Paste the code back into Gmail.',
      'Select "Forward a copy of incoming mail to…" and choose to keep Gmail\'s copy in the inbox.',
    ],
  },
  {
    id: 'outlook',
    label: 'Outlook 365',
    steps: [
      'Outlook on the web → Settings → Mail → Forwarding.',
      'Enable forwarding and paste the address above.',
      'Tick "Keep a copy of forwarded messages" so your archive stays intact.',
      'Save.',
    ],
  },
  {
    id: 'cpanel',
    label: 'cPanel',
    steps: [
      'cPanel → Email → Forwarders → Add Forwarder.',
      'Address to Forward: your support address (e.g. support@yourstore.com).',
      'Destination: Forward to email address , paste the address above.',
      'Add Forwarder.',
    ],
  },
  {
    id: 'cloudflare',
    label: 'Cloudflare',
    steps: [
      'Cloudflare Dashboard → your domain → Email → Email Routing → Destination addresses.',
      'Add the address above as a destination. Cloudflare sends a verification email , it will appear as a new ticket in Clerk. Click the link inside.',
      'Routes → create a custom address (e.g. support@yourdomain.com) routed to that destination.',
      'Save.',
    ],
  },
] as const

type ForwardingProviderId = typeof FORWARDING_GUIDES[number]['id']

function useEmailForwardingDisclosureView({
  isConnected,
  email,
  setEmail,
  loading,
  onSave,
}: {
  isConnected: boolean
  email: string
  setEmail: (v: string) => void
  loading: boolean
  onSave: () => void
}) {
  const [open, setOpen] = useState(false)
  const [provider, setProvider] = useState<ForwardingProviderId>('google')
  const { data: org } = useSWR<{ id: string; inboundEmailDomain: string }>(open ? '/api/org' : null, fetcher)
  const inboundAddress = org?.id && org.inboundEmailDomain ? `${org.id}@${org.inboundEmailDomain}` : null
  const guide = FORWARDING_GUIDES.find(g => g.id === provider) ?? FORWARDING_GUIDES[0]

  return (
    <div className="rounded-md border border-white/[0.06] bg-white/[0.015]">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 text-left"
      >
        <span className="text-xs font-medium text-white/55">Use email forwarding (advanced)</span>
        <ChevronDown className={cn("size-3.5 text-white/30 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="px-3.5 pb-3.5 space-y-3 border-t border-white/[0.05]">
          <div className="space-y-1.5 pt-3">
            <p className="text-xs font-semibold text-white/35 uppercase tracking-wider">Forward incoming mail to</p>
            <div className="flex items-center gap-2 rounded-md bg-black/30 border border-white/[0.07] px-3 py-2">
              {inboundAddress ? (
                <>
                  <p className="text-xs font-mono text-white/65 truncate flex-1">{inboundAddress}</p>
                  <CopyButton text={inboundAddress} />
                </>
              ) : (
                <p className="text-xs text-white/30">Loading…</p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold text-white/35 uppercase tracking-wider">Set up forwarding</p>
            <div className="flex flex-wrap gap-1">
              {FORWARDING_GUIDES.map(g => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setProvider(g.id)}
                  className={cn(
                    "text-xs font-medium rounded-md px-2.5 py-1 border transition-colors",
                    provider === g.id
                      ? "bg-white/[0.08] border-white/[0.15] text-white/85"
                      : "bg-transparent border-white/[0.08] text-white/40 hover:text-white/65 hover:border-white/[0.12]",
                  )}
                >
                  {g.label}
                </button>
              ))}
            </div>
            <ol className="text-xs text-white/40 space-y-1 list-decimal list-inside leading-relaxed pt-0.5">
              {guide.steps.map((s) => <li key={s}>{s}</li>)}
            </ol>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-white/35 uppercase tracking-wider">Your support address</p>
            <div className="flex gap-2">
              <Input aria-label="support@yourstore.com"
                type="email"
                placeholder="support@yourstore.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') onSave() }}
                className="h-9 text-sm"
              />
              <Button
                size="sm"
                disabled={!email || loading}
                onClick={onSave}
                className="shrink-0 h-9 px-4 font-medium"
              >
                {loading ? <Loader2 className="size-3.5 animate-spin" /> : isConnected ? 'Replace' : 'Save'}
              </Button>
            </div>
            <p className="text-xs text-white/30 leading-relaxed">
              Replies go out under this address.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function useShopifyPermissionsPanelView(enabled: boolean) {
  const { data, mutate } = useSWR<{ settings: Partial<OrgSettings> }>(enabled ? '/api/org' : null, fetcher)
  const settings = resolveAgentSettings(data?.settings)
  const refundCap = settings.maxRefundAmount == null ? null : `auto-approve up to $${settings.maxRefundAmount}`

  async function patch(partial: Partial<OrgSettings>) {
    await fetch('/api/org', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: partial }),
    })
    await mutate()
  }

  if (!enabled) return null

  return (
    <div className="rounded-lg bg-white/[0.02] border border-white/[0.06] px-4 py-3">
      <div className="flex items-baseline justify-between mb-1">
        <p className="text-xs font-semibold text-white/30 uppercase tracking-widest">Permissions &amp; limits</p>
        <Link
          href="/dashboard/settings"
          className="text-xs font-medium text-white/30 hover:text-white/70 transition-colors"
        >
          Advanced settings →
        </Link>
      </div>
      <div className="divide-y divide-white/[0.05]">
        <PermissionToggleRow
          label="Read orders, customers, products"
          required
          checked={settings.toolsEnabled.read}
          onChange={() => { /* required */ }}
        />
        <PermissionToggleRow
          label="Issue refunds"
          suffix={settings.toolsEnabled.action ? refundCap : null}
          checked={settings.toolsEnabled.action}
          onChange={(v) => { void patch({ toolsEnabled: { ...settings.toolsEnabled, action: v } }) }}
        />
        <PermissionToggleRow
          label="Cancel unfulfilled orders"
          checked={settings.toolsEnabled.action && !settings.blockCancellations}
          onChange={(v) => { void patch({ blockCancellations: !v }) }}
        />
        <PermissionToggleRow
          label="Modify line items & discounts"
          checked={settings.toolsEnabled.action && !settings.blockCustomLineItems}
          onChange={(v) => { void patch({ blockCustomLineItems: !v }) }}
        />
      </div>
    </div>
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

export default function IntegrationCard(props: Props) {
  return useIntegrationCardView(props)
}

function useIntegrationCardView({ config, connected, onConnect, onDisconnect, lastActivity }: Props) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [shop, setShop] = useState('')
  const [loading, setLoading] = useState(false)
  const [notified, setNotified] = useState(false)
  const [kbSyncing, setKbSyncing] = useState(false)
  const [kbSyncResult, setKbSyncResult] = useState<string | null>(null)

  const isConnected = connected.length > 0
  const isComingSoon = config.connectType === 'coming-soon'

  const hasExpired = isConnected && connected.some(isTokenExpired)
  const hasExpiringSoon = isConnected && !hasExpired && connected.some(isTokenExpiringSoon)
  const needsReauth = hasExpired || hasExpiringSoon

  const isAwaitingFirstInbound =
    isConnected &&
    !lastActivity &&
    config.connectType === 'email' &&
    connected.every(isPostmarkEmail)

  const pillState: PillState = isComingSoon
    ? 'coming-soon'
    : hasExpired
    ? 'action-needed'
    : hasExpiringSoon
    ? 'auth-expiring'
    : isAwaitingFirstInbound
    ? 'waiting-for-inbound'
    : isConnected
    ? 'connected'
    : 'not-connected'

  const accountIdInline: string | null = isConnected
    ? (config.connectType === 'ig'
        ? (connected[0].fromEmail || `@${connected[0].externalAccountId}`)
        : connected[0].externalAccountId)
    : null

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

  function handleReauthorize() {
    if (config.connectType === 'ig') {
      window.location.href = '/api/integrations/instagram/auth'
    } else if (config.connectType === 'shopify' && connected[0]) {
      window.location.href = `/api/integrations/shopify/auth?shop=${encodeURIComponent(connected[0].externalAccountId)}`
    } else if (config.connectType === 'email' && connected[0]) {
      const path = getEmailReauthorizePath(connected[0])
      if (path) window.location.href = path
    }
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
      setKbSyncResult('Sync failed , please try again')
    } finally {
      setKbSyncing(false)
      setTimeout(() => setKbSyncResult(null), 4000)
    }
  }
  const shopifyPermissionsPanel = useShopifyPermissionsPanelView(config.connectType === 'shopify' && isConnected)
  const emailForwardingDisclosure = useEmailForwardingDisclosureView({
    isConnected,
    email,
    setEmail,
    loading,
    onSave: handleEmailConnect,
  })

  return (
    <div className={cn(
      "rounded-xl border bg-card overflow-hidden transition-colors",
      isComingSoon
        ? "border-white/[0.04] opacity-50"
        : "border-white/[0.08]"
    )}>

      <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-start gap-4 px-5 py-4 transition-colors hover:bg-white/[0.02] cursor-pointer border-0 bg-transparent text-left [font-family:inherit]"
      >
        {/* Brand-tinted logo */}
        <div className={cn(
          "size-11 rounded-lg flex items-center justify-center shrink-0 border",
          config.accentBg,
          config.accentBorder
        )}>
          <Image src={config.logo} alt={`${config.name} logo`} width={22} height={22} className="object-contain" />
        </div>

        {/* Title block */}
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <p className="text-[15px] font-bold text-white/95 leading-none">{config.name}</p>
            <StatusPill state={pillState} />
            {accountIdInline && (
              <span className="text-xs font-mono text-white/35 truncate max-w-[260px]">{accountIdInline}</span>
            )}
          </div>
          <p className="text-xs text-white/40 leading-relaxed">{config.description}</p>
        </div>

        {/* Right column */}
        <div className="flex items-center gap-3 shrink-0 mt-1">
          {isConnected && lastActivity && !needsReauth && (
            <span className="text-xs text-white/30 hidden sm:block">
              synced {formatLastActivity(lastActivity)}
            </span>
          )}
          <ChevronDown className={cn("size-4 text-white/25 transition-transform duration-200", open && "rotate-180")} />
        </div>
      </button>
      {needsReauth && (
        <button type="button"
          onClick={handleReauthorize}
          className="absolute right-12 top-4 text-xs font-semibold text-white/80 bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.12] rounded-md px-3 py-1.5 transition-colors"
        >
          Reauthorize
        </button>
      )}
      </div>

      {/* ── Expanded body ── */}
      {open && !isComingSoon && (
        <div className="border-t border-white/[0.06] px-5 py-4 space-y-4">

          {/* Shopify permissions */}
          {shopifyPermissionsPanel}

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
                          <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-red-400 bg-red-400/[0.08] border border-red-400/[0.15] rounded-full px-1.5 py-0.5 shrink-0">
                            <AlertTriangle className="size-2.5" /> Expired
                          </span>
                        ) : isTokenExpiringSoon(integration) ? (
                          <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-amber-400 bg-amber-400/[0.08] border border-amber-400/[0.15] rounded-full px-1.5 py-0.5 shrink-0">
                            <AlertTriangle className="size-2.5" /> Expiring
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-mono text-white/50 truncate">{integration.externalAccountId}</p>
                        <CopyButton text={integration.externalAccountId} />
                        {config.connectType === 'email' && (
                          <span className="inline-flex items-center text-xs font-semibold text-white/45 bg-white/[0.05] border border-white/[0.10] rounded px-1.5 py-0.5 shrink-0">
                            {getEmailProviderLabel(integration)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <button type="button"
                    onClick={() => onDisconnect(integration.id)}
                    className="text-xs font-medium text-white/25 hover:text-red-400 transition-colors whitespace-nowrap shrink-0"
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
                <p className="text-xs text-white/40 leading-relaxed">
                  Connect your support inbox. Replies will be sent from your real address.
                </p>
              )}
              {!isConnected && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <form action="/api/integrations/gmail/auth" method="post">
                    <button
                      type="submit"
                      className="flex w-full items-center justify-center gap-2 h-10 px-4 rounded-md bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.10] text-sm font-medium text-white/85 transition-colors"
                    >
                      <Image src="/logos/gmail.png" alt="" width={16} height={16} className="object-contain" />
                      Connect Gmail
                    </button>
                  </form>
                  <form action="/api/integrations/outlook/auth" method="post">
                    <button
                      type="submit"
                      className="flex w-full items-center justify-center gap-2 h-10 px-4 rounded-md bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.10] text-sm font-medium text-white/85 transition-colors"
                    >
                      <Mail className="size-4 text-white/65" />
                      Connect Outlook
                    </button>
                  </form>
                </div>
              )}
              {emailForwardingDisclosure}
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
              <form action="/api/integrations/instagram/auth" method="post">
                <Button type="submit" size="sm" className="h-9 px-4 font-medium">
                  {isConnected ? 'Reconnect' : 'Connect with Instagram'}
                </Button>
              </form>
            </div>
          )}

          {/* Shopify connect form */}
          {config.connectType === 'shopify' && (
            <div className="space-y-3">
              {!isConnected && (
                <div className="space-y-2">
                  <p className="text-xs text-white/40 leading-relaxed">
                    Sync customer orders, returns, and Shopify Inbox messages directly into Clerk.
                  </p>
                  <ol className="text-xs text-white/30 space-y-1 list-decimal list-inside leading-relaxed">
                    <li>Enter your <span className="font-mono text-white/45">.myshopify.com</span> store domain below</li>
                    <li>You&apos;ll be redirected to Shopify to authorize Clerk</li>
                    <li>Order data and messages will sync automatically</li>
                  </ol>
                </div>
              )}
              {!isConnected && (
                <div className="flex gap-2">
                  <Input aria-label="mystore.myshopify.com"
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
                    {loading ? <Loader2 className="size-3.5 animate-spin" /> : 'Connect'}
                  </Button>
                </div>
              )}
              {isConnected && (
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={kbSyncing}
                    onClick={handleKbSync}
                    className="h-8 px-3 text-xs font-medium text-white/40 hover:text-white/70 hover:bg-white/[0.04]"
                  >
                    {kbSyncing
                      ? <><Loader2 className="size-3 mr-1.5 animate-spin" />Syncing…</>
                      : <><BookOpen className="size-3 mr-1.5" />Sync to KB</>
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

        </div>
      )}

      {/* Coming soon expanded */}
      {open && isComingSoon && (
        <div className="border-t border-white/[0.06] px-5 py-4 flex items-center justify-between">
          <p className="text-xs text-white/30">This integration isn&apos;t available yet.</p>
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
            {notified ? <><Check className="size-3 mr-1" />Notified</> : "Notify me"}
          </Button>
        </div>
      )}

    </div>
  )
}
