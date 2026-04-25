"use client"

import Link from "next/link"
import { Sparkles } from "lucide-react"
import { Card } from "@/components/ui/card"

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
  const now = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

  let narrative: React.ReactNode
  if (overnightClearedCount === 0 && needsYouCount === 0) {
    narrative = (
      <>You&apos;re all caught up — no new tickets since yesterday. {agentName} is on duty for anything that comes in.</>
    )
  } else if (overnightClearedCount === 0) {
    narrative = (
      <>
        Nothing auto-resolved since yesterday, but{' '}
        <span className="px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-300 font-semibold tabular-nums">{needsYouCount}</span>
        {' '}ticket{needsYouCount === 1 ? '' : 's'} need your eye.
      </>
    )
  } else {
    narrative = (
      <>
        Overnight I cleared{' '}
        <span className="px-1.5 py-0.5 rounded bg-green-400/15 text-green-300 font-semibold tabular-nums">{overnightClearedCount}</span>
        {' '}ticket{overnightClearedCount === 1 ? '' : 's'}
        {channelText && <> across {channelText}</>}.
        {needsYouCount > 0 && (
          <>
            {' '}
            <span className="px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-300 font-semibold tabular-nums">{needsYouCount}</span>
            {' '}need{needsYouCount === 1 ? 's' : ''} your eye.
          </>
        )}
      </>
    )
  }

  return (
    <Card className="relative bg-card border-border rounded-xl overflow-hidden noise-texture">
      <div className="absolute -left-8 top-1/2 -translate-y-1/2 w-[320px] h-[200px] rounded-full opacity-[0.05] pointer-events-none" style={{ background: "radial-gradient(ellipse at center, #4ade80 0%, transparent 70%)" }} />

      <div className="relative px-6 pt-5 pb-5">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-green-400/15 border border-green-400/25 flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-green-400" />
            </div>
            <span className="text-[11px] uppercase tracking-wider font-semibold text-white/45">
              Daily briefing
            </span>
            <span className="text-white/15">·</span>
            <span className="text-[11px] text-white/35 tabular-nums">{now}</span>
          </div>
        </div>

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
            <Sparkles className="w-3 h-3" /> Ask {agentName}
          </Link>
        </div>
      </div>
    </Card>
  )
}
