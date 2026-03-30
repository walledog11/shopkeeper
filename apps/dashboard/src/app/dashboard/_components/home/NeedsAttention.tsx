import Image from "next/image"
import Link from "next/link"
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
    <div className="bg-white rounded-md shadow-md shrink-0">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Needs Attention</p>
        <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">
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
              className="flex items-start gap-2 p-2 rounded-md border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-all block"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5 gap-1">
                  <span className="text-[11px] font-semibold text-slate-900 truncate">{customer}</span>
                  <span className="text-[10px] text-slate-400 shrink-0">{timeAgo(thread.updatedAt)}</span>
                </div>
                <p className="text-[11px] text-slate-500 truncate">
                  {lastMsg?.contentText || "No messages yet"}
                </p>
                <div className="flex items-center gap-1 mt-0.5">
                  <Image src={channel.logo} alt={channel.name} width={9} height={9} className="object-contain opacity-60" />
                  <span className="text-[10px] text-slate-400">{channel.name}</span>
                </div>
              </div>
            </Link>
          )
        })}
        {openCount > 4 && (
          <Link
            href="/dashboard/tickets"
            className="block w-full py-1.5 text-[11px] font-semibold text-center text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-colors"
          >
            View all {openCount} →
          </Link>
        )}
      </div>
    </div>
  )
}
