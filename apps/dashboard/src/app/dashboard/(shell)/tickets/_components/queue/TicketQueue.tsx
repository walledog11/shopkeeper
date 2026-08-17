"use client"

import { useMemo, useState } from "react"
import { AGENT_DISPLAY_NAME } from "@shopkeeper/agent/settings"
import { CheckCircle2, ChevronRight, Loader2, ShieldAlert } from "lucide-react"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  groupTicketsByTriageTier,
  QUEUE_QUIET_TIER_PANEL,
  type QuietQueueTier,
  type TicketTriageTierGroup,
} from "../../_lib/group-tickets-by-triage-tier"
import type { TicketListView } from "../thread-list/constants"
import { TicketQueueCard } from "./TicketQueueCard"
import type { OrgSettings, Ticket } from "@/types"

const SECTION_PREVIEW_LIMIT = 4

interface TicketQueueProps {
  tickets: Ticket[]
  activeView: TicketListView
  hasShopify: boolean
  orgSettings?: Partial<OrgSettings> | null
  activeTicketId: string | null
  approvingTicketId: string | null
  onSelectTicket: (id: string) => void
  onQuickApprove: (id: string) => void
  onReview: (id: string) => void
  onViewAll: () => void
  onBrowseQuietTier: (tier: QuietQueueTier) => void
}

export function TicketQueue({
  tickets,
  activeView,
  hasShopify,
  orgSettings = null,
  activeTicketId,
  approvingTicketId,
  onSelectTicket,
  onQuickApprove,
  onReview,
  onViewAll,
  onBrowseQuietTier,
}: TicketQueueProps) {
  const groups = useMemo(
    () => groupTicketsByTriageTier(tickets, {
      orgSettings,
      hasShopify,
      isMobile: false,
      listView: activeView,
      activeTab: activeView === "closed" ? "closed" : "open",
    }),
    [activeView, tickets, orgSettings, hasShopify],
  )

  const actionable = groups.filter(group => !group.collapsible)
  const quiet = groups.filter(group => group.collapsible)

  const cardCallbacks = {
    activeView,
    hasShopify,
    orgSettings,
    activeTicketId,
    approvingTicketId,
    onSelectTicket,
    onQuickApprove,
    onReview,
  }

  if (groups.length === 0) {
    return (
      <div className="flex w-full flex-col">
        <CaughtUp onViewAll={onViewAll} />
      </div>
    )
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex w-full flex-col gap-8">
          {actionable.length === 0 && quiet.length > 0 && (
            <p className="px-1 text-sm text-muted-foreground">You&apos;re all caught up.</p>
          )}

          {actionable.map(group => (
            <QueueSection
              key={group.tier}
              group={group}
              showHeading={actionable.length > 1}
              {...cardCallbacks}
            />
          ))}

          {quiet.length > 0 && (
            <QueueMorePanel quiet={quiet} onBrowseQuietTier={onBrowseQuietTier} />
          )}
      </div>
    </TooltipProvider>
  )
}

interface SectionProps extends Omit<TicketQueueProps, "tickets" | "onViewAll" | "onBrowseQuietTier"> {
  group: TicketTriageTierGroup
  showHeading?: boolean
}

function QueueSection({
  group,
  showHeading = true,
  activeView,
  hasShopify,
  orgSettings = null,
  activeTicketId,
  approvingTicketId,
  onSelectTicket,
  onQuickApprove,
  onReview,
}: SectionProps) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? group.tickets : group.tickets.slice(0, SECTION_PREVIEW_LIMIT)
  const hidden = group.tickets.length - visible.length

  return (
    <section className="flex flex-col gap-3">
      {showHeading && (
        <div className="flex items-baseline gap-2 px-1">
          <h2 className="text-sm font-semibold text-foreground">{group.label}</h2>
          <span className="text-sm tabular-nums text-faint">{group.tickets.length}</span>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {visible.map(ticket => (
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
          />
        ))}
      </div>

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="self-start px-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Show {hidden} more
        </button>
      )}
    </section>
  )
}

function QueueMorePanel({
  quiet,
  onBrowseQuietTier,
}: {
  quiet: TicketTriageTierGroup[]
  onBrowseQuietTier: (tier: QuietQueueTier) => void
}) {
  return (
    <section
      data-testid="ticket-queue-more"
      className="flex flex-col gap-3"
    >
      <div className="flex items-baseline gap-2 px-1">
        <h2 className="text-sm font-semibold text-foreground">More in your inbox</h2>
      </div>

      <div className={quiet.length > 1 ? "grid grid-cols-1 gap-3 sm:grid-cols-2" : "grid grid-cols-1 gap-3"}>
        {quiet.map(group => {
          const tier = group.tier as QuietQueueTier
          const panel = QUEUE_QUIET_TIER_PANEL[tier]
          const needsAttention = tier === "noise"

          return (
            <button
              key={group.tier}
              type="button"
              onClick={() => onBrowseQuietTier(tier)}
              className="flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-card p-3.5 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)] transition-colors hover:bg-foreground/[0.02]"
            >
              <span
                className={`flex size-9 shrink-0 items-center justify-center rounded-lg border ${
                  needsAttention
                    ? "border-amber-600/20 bg-amber-600/[0.08] text-amber-800"
                    : "border-border bg-foreground/[0.04] text-muted-foreground"
                }`}
              >
                {needsAttention
                  ? <ShieldAlert className="size-4" aria-hidden />
                  : <Loader2 className="size-4" aria-hidden />}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-foreground">{panel.title}</span>
                <span className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">
                  {panel.description(AGENT_DISPLAY_NAME)}
                </span>
              </span>

              <span className="flex shrink-0 items-center gap-1 text-xs tabular-nums text-faint">
                {group.tickets.length}
                <ChevronRight className="size-3.5" aria-hidden />
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function CaughtUp({ onViewAll }: { onViewAll: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <span className="flex size-11 items-center justify-center rounded-full border border-border bg-foreground/[0.04]">
        <CheckCircle2 className="size-5 text-faint" />
      </span>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">You&apos;re all caught up</h2>
        <p className="max-w-[230px] text-sm text-muted-foreground">
          {AGENT_DISPLAY_NAME} will flag anything that needs your eye.
        </p>
      </div>
      <button
        type="button"
        onClick={onViewAll}
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        All conversations
        <ChevronRight className="size-4" aria-hidden />
      </button>
    </div>
  )
}
