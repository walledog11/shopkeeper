"use client"

import { useState } from "react"
import useSWR from "swr"
import { cn } from "@/lib/ui/cn"
import { fetcher } from "@/lib/api/fetcher"
import type { PlatformConfig } from "@/lib/integrations/catalog"
import {
  CARD_BUTTON_DISABLED,
  CARD_BUTTON_PRIMARY,
  CARD_BUTTON_SECONDARY,
  CARD_DESCRIPTION,
  CARD_SHELL,
  CARD_TITLE,
} from "./integration-card-styles"
import {
  CardLogo,
  ShopkeeperBadge,
} from "./IntegrationCardParts"
import { IntegrationConfigureDialog } from "./IntegrationConfigureDialog"
import {
  TelegramActionsSection,
  TelegramDevicesSection,
  TelegramPermissionsSection,
} from "./TelegramConfigureSections"

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

  const dialogStatusLine = isConnected ? null : config.description

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

      <IntegrationConfigureDialog
        open={open}
        onOpenChange={setOpen}
        config={config}
        statusLine={dialogStatusLine}
      >
        {error && <p className="text-xs text-red-400">{error}</p>}

        {isConnected ? (
          <>
            <TelegramDevicesSection
              chats={chats}
              disconnecting={disconnecting}
              onDisconnect={disconnect}
            />
            <TelegramPermissionsSection />
            <TelegramActionsSection
              isConnected={isConnected}
              connecting={connecting}
              disconnecting={disconnecting}
              atDeviceLimit={atDeviceLimit}
              onConnect={connect}
              onDisconnectAll={() => disconnect()}
            />
          </>
        ) : (
          <>
            <ol className="text-xs text-white/40 space-y-1 list-decimal list-inside leading-relaxed">
              <li>Click Connect Telegram — opens a chat with the Shopkeeper bot</li>
              <li>Tap Start in Telegram to link this device</li>
              <li>Reply to digests or send free-form instructions from there</li>
            </ol>
            <TelegramActionsSection
              isConnected={isConnected}
              connecting={connecting}
              disconnecting={disconnecting}
              atDeviceLimit={atDeviceLimit}
              onConnect={connect}
              onDisconnectAll={() => disconnect()}
            />
          </>
        )}
      </IntegrationConfigureDialog>
    </>
  )
}
