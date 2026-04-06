"use client"

import Image from "next/image"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { getChannelInfo } from "@/lib/channels"

interface ChannelItem {
  channel: string
  count: number
}

interface ChannelBreakdownProps {
  byChannel: ChannelItem[]
  maxChannel: number
}

export function ChannelBreakdown({ byChannel, maxChannel }: ChannelBreakdownProps) {
  if (byChannel.length === 0) return null

  return (
    <Card className="gap-6">
      <CardHeader>
        <CardTitle className="text-sm">Tickets by Channel</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-6">
          {byChannel.map(item => {
            const info = getChannelInfo(item.channel as 'email' | 'ig_dm' | 'tiktok')
            return (
              <div key={item.channel} className="flex flex-col items-center gap-2 flex-1 max-w-[120px]">
                <span className="text-sm font-bold text-foreground">{item.count}</span>
                <div className="w-full bg-muted rounded-md overflow-hidden" style={{ height: 120 }}>
                  <div
                    title={`${item.count} ticket${item.count !== 1 ? 's' : ''}`}
                    className="w-full bg-primary hover:opacity-80 rounded-md transition-all duration-700 cursor-default"
                    style={{ height: `${(item.count / maxChannel) * 120}px`, marginTop: `${120 - (item.count / maxChannel) * 120}px` }}
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <Image src={info.logo} alt={info.name} width={14} height={14} className="object-contain brightness-0 invert" />
                  <span className="text-xs text-muted-foreground font-medium">{info.name}</span>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
