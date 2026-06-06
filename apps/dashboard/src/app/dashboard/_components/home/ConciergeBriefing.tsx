"use client"

import Link from "next/link"
import { Sparkles } from "lucide-react"
import { Card } from "@/components/ui/card"
import { GridPattern } from "@/components/ui/grid-pattern"
import { formatClockTime } from "@/lib/format/date"

interface Props {
  greeting: string
  userName: string
  agentName: string
  needsYouCount: number
  overnightClearedCount: number
  briefingChannels: string[]
  timeSavedHours: number
  repliesSent: number
}

function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`
  return `${hours.toFixed(1)}h`
}

function formatChannelList(channels: string[]): string {
  if (channels.length === 0) return ""
  if (channels.length === 1) return channels[0]
  if (channels.length === 2) return `${channels[0]} and ${channels[1]}`
  return `${channels.slice(0, -1).join(', ')}, and ${channels[channels.length - 1]}`
}

export default function ConciergeBriefing({
  greeting,
  userName,
  agentName,
  needsYouCount,
  overnightClearedCount,
  briefingChannels,
  timeSavedHours,
  repliesSent,
}: Props) {
  const channelText = formatChannelList(briefingChannels)
  const now = formatClockTime(Date.now(), { hour: 'numeric' })

  let narrative: React.ReactNode
  if (overnightClearedCount === 0 && needsYouCount === 0) {
    narrative = (
      <>You&apos;re all caught up , no new tickets since yesterday. {agentName} is on duty for anything that comes in.</>
    )
  } else if (overnightClearedCount === 0) {
    narrative = (
      <>
        Nothing auto-resolved since yesterday, but{' '}
        <span className="px-1.5 py-0.5 rounded bg-blue-400/15 text-blue-300 font-semibold tabular-nums">{needsYouCount}</span>
        {' '}ticket{needsYouCount === 1 ? '' : 's'} need your eye.
      </>
    )
  } else {
    narrative = (
      <>
        Overnight I cleared{' '}
        <span className="px-1.5 py-0.5 rounded bg-green-400/15 text-blue-300 font-semibold tabular-nums">{overnightClearedCount}</span>
        {' '}ticket{overnightClearedCount === 1 ? '' : 's'}
        {channelText && <> across {channelText}</>}.
        {needsYouCount > 0 && (
          <>
            {' '}
            <span className="px-1.5 py-0.5 rounded bg-blue-400/15 text-blue-300 font-semibold tabular-nums">{needsYouCount}</span>
            {' '}need{needsYouCount === 1 ? 's' : ''} your eye.
          </>
        )}
      </>
    )
  }

  return (
    <Card className="relative bg-card border-border rounded-xl overflow-hidden noise-texture">
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(180deg,rgba(255,255,255,0.045),transparent_46%)]" />
      <div className="absolute -left-8 top-1/2 -translate-y-1/2 w-[320px] h-[200px] rounded-full opacity-[0.06] pointer-events-none" />
      <div className="absolute -right-20 -top-24 size-56 rounded-full bg-blue-400/[0.10] blur-3xl pointer-events-none" />
      <div className="absolute right-0 top-0 h-px w-2/3 bg-gradient-to-l from-blue-300/35 to-transparent pointer-events-none" />
      <GridPattern
        width={34}
        height={34}
        x={-1}
        y={-1}
        strokeDasharray="4 3"
        squares={[
          [10, 1],
          [11, 2],
          [8, 3],
          [12, 4],
        ]}
        className="stroke-blue-300/[0.13] fill-blue-300/[0.055] [mask-image:radial-gradient(340px_circle_at_85%_18%,white,transparent)]"
      />

      <div className="relative px-6 pt-5 pb-5">


        <h1 className="text-2xl font-bold tracking-tight text-white leading-tight">
          {greeting}, {userName}.
        </h1>
        <p className="mt-2 text-sm text-white/55 leading-relaxed max-w-2xl">
          {narrative}
        </p>

        <div className="flex items-center gap-2 mt-4 flex-wrap">
          {needsYouCount > 0 && (
            <a
              href="#needs-you"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-green-400 hover:bg-green-300 text-black text-xs font-semibold transition-colors"
            >
              <span>▾</span> Review {needsYouCount}
            </a>
          )}
          <Link
            href="/dashboard/tickets"
            className="px-3.5 py-1.5 rounded-md border border-white/[0.10] hover:border-white/[0.20] hover:bg-white/[0.04] text-xs font-semibold text-white/80 transition-colors"
          >
            Open inbox
          </Link>
          <Link
            href="/dashboard/agent"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold text-white/60 hover:text-white/90 transition-colors"
          >
            <Sparkles className="size-3" /> Ask {agentName}
          </Link>
        </div>
      </div>
    </Card>
  )
}
