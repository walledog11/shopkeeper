"use client"

import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { ActionRow } from "./ActionRow"
import { ConfigureSection } from "./ConfigureSection"

const DISCONNECT_ALL_NOTE = "Linked devices will stop receiving digests and won't be able to approve replies."

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
            <div className="flex items-center justify-between gap-3 px-4 py-3.5 bg-foreground/[0.02]">
              <p className="text-xs text-foreground/55 leading-relaxed">{DISCONNECT_ALL_NOTE}</p>
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
