"use client"

import Link from "next/link"
import useSWR from "swr"
import { MessageCircle } from "lucide-react"
import { fetcher } from "@/lib/api/fetcher"

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
      <div className="shrink-0 mx-5 md:mx-6 px-3 py-2 rounded-lg bg-blue-600/10 border border-blue-600/20 text-xs text-blue-800/90">
        <MessageCircle className="inline size-3 mr-1.5 -mt-px" aria-hidden />
        Message {agentName} from your phone —{" "}
        <Link
          href="/dashboard/integrations#telegram"
          className="font-semibold underline decoration-blue-700/30 underline-offset-2 hover:decoration-blue-700/60"
        >
          Connect Telegram
        </Link>
      </div>
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
