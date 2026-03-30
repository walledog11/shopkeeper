"use client"

import { useState } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Check, Copy, Lock, ChevronRight, AlertTriangle } from "lucide-react"
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
      className="ml-1.5 text-slate-400 hover:text-slate-600 transition-colors"
    >
      {copied
        ? <Check className="w-3.5 h-3.5 text-green-500" />
        : <Copy className="w-3.5 h-3.5" />
      }
    </button>
  )
}

function EmailConnectForm({
  onConnect,
  onClose,
}: {
  onConnect: (email: string) => Promise<boolean>
  onClose: () => void
}) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!email) return
    setLoading(true)
    try {
      const ok = await onConnect(email)
      if (ok) {
        setEmail('')
        onClose()
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-5 mb-4 rounded-md border border-slate-200 bg-slate-50/60 p-4 space-y-3">
      <div className="space-y-1.5">
        <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
          Support email address
        </label>
        <p className="text-xs text-slate-400">
          The email address your customers send support requests to. Emails to this address will appear as tickets.
        </p>
        <div className="flex gap-2">
          <Input
            type="email"
            placeholder="support@yourstore.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
            className="text-sm bg-white h-9"
          />
          <Button
            size="sm"
            disabled={!email || loading}
            onClick={handleSubmit}
            className="shrink-0 h-9 bg-slate-900 text-white hover:bg-slate-700 font-semibold"
          >
            {loading ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function ShopifyConnectForm({ onClose }: { onClose: () => void }) {
  const [shop, setShop] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = () => {
    const domain = shop.trim()
    if (!domain) return
    setLoading(true)
    // Redirect to OAuth — page will navigate away
    window.location.href = `/api/integrations/shopify/auth?shop=${encodeURIComponent(domain)}`
  }

  return (
    <div className="mx-5 mb-4 rounded-md border border-slate-200 bg-slate-50/60 p-4 space-y-3">
      <div className="space-y-1.5">
        <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
          Shopify store domain
        </label>
        <p className="text-xs text-slate-400">
          Enter your myshopify.com domain, e.g. <span className="font-mono">mystore.myshopify.com</span>
        </p>
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="mystore.myshopify.com"
            value={shop}
            onChange={(e) => setShop(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
            className="text-sm bg-white h-9"
          />
          <Button
            size="sm"
            disabled={!shop.trim() || loading}
            onClick={handleSubmit}
            className="shrink-0 h-9 bg-[#96BF48] hover:bg-[#7da33a] text-white font-semibold border-0"
          >
            {loading ? 'Redirecting…' : 'Connect'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Card ───────────────────────────────────────────────────────────────────────

interface Props {
  config: PlatformConfig
  connected: Integration[]
  onConnect: (platform: string, email: string) => Promise<boolean>
  onConnectTwilio?: () => Promise<void>
  onDisconnect: (integrationId: string) => void
}

export default function IntegrationCard({ config, connected, onConnect, onConnectTwilio, onDisconnect }: Props) {
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [showShopifyForm, setShowShopifyForm] = useState(false)
  const [twilioProvisioning, setTwilioProvisioning] = useState(false)
  const [notified, setNotified] = useState(false)

  const isConnected = connected.length > 0
  const isComingSoon = config.connectType === 'coming-soon'

  const isTokenExpiringSoon = (integration: Integration) => {
    if (!integration.tokenExpiresAt) return false
    return (new Date(integration.tokenExpiresAt).getTime() - Date.now()) / 86_400_000 < 10
  }

  return (
    <div className={cn(
      "flex flex-col rounded-md border bg-white transition-all duration-200 min-h-[220px]",
      isComingSoon
        ? "border-slate-200 opacity-60"
        : isConnected
          ? "border-green-200 shadow-sm ring-1 ring-green-100/80"
          : "border-slate-200 hover:border-slate-300 hover:shadow-sm"
    )}>

      {/* Header */}
      <div className="flex items-center gap-3 p-4 pb-3">
        <div className={cn(
          "h-10 w-10 rounded-md flex items-center justify-center p-2 shrink-0 border transition-colors",
          isConnected ? "bg-green-50 border-green-200" : "bg-slate-50 border-slate-200"
        )}>
          <Image src={config.logo} alt={`${config.name} logo`} width={26} height={26} className="object-contain" />
        </div>

        <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-900 truncate">{config.name}</p>
          {isComingSoon ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 shrink-0">
              <Lock className="w-3 h-3" /> Coming soon
            </span>
          ) : isConnected ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 shrink-0">
              <Check className="w-3 h-3" /> Connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-300" />
              <span className="text-[11px] font-medium text-slate-400">Not connected</span>
            </span>
          )}
        </div>
      </div>

      {/* Description */}
      <p className="px-4 pb-3 text-sm text-slate-500 leading-relaxed">{config.description}</p>

      {/* Connected accounts */}
      {isConnected && (
        <div className="mx-4 mb-3 rounded-md border border-slate-100 overflow-hidden divide-y divide-slate-100">
          {connected.map((integration) => (
            <div key={integration.id} className="flex items-center gap-3 px-4 py-3 bg-slate-50/70">
              <div className="flex-1 min-w-0">
                {config.connectType === 'ig' ? (
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-semibold text-slate-700 truncate">
                      {integration.fromEmail || integration.externalAccountId}
                    </p>
                    {isTokenExpiringSoon(integration) && (
                      <span
                        title="Token expiring soon — reconnect to keep receiving messages"
                        className="flex items-center gap-0.5 text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 shrink-0"
                      >
                        <AlertTriangle className="w-2.5 h-2.5" /> Expiring
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center">
                    <p className="text-xs font-mono font-medium text-slate-700 truncate">
                      {integration.externalAccountId}
                    </p>
                    <CopyButton text={integration.externalAccountId} />
                  </div>
                )}
              </div>
              <button
                onClick={() => onDisconnect(integration.id)}
                className="text-[11px] font-semibold text-slate-400 hover:text-red-500 transition-colors whitespace-nowrap shrink-0"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Email setup form */}
      {config.connectType === 'email' && showEmailForm && (
        <EmailConnectForm
          onConnect={(email) => onConnect(config.platform!, email)}
          onClose={() => setShowEmailForm(false)}
        />
      )}

      {/* Shopify shop domain form */}
      {config.connectType === 'shopify' && showShopifyForm && (
        <ShopifyConnectForm onClose={() => setShowShopifyForm(false)} />
      )}


      {/* Footer */}
      <div className="mt-auto px-4 py-3 border-t border-slate-100 flex justify-end">
        {config.connectType === 'email' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowEmailForm((s) => !s)}
            className="font-semibold text-slate-700 border-slate-200 hover:bg-slate-50 h-8 text-xs gap-1"
          >
            {showEmailForm ? 'Cancel' : isConnected
              ? 'Manage'
              : <><span>Connect</span><ChevronRight className="w-3.5 h-3.5" /></>
            }
          </Button>
        )}
        {config.connectType === 'ig' && (
          <a href="/api/integrations/instagram/auth">
            <Button
              size="sm"
              className="font-semibold h-8 text-xs bg-slate-900 hover:bg-slate-700 text-white border-0 gap-1"
            >
              {isConnected ? 'Reconnect' : <><span>Connect</span><ChevronRight className="w-3.5 h-3.5" /></>}
            </Button>
          </a>
        )}
        {config.connectType === 'shopify' && (
          <Button
            size="sm"
            onClick={() => setShowShopifyForm((s) => !s)}
            className="font-semibold h-8 text-xs bg-[#96BF48] hover:bg-[#7da33a] text-white border-0 gap-1"
          >
            {showShopifyForm ? 'Cancel' : isConnected
              ? 'Reconnect'
              : <><span>Connect</span><ChevronRight className="w-3.5 h-3.5" /></>
            }
          </Button>
        )}
        {config.connectType === 'twilio' && !isConnected && (
          <Button
            size="sm"
            disabled={twilioProvisioning}
            onClick={async () => {
              if (!onConnectTwilio) return
              setTwilioProvisioning(true)
              try { await onConnectTwilio() } finally { setTwilioProvisioning(false) }
            }}
            className="font-semibold h-8 text-xs bg-slate-900 hover:bg-slate-700 text-white border-0 gap-1.5"
          >
            {twilioProvisioning
              ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Provisioning…</>
              : <><span>Enable SMS</span><ChevronRight className="w-3.5 h-3.5" /></>
            }
          </Button>
        )}
        {config.connectType === 'coming-soon' && (
          <Button
            variant="outline"
            size="sm"
            disabled={notified}
            onClick={() => {
              setNotified(true)
              setTimeout(() => setNotified(false), 3000)
            }}
            className={cn(
              "font-semibold h-8 text-xs border transition-colors",
              notified
                ? "text-green-600 border-green-200 bg-green-50"
                : "text-slate-500 border-slate-200 hover:bg-slate-50"
            )}
          >
            {notified
              ? <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5" />Notified!</span>
              : "Notify me"
            }
          </Button>
        )}
      </div>

    </div>
  )
}
