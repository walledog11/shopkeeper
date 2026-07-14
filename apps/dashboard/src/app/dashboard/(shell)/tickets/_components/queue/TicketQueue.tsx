"use client"

import { useMemo, useState } from "react"
import { CheckCircle2, ChevronDown, ChevronRight } from "lucide-react"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  groupTicketsByTriageTier,
  type TicketTriageTierGroup,
} from "../../_lib/group-tickets-by-triage-tier"
import type { TicketTriageTier } from "../../_lib/ticket-list-presentation"
import { TicketRow } from "../thread-list/TicketRow"
import type { TicketListView } from "../thread-list/constants"
import { TicketQueueCard } from "./TicketQueueCard"
import type { OrgSettings, Ticket } from "@/types"

const SECTION_PREVIEW_LIMIT = 4

const TIER_DOT: Record<TicketTriageTier, string> = {
  answer: "bg-rose-500",
  review: "bg-amber-500",
  ready: "bg-emerald-500",
  working: "bg-foreground/25",
  noise: "bg-foreground/20",
  waiting_customer: "bg-foreground/20",
  closed: "bg-foreground/15",
}

interface TicketQueueProps {
  tickets: Ticket[]
  activeView: TicketListView
  agentName: string
  hasShopify: boolean
  orgSettings?: Partial<OrgSettings> | null
  activeTicketId: string | null
  approvingTicketId: string | null
  onSelectTicket: (id: string) => void
  onQuickApprove: (id: string) => void
  onReview: (id: string) => void
}

export function TicketQueue({
  tickets,
  activeView,
  agentName,
  hasShopify,
  orgSettings = null,
  activeTicketId,
  approvingTicketId,
  onSelectTicket,
  onQuickApprove,
  onReview,
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
    return <CaughtUp agentName={agentName} />
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="custom-scrollbar flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-5 py-6 md:px-6">
          {actionable.length === 0 && (
            <div className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
              <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
              You&apos;re all caught up — nothing needs you right now.
            </div>
          )}

          {actionable.map(group => (
            <QueueSection key={group.tier} group={group} {...cardCallbacks} />
          ))}

          {quiet.length > 0 && (
            <div className="flex flex-col gap-2">
              {quiet.map(group => (
                <QuietTierRow key={group.tier} group={group} {...cardCallbacks} />
              ))}
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}

interface SectionProps extends Omit<TicketQueueProps, "tickets" | "agentName"> {
  group: TicketTriageTierGroup
}

function QueueSection({
  group,
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
      <div className="flex items-center gap-2 px-1">
        <span className={`size-2 rounded-full ${TIER_DOT[group.tier]}`} aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">{group.label}</h2>
        <span className="text-sm tabular-nums text-faint">{group.tickets.length}</span>
      </div>

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

function QuietTierRow({
  group,
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

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card/40">
      <button
        type="button"
        onClick={() => setExpanded(value => !value)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left transition-colors hover:bg-foreground/[0.03]"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className={`size-1.5 rounded-full ${TIER_DOT[group.tier]}`} aria-hidden />
          <span className="truncate text-sm font-medium text-muted-foreground">{group.label}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-xs tabular-nums text-faint">
          {group.tickets.length}
          {expanded
            ? <ChevronDown className="size-3.5" aria-hidden />
            : <ChevronRight className="size-3.5" aria-hidden />}
        </span>
      </button>

      {expanded && (
        <div className="divide-y divide-foreground/[0.06] border-t border-border bg-background">
          {group.tickets.map(ticket => (
            <TicketRow
              key={ticket.id}
              activeView={activeView}
              activeTicketId={activeTicketId}
              approvingTicketId={approvingTicketId}
              context={{ hasShopify }}
              selection={{ hasSelection: false, isSelected: false }}
              orgSettings={orgSettings}
              ticket={ticket}
              onQuickApproveFromList={onQuickApprove}
              onReviewFromList={onReview}
              onSelectTicket={onSelectTicket}
              onToggleSelect={() => {}}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CaughtUp({ agentName }: { agentName: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <span className="flex size-11 items-center justify-center rounded-full border border-border bg-foreground/[0.04]">
        <CheckCircle2 className="size-5 text-faint" />
      </span>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">You&apos;re all caught up</h2>
        <p className="max-w-[230px] text-sm text-muted-foreground">
          {agentName} will flag anything that needs your eye.
        </p>
      </div>
    </div>
  )
}
