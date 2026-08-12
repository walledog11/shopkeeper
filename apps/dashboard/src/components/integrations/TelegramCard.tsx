"use client"

import { useReducer } from "react"
import useSWR from "swr"
import {
  channelBindingError,
  channelBindingValue,
  useChannelBindingAttempt,
} from "@/hooks/useChannelBindingAttempt"
import { cn } from "@/lib/ui/cn"
import { fetcher } from "@/lib/api/fetcher"
import type { PersonalDeviceIntegrationDefinition } from "@/lib/integrations/catalog"
import { startTelegramBinding } from "@/lib/integrations/channel-binding-client"
import { openChannelBindingWindow } from "@/lib/integrations/open-channel-binding-window"
import type { TelegramMemberStatus } from "@/lib/integrations/telegram-status"
import {
  CARD_ACTIONS,
  CARD_BUTTON_DISABLED,
  CARD_BUTTON_PRIMARY,
  CARD_BUTTON_SECONDARY,
  CARD_DESCRIPTION,
  CARD_SHELL,
} from "./integration-card-styles"
import { IntegrationCardHeader } from "./IntegrationCardParts"
import { IntegrationConfigureDialog } from "./IntegrationConfigureDialog"
import { TelegramConnectBody } from "./connect-bodies/TelegramConnectBody"
import {
  TelegramActionsSection,
  TelegramDevicesSection,
  TelegramPermissionsSection,
} from "./TelegramConfigureSections"

const MAX_TELEGRAM_DEVICES = 3

interface TelegramCardState {
  disconnecting: string | "all" | null
  error: string | null
  open: boolean
}

const INITIAL_STATE: TelegramCardState = {
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
  initialStatus,
}: {
  config: PersonalDeviceIntegrationDefinition
  botUsername: string | null
  initialStatus?: TelegramMemberStatus | null
}) {
  const { data: status, mutate } = useSWR<TelegramMemberStatus>(
    '/api/integrations/telegram',
    fetcher,
    initialStatus ? { fallbackData: initialStatus } : undefined,
  )

  const [{ disconnecting, error: actionError, open }, updateState] =
    useReducer(mergeState, INITIAL_STATE)

  const chats = status?.chats ?? []
  const isConnected = chats.length > 0
  const botUsername = configuredBotUsername ?? status?.botUsername ?? null
  const isAvailable = Boolean(botUsername)
  const atDeviceLimit = chats.length >= MAX_TELEGRAM_DEVICES
  const binding = useChannelBindingAttempt({
    connectionCount: chats.length,
    requestBinding: (signal) => startTelegramBinding({ signal }),
    refreshStatus: mutate,
    requestFailureMessage: "Couldn't start Telegram connect.",
    refreshFailureMessage: "Couldn't verify the Telegram connection. Try again.",
  })
  const connectUrl = channelBindingValue(binding.state)
  const connecting = binding.state.status === "requesting"
  const error = actionError ?? channelBindingError(binding.state)

  function connect() {
    updateState({ error: null })
    void openChannelBindingWindow(binding.start)
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
      await mutate()
      binding.reset()
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
        <IntegrationCardHeader config={config} />
        <p className={CARD_DESCRIPTION}>{config.description}</p>

        <div className={CARD_ACTIONS}>
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
        onOpenChange={(nextOpen) => {
          updateState({ open: nextOpen, error: nextOpen ? null : actionError })
          if (nextOpen && channelBindingError(binding.state)) binding.reset()
        }}
        config={config}
        statusLine={dialogStatusLine}
      >
        {error && <p className="text-xs text-red-600">{error}</p>}

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
            connectUrl={connectUrl}
            disabled={!isAvailable}
            onConnect={connect}
          />
        )}
      </IntegrationConfigureDialog>
    </>
  )
}
