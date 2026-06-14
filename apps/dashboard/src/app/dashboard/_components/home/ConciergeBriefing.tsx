"use client"

import Link from "next/link"
import { Card } from "@/components/ui/card"
import { useAgentPanel } from "@/app/dashboard/_components/agent-panel/AgentPanelContext"
import type { WalkthroughItem } from "@/lib/agent/panel"
import { BriefingNarrativeInline } from "@/app/dashboard/_components/agent-panel/AgentPanelBriefing"
import {
  buildBriefingNarrativeSegments,
  buildBriefingOpsNotes,
  type BriefingOpsNote,
} from "@/lib/agent/panel-briefing"

interface Props {
  greeting: string
  userName: string
  agentName: string
  walkthroughItems: WalkthroughItem[]
  walkthroughCount: number
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
  agentName,
  walkthroughItems,
  walkthroughCount,
  needsYouCount,
  overnightClearedCount,
  briefingChannels,
  refundsPending,
  vipsInQueue,
  ordersToShip,
}: Props) {
  const { open } = useAgentPanel()
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

          <div className="flex items-center gap-3 mt-4 flex-wrap">
            <button
              type="button"
              onClick={() =>
                open(
                  walkthroughCount > 0
                    ? { source: "home", walkthrough: { items: walkthroughItems } }
                    : { source: "home" },
                )
              }
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-foreground text-background text-xs font-semibold hover:bg-foreground/90 transition-colors"
            >
              {walkthroughCount > 0 ? `Walk me through ${walkthroughCount}` : `Ask ${agentName}`}
            </button>
            <Link
              href="/dashboard/tickets"
              className="text-xs font-medium text-foreground/45 hover:text-foreground/70 transition-colors"
            >
              Browse all tickets
            </Link>
          </div>
        </div>
      </div>
    </Card>
  )
}
