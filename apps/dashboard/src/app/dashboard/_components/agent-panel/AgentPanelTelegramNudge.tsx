"use client"

import useSWR from "swr"
import { fetcher } from "@/lib/api/fetcher"
import TelegramConnectBanner from "@/app/dashboard/_components/TelegramConnectBanner"

interface Props {
  agentName: string
  enabled: boolean
  showConnectBanner?: boolean
}

export default function AgentPanelTelegramNudge({
  agentName,
  enabled,
  showConnectBanner = true,
}: Props) {
  const { data } = useSWR<{ connected: boolean }>(
    enabled ? "/api/integrations/telegram" : null,
    fetcher,
    { revalidateOnFocus: false },
  )

  const connected = data?.connected ?? false

  if (!enabled || data === undefined) return null

  if (!connected && showConnectBanner) {
    return (
      <TelegramConnectBanner className="shrink-0 mx-5 md:mx-6">
        Message {agentName} from your phone —
      </TelegramConnectBanner>
    )
  }

  if (connected) {
    return (
      <p className="shrink-0 text-center text-[11px] text-muted-foreground px-5 pb-1">
        Also on Telegram when you&apos;re away from the desk.
      </p>
    )
  }

  return null
}
