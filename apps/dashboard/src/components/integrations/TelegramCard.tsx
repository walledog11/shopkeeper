"use client"

import { useReducer, useRef } from "react"
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
import { CardLogo } from "./IntegrationCardParts"
import { IntegrationConfigureDialog } from "./IntegrationConfigureDialog"
import { TelegramConnectBody } from "./connect-bodies"
import {
  TelegramActionsSection,
  TelegramDevicesSection,
  TelegramPermissionsSection,
} from "./TelegramConfigureSections"

const MAX_TELEGRAM_DEVICES = 3

interface TelegramChat {
  chatId: string
  connectedAt: string
  displayLabel: string | null
}

interface TelegramStatus {
  connected: boolean
  chats: TelegramChat[]
  botUsername: string | null
}

interface TelegramCardState {
  connectUrl: string | null
  connecting: boolean
  disconnecting: string | "all" | null
  error: string | null
  open: boolean
}

const INITIAL_STATE: TelegramCardState = {
  connectUrl: null,
  connecting: false,
  disconnecting: null,
  error: null,
  open: false,
}

function mergeState(state: TelegramCardState, patch: Partial<TelegramCardState>): TelegramCardState {
  return { ...state, ...patch }
}

export default function TelegramCard({
  config,
  botUsername: configuredBotUsername,
}: {
  config: PlatformConfig
  botUsername: string | null
}) {
  const { data: status, mutate } = useSWR<TelegramStatus>('/api/integrations/telegram', fetcher)

  const [{ connectUrl, connecting, disconnecting, error, open }, updateState] =
    useReducer(mergeState, INITIAL_STATE)
  const connectIssuedChatCountRef = useRef<number | null>(null)

  const chats = status?.chats ?? []
  const isConnected = chats.length > 0
  const botUsername = configuredBotUsername ?? status?.botUsername ?? null
  const isAvailable = Boolean(botUsername)
  const atDeviceLimit = chats.length >= MAX_TELEGRAM_DEVICES

  const visibleConnectUrl = connectIssuedChatCountRef.current !== null
    && chats.length > connectIssuedChatCountRef.current
    ? null
    : connectUrl

  async function connect() {
    updateState({ connecting: true, error: null })
    try {
      const res = await fetch('/api/integrations/telegram', { method: 'POST' })
      const data = await res.json() as { url?: string; error?: string }
      if (!res.ok) throw new Error(data.error || 'Failed to start Telegram connect')
      if (!data.url) throw new Error('Failed to start Telegram connect')
      updateState({ connectUrl: data.url })
      connectIssuedChatCountRef.current = chats.length
      window.open(data.url, '_blank', 'noopener,noreferrer')
      setTimeout(() => mutate(), 5000)
    } catch (e) {
      updateState({ error: e instanceof Error ? e.message : 'Failed to start Telegram connect' })
    } finally {
      updateState({ connecting: false })
    }
  }

  async function disconnect(chatId?: string) {
    const key = chatId ?? "all"
    updateState({ disconnecting: key, error: null })
    try {
      const url = chatId
        ? `/api/integrations/telegram?chatId=${encodeURIComponent(chatId)}`
        : '/api/integrations/telegram'
      const res = await fetch(url, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed')
      updateState({ connectUrl: null })
      connectIssuedChatCountRef.current = null
      await mutate()
    } catch (e) {
      updateState({ error: e instanceof Error ? e.message : 'Failed to disconnect Telegram' })
    } finally {
      updateState({ disconnecting: null })
    }
  }

  const dialogStatusLine = isConnected
    ? chats.length === 1
      ? (chats[0].displayLabel ?? "1 device linked")
      : `${chats.length} devices linked`
    : config.description

  return (
    <>
      <div id="telegram" className={CARD_SHELL}>
        <CardLogo config={config} />

        <p className={cn("mt-4", CARD_TITLE)}>{config.name}</p>
        <p className={cn("mt-2 flex-1", CARD_DESCRIPTION)}>{config.description}</p>

        <div className="mt-4 flex gap-2">
          {!isConnected ? (
            isAvailable ? (
              <button type="button" onClick={() => updateState({ open: true, error: null })} className={CARD_BUTTON_PRIMARY}>Connect</button>
            ) : (
              <button
                type="button"
                disabled
                title="Telegram isn't configured on this deployment yet."
                className={CARD_BUTTON_DISABLED}
              >
                Connect
              </button>
            )
          ) : (
            <button type="button" onClick={() => updateState({ open: true, error: null })} className={CARD_BUTTON_SECONDARY}>Configure</button>
          )}
        </div>
      </div>

      <IntegrationConfigureDialog
        open={open}
        onOpenChange={open => updateState({ open, error: open ? null : error })}
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
          <TelegramConnectBody
            botUsername={botUsername}
            connecting={connecting}
            connectUrl={visibleConnectUrl}
            disabled={!isAvailable}
            onConnect={connect}
          />
        )}
      </IntegrationConfigureDialog>
    </>
  )
}
