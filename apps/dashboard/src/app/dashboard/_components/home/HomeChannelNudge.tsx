import { AtSign, MessageSquare } from "lucide-react"
import ChannelConnectBanner from "@/app/dashboard/_components/ChannelConnectBanner"

interface Props {
  hasPhoneBound: boolean
  hasEmail: boolean
  hasInstagram: boolean
  instagramAvailable: boolean
}

/**
 * One nudge slot for the highest-value channel the merchant is still missing.
 * Customer channels come first — they are what feeds the inbox. Telegram is only
 * offered when no operator channel is bound at all, since iMessage covers the
 * same job and a second phone channel is pure redundancy.
 */
export default function HomeChannelNudge({
  hasPhoneBound,
  hasEmail,
  hasInstagram,
  instagramAvailable,
}: Props) {
  if (!hasEmail) {
    return (
      <ChannelConnectBanner
        href="/dashboard/integrations#email"
        actionLabel="Set up email"
        icon={AtSign}
      >
        Customer emails aren&apos;t reaching your inbox yet —
      </ChannelConnectBanner>
    )
  }

  if (instagramAvailable && !hasInstagram) {
    return (
      <ChannelConnectBanner
        href="/dashboard/integrations#instagram"
        actionLabel="Connect Instagram"
        icon={MessageSquare}
      >
        Answer Instagram DMs from the same inbox —
      </ChannelConnectBanner>
    )
  }

  if (!hasPhoneBound) {
    return <ChannelConnectBanner>Get plan approvals on your phone —</ChannelConnectBanner>
  }

  return null
}
