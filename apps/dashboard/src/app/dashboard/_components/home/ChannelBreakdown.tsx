import Image from "next/image"
import { BarChart2 } from "lucide-react"

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
    <div className="bg-white rounded-md shadow-md overflow-hidden shrink-0">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Open by channel</p>
        <BarChart2 className="w-3 h-3 text-slate-300" />
      </div>
      <div className="px-3 py-2.5 space-y-2">
        {channelBreakdown.map(({ name, logo, count }) => (
          <div key={name} className="flex items-center gap-2">
            <Image src={logo} alt={name} width={12} height={12} className="object-contain shrink-0 opacity-70" />
            <span className="text-[11px] text-slate-600 truncate flex-1 min-w-0">{name}</span>
            <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden shrink-0">
              <div
                className="h-full bg-teal-500 rounded-full transition-all duration-500"
                style={{ width: `${(count / openCount) * 100}%` }}
              />
            </div>
            <span className="text-[11px] font-semibold text-slate-500 w-3 text-right shrink-0">{count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
