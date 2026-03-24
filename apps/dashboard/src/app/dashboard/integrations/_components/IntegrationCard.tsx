"use client"

import { useState } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Check, Copy, Lock, ChevronRight, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Integration } from "@/types"

export type ConnectType = 'email' | 'ig' | 'coming-soon'

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
    <div className="mx-5 mb-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
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

// ── Card ───────────────────────────────────────────────────────────────────────

interface Props {
  config: PlatformConfig
  connected: Integration[]
  onConnect: (platform: string, email: string) => Promise<boolean>
  onDisconnect: (integrationId: string) => void
}

export default function IntegrationCard({ config, connected, onConnect, onDisconnect }: Props) {
  const [showEmailForm, setShowEmailForm] = useState(false)

  const isConnected = connected.length > 0
  const isComingSoon = config.connectType === 'coming-soon'

  const isTokenExpiringSoon = (integration: Integration) => {
    if (!integration.tokenExpiresAt) return false
    return (new Date(integration.tokenExpiresAt).getTime() - Date.now()) / 86_400_000 < 10
  }

  return (
    <div className={cn(
      "flex flex-col rounded-2xl border bg-white transition-all duration-200",
      isComingSoon
        ? "border-slate-200 opacity-55"
        : isConnected
          ? "border-green-200 shadow-sm ring-1 ring-green-100/80"
          : "border-slate-200 hover:border-slate-300 hover:shadow-sm"
    )}>

      {/* Header */}
      <div className="flex items-center gap-4 p-5 pb-4">
        <div className={cn(
          "h-11 w-11 rounded-xl flex items-center justify-center p-2 shrink-0 border transition-colors",
          isConnected ? "bg-green-50 border-green-200" : "bg-slate-50 border-slate-200"
        )}>
          <Image src={config.logo} alt={`${config.name} logo`} width={28} height={28} className="object-contain" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 leading-none mb-1.5">{config.name}</p>
          {isComingSoon ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600">
              <Lock className="w-3 h-3" /> Coming soon
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <span className={cn("w-2 h-2 rounded-full shrink-0", isConnected ? "bg-green-500" : "bg-slate-300")} />
              <span className={cn("text-[11px] font-semibold", isConnected ? "text-green-700" : "text-slate-400")}>
                {isConnected ? "Connected" : "Not connected"}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Description */}
      <p className="px-5 pb-4 text-sm text-slate-500 leading-relaxed">{config.description}</p>

      {/* Connected accounts */}
      {isConnected && (
        <div className="mx-5 mb-4 rounded-xl border border-slate-100 overflow-hidden divide-y divide-slate-100">
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

      {/* Footer */}
      <div className="mt-auto px-5 py-4 border-t border-slate-100 flex justify-end">
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
              className="font-semibold h-8 text-xs bg-gradient-to-r from-purple-600 to-pink-500 text-white hover:from-purple-700 hover:to-pink-600 border-0 gap-1"
            >
              {isConnected ? 'Reconnect' : <><span>Connect</span><ChevronRight className="w-3.5 h-3.5" /></>}
            </Button>
          </a>
        )}
        {config.connectType === 'coming-soon' && (
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
}
