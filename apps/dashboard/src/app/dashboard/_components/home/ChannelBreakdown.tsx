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

export default function ChannelBreakdown({ channelBreakdown, openCount }: Props) {
  if (channelBreakdown.length === 0) return null

  return (
    <Card className="bg-card border-border rounded-md overflow-hidden shrink-0">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest">Open by channel</p>
        <BarChart2 className="w-3 h-3 text-white/20" />
      </div>
      <div className="px-3 py-2.5 space-y-2">
        {channelBreakdown.map(({ name, logo, count }) => (
          <div key={name} className="flex items-center gap-2">
            <Image src={logo} alt={name} width={12} height={12} className="object-contain shrink-0 opacity-40" />
            <span className="text-[11px] text-white/50 truncate flex-1 min-w-0">{name}</span>
            <div className="w-12 h-1.5 bg-white/[0.07] rounded-full overflow-hidden shrink-0">
              <div
                className="h-full bg-yellow-400 rounded-full transition-all duration-500"
                style={{ width: `${(count / openCount) * 100}%` }}
              />
            </div>
            <span className="text-[11px] font-semibold text-white/40 w-3 text-right shrink-0">{count}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}
