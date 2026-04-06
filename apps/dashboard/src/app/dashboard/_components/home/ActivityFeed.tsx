import Image from "next/image"
import { Activity } from "lucide-react"
import { Card } from "@/components/ui/card"
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
    <Card className="bg-card border-border rounded-md overflow-hidden shrink-0">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest">Activity</p>
        <Activity className="w-3 h-3 text-white/20" />
      </div>
      <div className="py-1">
        {activityEvents.map(event => (
          <div key={event.id} className="flex items-start gap-2 px-3 py-2 border-b border-white/[0.04] last:border-0">
            <div className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${
              event.type === 'new_ticket' ? 'bg-amber-400' :
              event.type === 'resolved' ? 'bg-green-400' :
              'bg-blue-400'
            }`} />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-white/60 leading-snug">
                <span className="font-medium text-white/80 truncate block">{event.customer}</span>
                <span className="text-white/35">
                  {event.type === 'new_ticket' && 'opened a ticket'}
                  {event.type === 'resolved' && 'ticket resolved'}
                  {event.type === 'message' && 'sent a message'}
                </span>
              </p>
              <div className="flex items-center gap-1 mt-0.5">
                <Image src={event.channel.logo} alt={event.channel.name} width={9} height={9} className="object-contain opacity-35" />
                <span className="text-[10px] text-white/30">{timeAgo(event.time)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
