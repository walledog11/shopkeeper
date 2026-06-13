"use client"

import Link from "next/link"
import { MessageCircle } from "lucide-react"
import { Card } from "@/components/ui/card"
import { BriefingNarrativeInline } from "@/app/dashboard/_components/agent-panel/AgentPanelBriefing"
import {
  buildBriefingNarrativeSegments,
  buildBriefingOpsNotes,
  type BriefingOpsNote,
} from "@/lib/agent/panel-briefing"

interface Props {
  greeting: string
  userName: string
  hasTelegramBound: boolean
  telegramBotUsername: string | null
  needsYouCount: number
  overnightClearedCount: number
  briefingChannels: string[]
  refundsPending: number
  vipsInQueue: number
  ordersToShip: number | null
}

const OPS_LINK_CLASS = "underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground/60 transition-colors"

const OPS_NOTE_LINKS: Record<BriefingOpsNote["id"], { href: string }> = {
  refunds: { href: "/dashboard/tickets?tag=Returns" },
  vips: { href: "/dashboard/tickets" },
  orders: { href: "/dashboard/orders" },
}

function OpsNoteLink({ note }: { note: BriefingOpsNote }) {
  const { href } = OPS_NOTE_LINKS[note.id]
  const [countText, ...rest] = note.text.split(" ")
  return (
    <Link href={href} className={OPS_LINK_CLASS}>
      <strong className="font-semibold text-foreground tabular-nums">{countText}</strong>
      {' '}
      {rest.join(" ")}
    </Link>
  )
}

export default function ConciergeBriefing({
  greeting,
  userName,
  hasTelegramBound,
  telegramBotUsername,
  needsYouCount,
  overnightClearedCount,
  briefingChannels,
  refundsPending,
  vipsInQueue,
  ordersToShip,
}: Props) {
  const briefingInput = {
    needsYouCount,
    overnightClearedCount,
    briefingChannels,
    refundsPending,
    vipsInQueue,
    ordersToShip,
  }
  const narrativeSegments = buildBriefingNarrativeSegments(briefingInput)
  const opsNotes = buildBriefingOpsNotes(briefingInput)

  return (
    <Card className="bg-card border-border rounded-2xl">
      <div className="flex items-start gap-3.5 px-6 pt-5 pb-5">
        <div className="min-w-0 flex-1">
          <h1 className="font-sans text-[27px] font-semibold leading-tight tracking-[-0.02em] text-foreground">
            {greeting}, <span className="italic text-[#9c9285]">{userName}</span>.
          </h1>
          <p className="mt-1.5 text-sm text-foreground/60 leading-relaxed tracking-[-0.01em] max-w-2xl">
            <BriefingNarrativeInline segments={narrativeSegments} />
            {opsNotes.map(note => (
              <span key={note.id}> <OpsNoteLink note={note} />.</span>
            ))}
          </p>

          <div className="flex items-center gap-2 mt-4 flex-wrap">
            {needsYouCount > 0 && (
              <a
                href="#needs-you"
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-amber-600 hover:bg-amber-700 text-primary-foreground text-xs font-semibold transition-colors"
              >
                Review {needsYouCount}
              </a>
            )}
            <Link
              href="/dashboard/tickets"
              className="px-4 py-1.5 rounded-full border border-border hover:bg-foreground/[0.04] text-xs font-semibold text-foreground/75 transition-colors"
            >
              Open inbox
            </Link>
            {hasTelegramBound && telegramBotUsername ? (
              <a
                href={`https://t.me/${telegramBotUsername}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-blue-600/10 hover:bg-blue-600/20 text-xs font-semibold text-blue-700 transition-colors"
              >
                <MessageCircle className="size-3" /> Message on Telegram
              </a>
            ) : (
              <Link
                href="/dashboard/integrations#telegram"
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-blue-600/10 hover:bg-blue-600/20 text-xs font-semibold text-blue-700 transition-colors"
              >
                <MessageCircle className="size-3" /> Connect Telegram
              </Link>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}
