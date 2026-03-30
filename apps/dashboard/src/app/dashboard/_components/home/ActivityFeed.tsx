import Image from "next/image"
import { Activity } from "lucide-react"
import { timeAgo } from "@/lib/utils"

export interface ActivityEvent {
  id: string
  type: 'new_ticket' | 'resolved' | 'message'
  customer: string
  channel: { name: string; logo: string }
  time: string
}

interface Props {
  activityEvents: ActivityEvent[]
}

export default function ActivityFeed({ activityEvents }: Props) {
  if (activityEvents.length === 0) return null

  return (
    <div className="bg-white rounded-md shadow-md overflow-hidden shrink-0">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Activity</p>
        <Activity className="w-3 h-3 text-slate-300" />
      </div>
      <div className="py-1">
        {activityEvents.map(event => (
          <div key={event.id} className="flex items-start gap-2 px-3 py-2 border-b border-slate-50 last:border-0">
            <div className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${
              event.type === 'new_ticket' ? 'bg-amber-400' :
              event.type === 'resolved' ? 'bg-green-400' :
              'bg-blue-400'
            }`} />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-slate-700 leading-snug">
                <span className="font-medium truncate block">{event.customer}</span>
                <span className="text-slate-400">
                  {event.type === 'new_ticket' && 'opened a ticket'}
                  {event.type === 'resolved' && 'ticket resolved'}
                  {event.type === 'message' && 'sent a message'}
                </span>
              </p>
              <div className="flex items-center gap-1 mt-0.5">
                <Image src={event.channel.logo} alt={event.channel.name} width={9} height={9} className="object-contain opacity-50" />
                <span className="text-[10px] text-slate-400">{timeAgo(event.time)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
