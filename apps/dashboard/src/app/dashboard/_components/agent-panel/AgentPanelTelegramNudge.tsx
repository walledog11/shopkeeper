"use client"

import { useOperatorChannels } from "@/hooks/useOperatorChannels"
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
  const { anyBound, isLoading } = useOperatorChannels(enabled)

  if (!enabled || isLoading) return null

  if (!anyBound && showConnectBanner) {
    return (
      <TelegramConnectBanner className="shrink-0 mx-5 md:mx-6">
        Message {agentName} from your phone —
      </TelegramConnectBanner>
    )
  }

  if (anyBound) {
    return (
      <p className="shrink-0 text-center text-[11px] text-muted-foreground px-5 pb-1">
        Also on your phone when you&apos;re away from the desk.
      </p>
    )
  }

  return null
}
