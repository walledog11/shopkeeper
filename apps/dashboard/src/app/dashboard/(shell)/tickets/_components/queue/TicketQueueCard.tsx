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
      <div className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-foreground/[0.05] text-[13px] font-semibold text-strong">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-strong">{presentation.customerLabel}</span>
            <span className="shrink-0 text-xs tabular-nums text-faint">{presentation.timeAgo}</span>
          </div>
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-faint">
            <Image src={ticket.logo} width={12} height={12} alt="" className="size-3 shrink-0 object-contain opacity-55" />
            {presentation.channelName}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-col gap-2 border-0 bg-transparent p-0 text-left [font-family:inherit]"
      >
        <TicketTagPill tag={ticket.tag} className="w-fit" />
        <h3 className="font-sans text-lg font-semibold leading-snug tracking-tight text-foreground line-clamp-2">
          {title}
        </h3>
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
