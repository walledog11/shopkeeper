import TelegramConnectBanner from "@/app/dashboard/_components/TelegramConnectBanner"

export default function HomeTelegramNudge({ connected }: { connected: boolean }) {
  if (connected) return null

  return <TelegramConnectBanner>Get plan approvals on your phone —</TelegramConnectBanner>
}
