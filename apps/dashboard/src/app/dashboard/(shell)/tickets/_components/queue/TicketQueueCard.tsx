"use client"

import { useMemo } from "react"
import Image from "next/image"
import { buildTicketListPresentationFromTicket } from "../../_lib/ticket-list-presentation"
import { getInitials, type TicketListView } from "../thread-list/constants"
import { TicketTagPill } from "../thread-list/ticket-tag-pill"
import { TicketRowActions } from "../thread-list/TicketRowActions"
import { canShowTicketRowSendAction } from "../thread-list/ticket-row-action-visibility"
import { TicketRowStatusPill } from "../thread-list/ticket-row-status-pill"
import type { OrgSettings, Ticket } from "@/types"

// The queue section header already names the tier ("Needs review", "Ready to
// send", …), so a pill that only echoes it is noise. Keep pills that carry
// extra signal — the refund flag, the untrusted-sender flag, or a tool label.
const GENERIC_STATUS_LABELS = new Set([
  "Answer needed",
  "Needs review",
  "Ready to send",
  "Drafting…",
  "Waiting on customer",
])

interface TicketQueueCardProps {
  ticket: Ticket
  activeView: TicketListView
  hasShopify: boolean
  orgSettings?: Partial<OrgSettings> | null
  isActive: boolean
  isApproving: boolean
  actionsDisabled: boolean
  onOpen: () => void
  onSend: () => void
  onReview: () => void
}

export function TicketQueueCard({
  ticket,
  activeView,
  hasShopify,
  orgSettings = null,
  isActive,
  isApproving,
  actionsDisabled,
  onOpen,
  onSend,
  onReview,
}: TicketQueueCardProps) {
  const presentation = useMemo(
    () => buildTicketListPresentationFromTicket(ticket, {
      orgSettings,
      hasShopify,
      listView: activeView,
      activeTab: activeView === "closed" ? "closed" : "open",
    }),
    [activeView, hasShopify, orgSettings, ticket],
  )

  const initials = getInitials(presentation.customerLabel)
  // The whole card opens the conversation, so a "Review" button would just
  // duplicate that. Only surface the quick-approve "Send", which is the one
  // action that isn't reachable by opening the card.
  const showSend = canShowTicketRowSendAction(presentation)
  const showStatusPill = !GENERIC_STATUS_LABELS.has(presentation.primaryStatus.label)
  const title = presentation.headline && presentation.headline !== ticket.tag
    ? presentation.headline
    : ticket.subject
  const preview = presentation.subline || ticket.preview

  return (
    <div
      className={`flex flex-col gap-3 rounded-3xl border bg-card px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)] transition-colors ${
        isActive ? "border-foreground/30" : "border-border"
      }`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-col gap-2 border-0 bg-transparent p-0 text-left [font-family:inherit]"
      >
        <div className="flex w-full items-baseline justify-between gap-4">
          <h3 className="min-w-0 flex-1 font-sans text-lg font-semibold leading-snug tracking-tight text-foreground line-clamp-2">
            {title}
          </h3>
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <Image src={ticket.logo} width={14} height={14} alt={presentation.channelName} className="size-3.5 shrink-0 object-contain opacity-55" />
            <span className="tabular-nums">{presentation.timeAgo}</span>
          </span>
        </div>

        <span className="inline-flex max-w-full items-center gap-1.5 text-[11px] font-semibold text-foreground/35">
          <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-foreground/[0.08] text-[9px] font-bold text-muted-foreground">
            {initials}
          </span>
          <span className="truncate">{presentation.customerLabel}</span>
        </span>

        <TicketTagPill
          tag={presentation.tier === "escalated" ? null : ticket.tag}
          className="w-fit"
        />
        {preview && (
          <p className="text-sm leading-relaxed text-muted-foreground line-clamp-3">{preview}</p>
        )}
      </button>

      {(showStatusPill || showSend) && (
        <div className="mt-1 flex items-center justify-between gap-2">
          {showStatusPill
            ? <TicketRowStatusPill label={presentation.primaryStatus.label} tone={presentation.primaryStatus.tone} />
            : <span aria-hidden />}
          {showSend && (
            <TicketRowActions
              presentation={presentation}
              isApproving={isApproving}
              disabled={actionsDisabled}
              onSend={onSend}
              onReview={onReview}
            />
          )}
        </div>
      )}
    </div>
  )
}
