import Image from "next/image"
import { Activity } from "lucide-react"
import { Card } from "@/components/ui/card"
import { timeAgo } from "@/lib/format/date"

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
  return (
    <Card className="bg-card border-border rounded-md overflow-hidden noise-texture h-full">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <p className="text-xs text-white/40">Activity</p>
        <Activity className="w-3 h-3 text-white/40" />
      </div>
      <div className="py-1">
        {activityEvents.length === 0 && (
          <div className="flex items-center justify-center px-3 py-6">
            <p className="text-xs text-white/25">No activity in the last 24h</p>
          </div>
        )}
        {activityEvents.map(event => (
          <div key={event.id} className="flex items-start gap-2 px-3 py-2 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.03] transition-colors">
            <div className={`w-2 h-2 rounded-full mt-1 shrink-0 ${
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
