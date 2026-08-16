"use client"

import Link from "next/link"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/ui/cn"
import { useAgentPanel } from "@/app/dashboard/_components/agent-panel/AgentPanelContext"
import type { WalkthroughItem } from "@/lib/agent/panel"
import { BriefingNarrativeInline } from "@/app/dashboard/_components/agent-panel/AgentPanelBriefing"
import {
  buildBriefingNarrativeSegments,
  buildBriefingOpsNotes,
  type BriefingOpsNote,
} from "@/lib/agent/panel-briefing"
import {
  NeedsYouCardFooter,
  NeedsYouCardShell,
  NeedsYouPrimaryButton,
} from "./needs-you-card-ui"
import { needsYouSecondaryButtonClassName } from "./needs-you-card-styles"

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
  isLoading?: boolean
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
  isLoading = false,
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
    <NeedsYouCardShell variant="briefing">
      <div className="px-5 py-4 sm:px-6">
        <h1 className="font-sans text-xl font-semibold leading-tight tracking-tight text-foreground sm:text-2xl">
          {greeting}{userName ? <>, <span className="italic text-muted-foreground">{userName}</span></> : ""}.
        </h1>
        {isLoading ? (
          <div aria-busy="true" aria-label="Loading briefing" className="mt-1.5 max-w-2xl space-y-2">
            <Skeleton className="h-4 w-full rounded-full bg-foreground/[0.07]" />
            <Skeleton className="h-4 w-[62%] rounded-full bg-foreground/[0.07]" />
          </div>
        ) : (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed tracking-[-0.01em] text-muted-foreground">
            <BriefingNarrativeInline segments={narrativeSegments} />
            {opsNotes.map(note => (
              <span key={note.id}> <OpsNoteLink note={note} />.</span>
            ))}
          </p>
        )}
      </div>

      <NeedsYouCardFooter>
        <div className="flex gap-2">
          {isLoading ? (
            <>
              <Skeleton className="h-12 min-w-0 flex-1 rounded-2xl bg-foreground/[0.08]" />
              <Skeleton className="h-12 min-w-0 flex-1 rounded-2xl bg-foreground/[0.05]" />
            </>
          ) : (
            <>
              <NeedsYouPrimaryButton
                className="min-w-0 flex-1 text-sm sm:text-base"
                onClick={() =>
                  open(
                    walkthroughCount > 0
                      ? { source: "home", walkthrough: { items: walkthroughItems } }
                      : { source: "home" },
                  )
                }
              >
                {walkthroughCount > 0 ? (
                  <>
                    <span className="sm:hidden">{walkthroughCount} to review</span>
                    <span className="hidden sm:inline">
                      Walk me through {walkthroughCount} ticket{walkthroughCount === 1 ? "" : "s"}
                    </span>
                  </>
                ) : (
                  `Ask ${agentName}`
                )}
              </NeedsYouPrimaryButton>
              <Link
                href="/dashboard/tickets"
                className={cn(needsYouSecondaryButtonClassName, "min-w-0 flex-1 text-sm sm:text-base")}
              >
                <span className="sm:hidden">All tickets</span>
                <span className="hidden sm:inline">Browse all tickets</span>
              </Link>
            </>
          )}
        </div>
      </NeedsYouCardFooter>
    </NeedsYouCardShell>
  )
}
