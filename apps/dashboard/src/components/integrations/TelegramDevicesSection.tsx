"use client"

import { Smartphone } from "lucide-react"
import { formatDate } from "@/lib/format/date"
import { ConfigureAccountRow } from "./ConfigureAccountRow"
import { PermissionActionLink } from "./PermissionRow"

interface TelegramChat {
  chatId: string
  connectedAt: string
  displayLabel: string | null
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
          title={chat.displayLabel ?? `Device ${index + 1}`}
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
