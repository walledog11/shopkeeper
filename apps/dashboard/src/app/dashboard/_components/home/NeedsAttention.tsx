import Image from "next/image"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { timeAgo, getCustomerName } from "@/lib/utils"
import { getChannelInfo } from "@/lib/channels"
import type { Thread } from "@/types"

interface Props {
  needsAttention: Thread[]
  openCount: number
}

export default function NeedsAttention({ needsAttention, openCount }: Props) {
  if (needsAttention.length === 0) return null

  return (
    <Card className="bg-card border-border rounded-md shrink-0">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest">Needs Attention</p>
        <span className="text-[10px] font-semibold text-white/30 bg-white/[0.07] px-1.5 py-0.5 rounded-full">
          {openCount}
        </span>
      </div>
      <div className="p-2 space-y-1.5">
        {needsAttention.map(thread => {
          const channel = getChannelInfo(thread.channelType)
          const customer = getCustomerName(thread.customer)
          const lastMsg = thread.messages[0]
          return (
            <Link
              key={thread.id}
              href={`/dashboard/tickets?thread=${thread.id}`}
              className="flex items-start gap-2 p-2 rounded-md border border-white/[0.07] hover:border-white/[0.12] hover:bg-white/[0.04] transition-all"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5 gap-1">
                  <span className="text-[11px] font-semibold text-white/80 truncate">{customer}</span>
                  <span className="text-[10px] text-white/30 shrink-0">{timeAgo(thread.updatedAt)}</span>
                </div>
                <p className="text-[11px] text-white/40 truncate">
                  {lastMsg?.contentText || "No messages yet"}
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Image src={channel.logo} alt={channel.name} width={9} height={9} className="object-contain opacity-40" />
                  <span className="text-[10px] text-white/30">{channel.name}</span>
                </div>
              </div>
            </Link>
          )
        })}
        {openCount > 4 && (
          <Link
            href="/dashboard/tickets"
            className="block w-full py-1.5 text-[11px] font-semibold text-center text-white/30 hover:text-white/70 hover:bg-white/[0.04] rounded-md transition-colors"
          >
            View all {openCount} →
          </Link>
        )}
      </div>
    </Card>
  )
}
