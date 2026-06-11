"use client"

import { useState } from "react"
import { Bell, Check, Plus, Smartphone, Trash2 } from "lucide-react"
import { formatDate } from "@/lib/format/date"
import { ActionRow } from "./ActionRow"
import { ConfigureAccountRow } from "./ConfigureAccountRow"
import { ConfigureSection } from "./ConfigureSection"
import { PermissionActionLink, PermissionRow } from "./PermissionRow"

const TELEGRAM_PERMISSIONS = [
  "Approve agent replies",
  "Receive ticket digests",
] as const

const DISCONNECT_ALL_NOTE = "Linked devices will stop receiving digests and won't be able to approve replies."

interface TelegramChat {
  chatId: string
  connectedAt: string
}

export function TelegramDevicesSection({
  chats,
  disconnecting,
  onDisconnect,
}: {
  chats: TelegramChat[]
  disconnecting: string | "all" | null
  onDisconnect: (chatId: string) => void
}) {
  if (chats.length === 0) return null

  return (
    <div className="space-y-2">
      {chats.map((chat, index) => (
        <ConfigureAccountRow
          key={chat.chatId}
          icon={Smartphone}
          title={`Device ${index + 1}`}
          description={`Connected ${formatDate(chat.connectedAt)}`}
          action={
            <PermissionActionLink
              onClick={() => onDisconnect(chat.chatId)}
              disabled={disconnecting !== null}
            >
              {disconnecting === chat.chatId ? "Disconnecting…" : "Disconnect"}
            </PermissionActionLink>
          }
        />
      ))}
    </div>
  )
}

export function TelegramPermissionsSection() {
  return (
    <ConfigureSection title="Permissions">
      {TELEGRAM_PERMISSIONS.map((permission) => (
        <PermissionRow
          key={permission}
          icon={permission === "Receive ticket digests" ? Bell : Check}
          title={permission}
          action={<PermissionActionLink>Connected</PermissionActionLink>}
        />
      ))}
    </ConfigureSection>
  )
}

export function TelegramActionsSection({
  isConnected,
  connecting,
  disconnecting,
  atDeviceLimit,
  onConnect,
  onDisconnectAll,
}: {
  isConnected: boolean
  connecting: boolean
  disconnecting: string | "all" | null
  atDeviceLimit: boolean
  onConnect: () => void
  onDisconnectAll: () => void
}) {
  const [confirmingDisconnectAll, setConfirmingDisconnectAll] = useState(false)

  return (
    <ConfigureSection title="Actions">
      <ActionRow
        icon={Plus}
        label={connecting ? "Opening…" : isConnected ? "Add device" : "Connect Telegram"}
        onClick={onConnect}
        disabled={connecting || atDeviceLimit}
      />
      {isConnected && (
        <>
          <ActionRow
            icon={Trash2}
            label="Delete all connections"
            destructive
            onClick={() => setConfirmingDisconnectAll(true)}
            disabled={disconnecting !== null}
          />
          {confirmingDisconnectAll && (
            <div className="flex items-center justify-between gap-3 px-4 py-3.5 bg-white/[0.02]">
              <p className="text-xs text-white/55 leading-relaxed">{DISCONNECT_ALL_NOTE}</p>
              <button
                type="button"
                onClick={() => {
                  setConfirmingDisconnectAll(false)
                  onDisconnectAll()
                }}
                className="text-xs font-semibold text-red-400 hover:text-red-300 transition-colors whitespace-nowrap shrink-0"
              >
                Confirm
              </button>
            </div>
          )}
        </>
      )}
    </ConfigureSection>
  )
}
