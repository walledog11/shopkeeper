"use client"

import { useMemo } from "react"
import { Loader2, RotateCcw } from "lucide-react"
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
import { canShowTicketRowSendAction } from "../thread-list/ticket-row-action-visibility"
import type { OrgSettings, Ticket } from "@/types"

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
  onRecover?: () => void
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
  onReview: _onReview,
  onRecover,
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
  const content = useMemo(
    () => buildTicketQueueCardContent(ticket, orgSettings),
    [orgSettings, ticket],
  )

  const isSpamView = activeView === "spam"
  const showSend = canShowTicketRowSendAction(presentation)
  const showRecover = isSpamView && !!onRecover
  const showFooter = showSend || content.isEscalationOnly || showRecover
  const spamReason = isSpamView ? ticket.filterReason?.trim() || null : null

  return (
    <NeedsYouCardShell
      className={cn(
        isActive && "border-foreground/35 shadow-[0_8px_32px_rgba(0,0,0,0.08)]",
      )}
    >
      <NeedsYouCardHeader>
        <button
          type="button"
          data-testid="ticket-queue-card-open"
          onClick={onOpen}
          className="flex w-full min-w-0 cursor-pointer border-0 bg-transparent p-0 text-left [font-family:inherit]"
        >
          <TicketCardMetaRow meta={content.meta} />
        </button>
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
          ) : null}
        </NeedsYouCardFooter>
      )}
    </NeedsYouCardShell>
  )
}
