"use client"

import { useState } from "react"
import useSWR from "swr"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/ui/cn"
import { fetcher } from "@/lib/api/fetcher"
import { formatDate } from "@/lib/format/date"
import type { PlatformConfig } from "@/lib/integrations/catalog"
import {
  CARD_BUTTON_DISABLED,
  CARD_BUTTON_PRIMARY,
  CARD_BUTTON_SECONDARY,
  CARD_DESCRIPTION,
  CARD_SHELL,
  CARD_TITLE,
  CardLogo,
  ShopkeeperBadge,
} from "./IntegrationCard"
import { StatusPill } from "./StatusPill"

const MAX_TELEGRAM_DEVICES = 3

interface TelegramChat {
  chatId: string
  connectedAt: string
}

interface TelegramStatus {
  connected: boolean
  chats: TelegramChat[]
  botUsername: string | null
}

export default function TelegramCard({ config }: { config: PlatformConfig }) {
  const { data: status, mutate } = useSWR<TelegramStatus>('/api/integrations/telegram', fetcher)

  const [open, setOpen] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState<string | "all" | null>(null)
  const [error, setError] = useState<string | null>(null)

  const chats = status?.chats ?? []
  const isConnected = chats.length > 0
  const isAvailable = !!status?.botUsername
  const atDeviceLimit = chats.length >= MAX_TELEGRAM_DEVICES

  async function connect() {
    setConnecting(true)
    setError(null)
    try {
      const res = await fetch('/api/integrations/telegram', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to start Telegram connect')
      window.open(data.url, '_blank', 'noopener,noreferrer')
      // Poll so the new binding shows up once the user completes the flow
      setTimeout(() => mutate(), 5000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start Telegram connect')
    } finally {
      setConnecting(false)
    }
  }

  async function disconnect(chatId?: string) {
    const key = chatId ?? "all"
    setDisconnecting(key)
    setError(null)
    try {
      const url = chatId
        ? `/api/integrations/telegram?chatId=${encodeURIComponent(chatId)}`
        : '/api/integrations/telegram'
      const res = await fetch(url, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed')
      await mutate()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to disconnect Telegram')
    } finally {
      setDisconnecting(null)
    }
  }

  return (
    <>
      <div id="telegram" className={CARD_SHELL}>
        <CardLogo config={config} />

        <p className={cn("mt-4", CARD_TITLE)}>{config.name}</p>
        <p className={cn("mt-2 flex-1", CARD_DESCRIPTION)}>{config.description}</p>

        <div className="mt-3">
          <ShopkeeperBadge />
        </div>

        <div className="mt-4 flex gap-2">
          {isConnected ? (
            <button type="button" onClick={() => setOpen(true)} className={CARD_BUTTON_SECONDARY}>Configure</button>
          ) : (
            <button
              type="button"
              disabled={connecting || !isAvailable}
              onClick={connect}
              title={!isAvailable ? "Telegram isn't configured on this deployment yet." : undefined}
              className={isAvailable ? CARD_BUTTON_PRIMARY : CARD_BUTTON_DISABLED}
            >
              {connecting ? 'Opening…' : 'Connect'}
            </button>
          )}
        </div>
        {error && !open && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="border-white/10 sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-3 text-left">
              <CardLogo config={config} />
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <DialogTitle className="text-base font-semibold text-foreground">{config.name}</DialogTitle>
                  <StatusPill state={isConnected ? 'working' : 'not-connected'} />
                </div>
                <DialogDescription className="text-xs">
                  {isConnected
                    ? `${chats.length} device${chats.length === 1 ? '' : 's'} linked`
                    : config.description}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {chats.length > 0 && (
            <div className="rounded-md overflow-hidden border border-white/[0.07] divide-y divide-white/[0.06]">
              {chats.map((chat, i) => (
                <div key={chat.chatId} className="flex items-center gap-3 px-3.5 py-2.5 bg-white/[0.02]">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white/30 uppercase tracking-wide mb-0.5">
                      Device {i + 1}
                    </p>
                    <p className="text-xs font-mono font-medium text-white/60">chat {chat.chatId}</p>
                    <p className="text-[10px] text-white/25 mt-0.5">
                      Connected {formatDate(chat.connectedAt)}
                    </p>
                  </div>
                  <button type="button"
                    onClick={() => disconnect(chat.chatId)}
                    disabled={disconnecting !== null}
                    className="text-xs font-medium text-white/25 hover:text-red-400 transition-colors shrink-0"
                  >
                    {disconnecting === chat.chatId ? 'Disconnecting…' : 'Disconnect'}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            {isConnected && (
              <button
                type="button"
                onClick={() => disconnect()}
                disabled={disconnecting !== null}
                className="text-xs font-medium text-white/25 hover:text-red-400 transition-colors"
              >
                {disconnecting === "all" ? 'Disconnecting all…' : 'Disconnect all'}
              </button>
            )}
            <div className="flex-1" />
            {!isConnected && (
              <ol className="text-xs text-white/30 space-y-1 list-decimal list-inside leading-relaxed">
                <li>Click Connect Telegram — opens a chat with the Shopkeeper bot</li>
                <li>Tap Start in Telegram to link this device</li>
                <li>Reply to digests or send free-form instructions from there</li>
              </ol>
            )}
            <Button
              size="sm"
              disabled={connecting || atDeviceLimit}
              onClick={connect}
              title={atDeviceLimit ? `Device limit of ${MAX_TELEGRAM_DEVICES} reached` : undefined}
              className="h-9 px-4 font-medium shrink-0"
            >
              {connecting
                ? <><Loader2 className="size-3.5 animate-spin mr-1.5" />Opening…</>
                : isConnected ? 'Add device' : 'Connect Telegram'
              }
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
