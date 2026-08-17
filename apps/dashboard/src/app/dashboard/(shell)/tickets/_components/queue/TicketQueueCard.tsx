"use client"

import { useMemo } from "react"
import { Ban, CheckSquare, Loader2, RotateCcw, Square } from "lucide-react"
import { cn } from "@/lib/ui/cn"
import {
  NeedsYouBubble,
  NeedsYouCardBody,
  NeedsYouCardFooter,
  NeedsYouCardHeader,
  NeedsYouCardShell,
  NeedsYouEscalationCallout,
  NeedsYouPrimaryButton,
  TicketCardMetaRow,
} from "@/app/dashboard/_components/home/needs-you-card-ui"
import { needsYouSecondaryButtonClassName } from "@/app/dashboard/_components/home/needs-you-card-styles"
import { buildTicketListPresentationFromTicket } from "../../_lib/ticket-list-presentation"
import { buildTicketQueueCardContent } from "../../_lib/ticket-queue-card-content"
import type { TicketListView } from "../thread-list/constants"
import {
  canShowTicketRowReviewAction,
  canShowTicketRowSendAction,
} from "../thread-list/ticket-row-action-visibility"
import type { OrgSettings, Ticket } from "@/types"

type TicketQueueCardVariant = "queue" | "browse"

interface TicketQueueCardSelection {
  hasSelection: boolean
  isSelected: boolean
  onToggleSelect: () => void
}

interface TicketQueueCardProps {
  ticket: Ticket
  activeView: TicketListView
  hasShopify: boolean
  orgSettings?: Partial<OrgSettings> | null
  isActive: boolean
  isApproving: boolean
  actionsDisabled: boolean
  variant?: TicketQueueCardVariant
  selection?: TicketQueueCardSelection
  onOpen: () => void
  onSend: () => void
  onReview: () => void
  onRecover?: () => void
  onMarkAsSpam?: () => void
}

export function TicketQueueCard({
  ticket,
  activeView,
  hasShopify,
  orgSettings = null,
  isActive,
  isApproving,
  actionsDisabled,
  variant = "queue",
  selection,
  onOpen,
  onSend,
  onReview,
  onRecover,
  onMarkAsSpam,
}: TicketQueueCardProps) {
  const isBrowse = variant === "browse"

  const presentation = useMemo(
    () => buildTicketListPresentationFromTicket(ticket, {
      orgSettings,
      hasShopify,
      listView: activeView,
      activeTab: activeView === "closed" ? "closed" : "open",
    }),
    [activeView, hasShopify, orgSettings, ticket],
  )
  const content = useMemo(
    () => buildTicketQueueCardContent(ticket, orgSettings),
    [orgSettings, ticket],
  )

  const isSpamView = activeView === "spam"
  const showSend = canShowTicketRowSendAction(presentation)
  const showReview = canShowTicketRowReviewAction(presentation)
  const showRecover = isSpamView && !!onRecover
  const showFooter = showSend || showReview || content.isEscalationOnly || showRecover
  const spamReason = isSpamView ? ticket.filterReason?.trim() || null : null
  const showMarkAsSpam = isBrowse
    && !!onMarkAsSpam
    && ticket.status !== "closed"
    && ticket.filterStatus !== "filtered"
    && !selection?.hasSelection

  const openButton = (
    <button
      type="button"
      data-testid="ticket-queue-card-open"
      onClick={onOpen}
      className="flex w-full min-w-0 cursor-pointer border-0 bg-transparent p-0 text-left [font-family:inherit]"
    >
      <TicketCardMetaRow meta={content.meta} />
    </button>
  )

  return (
    <NeedsYouCardShell
      className={cn(
        "group/card",
        isActive && "border-foreground/35 shadow-[0_8px_32px_rgba(0,0,0,0.08)]",
        selection?.isSelected && "border-foreground/25 bg-foreground/[0.02]",
      )}
    >
      <NeedsYouCardHeader className={cn(showMarkAsSpam && "pr-10 sm:pr-12")}>
        {selection ? (
          <div className="flex min-w-0 items-start gap-2">
            <button
              type="button"
              onClick={event => {
                event.stopPropagation()
                selection.onToggleSelect()
              }}
              className={cn(
                "mt-1.5 hidden shrink-0 transition-opacity md:inline-flex",
                selection.hasSelection || selection.isSelected
                  ? "opacity-100"
                  : "opacity-0 group-hover/card:opacity-100",
              )}
              aria-label={selection.isSelected ? "Deselect conversation" : "Select conversation"}
            >
              {selection.isSelected
                ? <CheckSquare className="size-4 text-strong" />
                : <Square className="size-4 text-faint" />
              }
            </button>
            {openButton}
          </div>
        ) : (
          openButton
        )}

        {showMarkAsSpam && (
          <button
            type="button"
            onClick={event => {
              event.stopPropagation()
              onMarkAsSpam?.()
            }}
            title="Mark as spam"
            className="absolute right-4 top-3 text-muted-foreground opacity-0 transition-opacity hover:text-red-600 group-hover/card:opacity-100"
          >
            <Ban className="size-3.5" />
          </button>
        )}
      </NeedsYouCardHeader>

      <NeedsYouCardBody>
        {content.customerMessage && (
          <NeedsYouBubble tone="customer">
            {content.customerMessage}
          </NeedsYouBubble>
        )}

        <div className="flex flex-col gap-3">
          {spamReason ? (
            <p className="rounded-2xl border border-border/80 bg-muted/40 px-4 py-3 text-sm leading-relaxed text-muted-foreground">
              {spamReason}
            </p>
          ) : content.isEscalationOnly ? (
            <NeedsYouEscalationCallout reason={content.escalationReason} />
          ) : (
            content.bubbles.map(bubble => (
              <NeedsYouBubble key={bubble.key} tone={bubble.tone} flush>
                {bubble.text}
              </NeedsYouBubble>
            ))
          )}
        </div>
      </NeedsYouCardBody>

      {showFooter && (
        <NeedsYouCardFooter>
          {showRecover ? (
            <button
              type="button"
              data-testid="ticket-row-recover"
              disabled={actionsDisabled}
              onClick={onRecover}
              className={cn(needsYouSecondaryButtonClassName, "gap-2")}
            >
              <RotateCcw className="size-4" aria-hidden />
              Recover to inbox
            </button>
          ) : content.isEscalationOnly ? (
            <NeedsYouPrimaryButton onClick={onOpen}>
              Handle in ticket
            </NeedsYouPrimaryButton>
          ) : showSend ? (
            <NeedsYouPrimaryButton
              data-testid="ticket-row-send"
              disabled={actionsDisabled || isApproving}
              onClick={onSend}
            >
              {isApproving && <Loader2 aria-hidden className="size-4 animate-spin" />}
              {isApproving ? "Sending" : "Send"}
            </NeedsYouPrimaryButton>
          ) : showReview ? (
            <button
              type="button"
              data-testid="ticket-row-review"
              disabled={actionsDisabled}
              onClick={onReview}
              className={needsYouSecondaryButtonClassName}
            >
              Review
            </button>
          ) : null}
        </NeedsYouCardFooter>
      )}
    </NeedsYouCardShell>
  )
}
