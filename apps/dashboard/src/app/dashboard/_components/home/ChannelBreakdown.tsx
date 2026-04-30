import Image from "next/image"
import { BarChart2 } from "lucide-react"
import { Card } from "@/components/ui/card"

interface ChannelStat {
  name: string
  logo: string
  count: number
}

interface Props {
  channelBreakdown: ChannelStat[]
  openCount: number
}

function getBarColor(name: string): string {
  const lower = name.toLowerCase()
  if (lower.includes("email")) return "bg-blue-400"
  if (lower.includes("instagram") || lower.includes("ig")) return "bg-pink-500"
  if (lower.includes("shopify")) return "bg-green-500"
  if (lower.includes("sms") || lower.includes("whatsapp")) return "bg-purple-400"
  if (lower.includes("tiktok")) return "bg-cyan-400"
  return "bg-amber-400"
}

export default function ChannelBreakdown({ channelBreakdown, openCount }: Props) {
  return (
    <Card className="bg-card border-border rounded-md overflow-hidden shrink-0 noise-texture">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <p className="text-xs text-white/40">Open by channel</p>
        <BarChart2 className="w-3 h-3 text-white/20" />
      </div>
      {channelBreakdown.length === 0 ? (
        <div className="flex items-center justify-center px-3 py-6">
          <p className="text-xs text-white/25">No open tickets</p>
        </div>
      ) : (
      <div className="px-3 py-2.5 space-y-2">
        {channelBreakdown.map(({ name, logo, count }) => (
          <div key={name} className="flex items-center gap-2">
            <Image src={logo} alt={name} width={12} height={12} className="object-contain shrink-0 opacity-60" />
            <span className="text-[11px] text-white/50 truncate flex-1 min-w-0">{name}</span>
            <div className="w-12 h-2 bg-white/[0.07] rounded-full overflow-hidden shrink-0">
              <div
                className={`h-full ${getBarColor(name)} rounded-full transition-all duration-500`}
                style={{ width: `${(count / openCount) * 100}%` }}
              />
            </div>
            <span className="text-[11px] font-semibold text-white/40 w-3 text-right shrink-0">{count}</span>
          </div>
        ))}
      </div>
      )}
    </Card>
  )
}
