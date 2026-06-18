"use client"

import { Layers, List } from "lucide-react"
import type { TicketTriageTier } from "../../_lib/ticket-list-presentation"
import type { TicketTriageTierGroup } from "../../_lib/group-tickets-by-triage-tier"
import { TicketRow } from "../thread-list/TicketRow"
import type { TicketListView } from "../thread-list/constants"
import { TicketStackDeck } from "./TicketStackDeck"
import type { OrgSettings } from "@/types"

const TIER_ACCENT: Record<TicketTriageTier, { dot: string; label: string }> = {
  approve: { dot: "bg-emerald-500", label: "text-foreground/70" },
  review: { dot: "bg-amber-500", label: "text-foreground/70" },
  waiting: { dot: "bg-foreground/25", label: "text-foreground/45" },
  noise: { dot: "bg-foreground/15", label: "text-foreground/40" },
  closed: { dot: "bg-foreground/15", label: "text-foreground/40" },
}

interface TriageStackColumnProps {
  group: TicketTriageTierGroup
  listMode: boolean
  onToggleListMode: () => void
  activeView: TicketListView
  hasShopify: boolean
  orgSettings?: Partial<OrgSettings> | null
  activeTicketId: string | null
  approvingTicketId: string | null
  onSelectTicket: (id: string) => void
  onQuickApprove: (id: string) => void
  onReview: (id: string) => void
}

export function TriageStackColumn({
  group,
  listMode,
  onToggleListMode,
  activeView,
  hasShopify,
  orgSettings = null,
  activeTicketId,
  approvingTicketId,
  onSelectTicket,
  onQuickApprove,
  onReview,
}: TriageStackColumnProps) {
  const accent = TIER_ACCENT[group.tier]

  return (
    <section className={`flex min-w-0 flex-col ${group.collapsible ? "opacity-90" : ""}`}>
      <div className="mb-3 flex items-center justify-between gap-2 px-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`size-1.5 shrink-0 rounded-full ${accent.dot}`} aria-hidden />
          <span className={`truncate text-xs font-semibold uppercase tracking-wide ${accent.label}`}>
            {group.label}
          </span>
          <span className="text-xs font-medium tabular-nums text-foreground/35">{group.tickets.length}</span>
        </div>
        <button
          type="button"
          onClick={onToggleListMode}
          aria-label={listMode ? "Show as stack" : "Show as list"}
          className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[11px] font-semibold text-foreground/45 transition-colors hover:text-foreground/80"
        >
          {listMode ? <Layers className="size-3" aria-hidden /> : <List className="size-3" aria-hidden />}
          {listMode ? "Stack" : "List"}
        </button>
      </div>

      {listMode ? (
        <div className="custom-scrollbar max-h-[460px] divide-y divide-foreground/[0.08] overflow-y-auto rounded-2xl border border-border bg-background">
          {group.tickets.map(ticket => (
            <TicketRow
              key={ticket.id}
              activeView={activeView}
              activeTicketId={activeTicketId}
              approvingTicketId={approvingTicketId}
              hasSelection={false}
              hasShopify={hasShopify}
              isSelected={false}
              orgSettings={orgSettings}
              ticket={ticket}
              onQuickApproveFromList={onQuickApprove}
              onReviewFromList={onReview}
              onSelectTicket={onSelectTicket}
              onToggleSelect={() => {}}
            />
          ))}
        </div>
      ) : (
        <TicketStackDeck
          tickets={group.tickets}
          hasShopify={hasShopify}
          orgSettings={orgSettings}
          activeTicketId={activeTicketId}
          approvingTicketId={approvingTicketId}
          onSelectTicket={onSelectTicket}
          onQuickApprove={onQuickApprove}
          onReview={onReview}
        />
      )}
    </section>
  )
}
