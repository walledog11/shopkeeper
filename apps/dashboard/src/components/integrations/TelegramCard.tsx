"use client"

import { useState } from "react"
import useSWR from "swr"
import { ChevronDown, Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { fetcher } from "@/lib/api/fetcher"
import { cn } from "@/lib/ui/cn"

interface TelegramStatus {
  connected: boolean
  chatId: string | null
  botUsername: string | null
}

export default function TelegramCard() {
  const { data: status, mutate } = useSWR<TelegramStatus>('/api/integrations/telegram', fetcher)

  const [open, setOpen] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isConnected = status?.connected ?? false
  const isAvailable = !!status?.botUsername

  async function connect() {
    setConnecting(true)
    setError(null)
    try {
      const res = await fetch('/api/integrations/telegram', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to start Telegram connect')
      window.open(data.url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start Telegram connect')
    } finally {
      setConnecting(false)
    }
  }

  async function disconnect() {
    setDisconnecting(true)
    setError(null)
    try {
      const res = await fetch('/api/integrations/telegram', { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed')
      await mutate()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to disconnect Telegram')
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-card overflow-hidden">
      <button type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-start gap-4 px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
      >
        <div className="size-11 rounded-lg flex items-center justify-center shrink-0 bg-sky-500/[0.08] border border-sky-500/20">
          <Send className="size-[22px] text-sky-300" />
        </div>

        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <p className="text-[15px] font-bold text-white/95 leading-none">Telegram</p>
            {isConnected ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-400/[0.08] border border-emerald-400/[0.20] rounded-full px-2 py-0.5">
                <span className="size-1.5 rounded-full bg-emerald-400" />
                Connected
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/30 border border-white/[0.10] rounded-full px-2 py-0.5">
                <span className="size-1.5 rounded-full bg-white/20" />
                Not connected
              </span>
            )}
            {isConnected && status?.chatId && (
              <span className="text-xs font-mono text-white/35 truncate max-w-[260px]">chat {status.chatId}</span>
            )}
          </div>
          <p className="text-xs text-white/40 leading-relaxed">
            Talk to the AI agent over Telegram. Approve plans, review digests, look up orders.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0 mt-1">
          <ChevronDown className={cn("size-4 text-white/25 transition-transform duration-200", open && "rotate-180")} />
        </div>
      </button>

      {open && (
        <div className="border-t border-white/[0.06] px-5 py-4 space-y-3">
          {error && <p className="text-xs text-red-400">{error}</p>}

          {!isAvailable && (
            <p className="text-xs text-white/40 leading-relaxed">
              Telegram isn&apos;t configured on this deployment yet. Ask the workspace admin to set <span className="font-mono text-white/55">TELEGRAM_BOT_USERNAME</span>.
            </p>
          )}

          {isAvailable && !isConnected && (
            <div className="space-y-3">
              <ol className="text-xs text-white/30 space-y-1 list-decimal list-inside leading-relaxed">
                <li>Click Connect Telegram , opens a chat with the Clerk bot</li>
                <li>Tap Start in Telegram to link this account</li>
                <li>Reply to digests or send free-form instructions from there</li>
              </ol>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={connecting}
                  onClick={connect}
                  className="h-9 px-4 font-medium"
                >
                  {connecting
                    ? <><Loader2 className="size-3.5 animate-spin mr-1.5" />Opening…</>
                    : 'Connect Telegram'
                  }
                </Button>
              </div>
            </div>
          )}

          {isConnected && (
            <div className="rounded-md overflow-hidden border border-white/[0.07]">
              <div className="flex items-center gap-3 px-3.5 py-2.5 bg-white/[0.02]">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white/30 uppercase tracking-wide mb-0.5">Linked chat</p>
                  <p className="text-xs font-mono font-medium text-white/60">{status?.chatId}</p>
                </div>
                <button type="button"
                  onClick={disconnect}
                  disabled={disconnecting}
                  className="text-xs font-medium text-white/25 hover:text-red-400 transition-colors shrink-0"
                >
                  {disconnecting ? 'Disconnecting…' : 'Disconnect'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
