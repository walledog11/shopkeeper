"use client"

import { AGENT_DISPLAY_NAME } from "@shopkeeper/agent/settings"
import { CheckCircle2, ChevronLeft } from "lucide-react"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  QUEUE_QUIET_TIER_PANEL,
  type QuietQueueTier,
} from "../../_lib/group-tickets-by-triage-tier"
import { SenderReviewList } from "./SenderReviewList"
import { TicketQueueCard } from "./TicketQueueCard"
import type { TicketListView } from "../thread-list/constants"
import type { OrgSettings, Ticket } from "@/types"

export type TicketFilteredQueueMode = QuietQueueTier | "spam"

interface TicketFilteredQueueProps {
  tickets: Ticket[]
  mode: TicketFilteredQueueMode
  activeView: TicketListView
  hasShopify: boolean
  orgSettings?: Partial<OrgSettings> | null
  activeTicketId: string | null
  approvingTicketId: string | null
  onBack: () => void
  onSelectTicket: (id: string) => void
  onQuickApprove: (id: string) => void
  onReview: (id: string) => void
  onRecover?: (id: string) => void
  onMarkAsSpam?: (id: string) => void
}

const SPAM_PANEL = {
  title: "Spam",
  description: "Recover anything that shouldn't be here.",
}

function panelForMode(mode: TicketFilteredQueueMode) {
  return mode === "spam" ? SPAM_PANEL : QUEUE_QUIET_TIER_PANEL[mode]
}

export function TicketFilteredQueue({
  tickets,
  mode,
  activeView,
  hasShopify,
  orgSettings = null,
  activeTicketId,
  approvingTicketId,
  onBack,
  onSelectTicket,
  onQuickApprove,
  onReview,
  onRecover,
  onMarkAsSpam,
}: TicketFilteredQueueProps) {
  const panel = panelForMode(mode)
  const description = mode === "spam"
    ? panel.description
    : panel.description(AGENT_DISPLAY_NAME)

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex w-full flex-col gap-6">
        <header data-testid="filtered-queue-header" className="flex flex-col gap-2 px-1">
          <button
            type="button"
            onClick={onBack}
            className="-ml-1 inline-flex w-fit items-center gap-1 rounded-lg px-1 py-0.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-4" aria-hidden />
            Inbox
          </button>

          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-baseline gap-2">
              <h1 className="text-base font-semibold text-foreground sm:text-lg">{panel.title}</h1>
              {tickets.length > 0 ? (
                <span className="text-sm tabular-nums text-faint">{tickets.length}</span>
              ) : null}
            </div>
            <p className="max-w-md text-sm leading-snug text-muted-foreground">
              {description}
            </p>
          </div>
        </header>

        {tickets.length === 0 ? (
          <FilteredQueueEmpty mode={mode} onBack={onBack} />
        ) : mode === "noise" && onMarkAsSpam && onRecover ? (
          <SenderReviewList
            tickets={tickets}
            activeTicketId={activeTicketId}
            actionsDisabled={approvingTicketId !== null}
            onTrust={onRecover}
            onSpam={onMarkAsSpam}
            onOpen={onSelectTicket}
          />
        ) : (
          <div data-testid="filtered-queue-list" className="flex flex-col gap-3">
            {tickets.map(ticket => (
              <TicketQueueCard
                key={ticket.id}
                ticket={ticket}
                activeView={activeView}
                hasShopify={hasShopify}
                orgSettings={orgSettings}
                isActive={activeTicketId === ticket.id}
                isApproving={approvingTicketId === ticket.id}
                actionsDisabled={approvingTicketId !== null && approvingTicketId !== ticket.id}
                onOpen={() => onSelectTicket(ticket.id)}
                onSend={() => onQuickApprove(ticket.id)}
                onReview={() => onReview(ticket.id)}
                onRecover={mode === "spam" && onRecover ? () => onRecover(ticket.id) : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}

function FilteredQueueEmpty({
  mode,
  onBack,
}: {
  mode: TicketFilteredQueueMode
  onBack: () => void
}) {
  const panel = panelForMode(mode)
  const emptyCopy = mode === "spam"
    ? "No spam messages right now."
    : mode === "working"
      ? `${AGENT_DISPLAY_NAME} has finished drafting replies in this list.`
      : "No unknown senders right now."

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <span className="flex size-11 items-center justify-center rounded-full border border-border bg-foreground/[0.04]">
        <CheckCircle2 className="size-5 text-faint" />
      </span>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">Nothing here</h2>
        <p className="max-w-[260px] text-sm text-muted-foreground">{emptyCopy}</p>
      </div>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        Back to inbox
        <ChevronLeft className="size-4 rotate-180" aria-hidden />
      </button>
      <span className="sr-only">{panel.title}</span>
    </div>
  )
}
