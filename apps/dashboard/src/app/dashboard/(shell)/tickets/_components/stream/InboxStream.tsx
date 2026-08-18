"use client"

import Link from "next/link"
import { useMemo } from "react"
import {
  buildInboxRow,
  INBOX_SECTION_ORDER,
  type InboxSection,
} from "../../_lib/inbox-row"
import { InboxTicketCard } from "./InboxTicketCard"
import {
  InboxExternalLead,
  InboxNeedsReviewLead,
  InboxSpamSection,
  InboxStreamSection,
  InboxWaitingLead,
} from "./InboxStreamChrome"
import type { OrgSettings, Ticket } from "@/types"

export interface InboxStreamProps {
  tickets: Ticket[]
  spamTickets: Ticket[]
  orgSettings?: Partial<OrgSettings> | null
  approvingTicketId: string | null
  isSearchMode: boolean
  hasMore: boolean
  isLoadingMore: boolean
  hasAnyConversation: boolean
  onOpen: (id: string) => void
  onSend: (id: string) => void
  onReview: (id: string) => void
  onTrust: (id: string) => void
  onNotReal: (id: string) => void
  onRecover: (id: string) => void
  onAnswered: () => void
  onLoadMore: () => void
}

type BuiltEntry = { ticket: Ticket; row: ReturnType<typeof buildInboxRow> }

function groupBySection(entries: BuiltEntry[]): Record<InboxSection, BuiltEntry[]> {
  const grouped: Record<InboxSection, BuiltEntry[]> = {
    needs_review: [],
    waiting_on_customer: [],
    external: [],
    spam: [],
  }

  for (const entry of entries) {
    grouped[entry.row.section].push(entry)
  }

  return grouped
}

export function InboxStream({
  tickets,
  spamTickets,
  orgSettings = null,
  approvingTicketId,
  isSearchMode,
  hasMore,
  isLoadingMore,
  hasAnyConversation,
  onOpen,
  onSend,
  onReview,
  onTrust,
  onNotReal,
  onRecover,
  onAnswered,
  onLoadMore,
}: InboxStreamProps) {
  const grouped = useMemo(() => {
    const built = tickets.map(ticket => ({ ticket, row: buildInboxRow(ticket, { orgSettings }) }))
    const spam = spamTickets.map(ticket => ({ ticket, row: buildInboxRow(ticket, { orgSettings }) }))

    if (isSearchMode) {
      return {
        needs_review: built,
        waiting_on_customer: [] as typeof built,
        external: [] as typeof built,
        spam: [] as typeof spam,
      }
    }

    const stream = groupBySection(built)
    return {
      ...stream,
      spam,
    }
  }, [isSearchMode, orgSettings, spamTickets, tickets])

  const totalCount = INBOX_SECTION_ORDER.reduce((sum, section) => sum + grouped[section].length, 0)

  if (totalCount === 0) {
    return (
      <div className="rounded-3xl border border-border bg-card px-5 py-8 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)]">
        <p className="text-center text-sm text-muted-foreground">
          {isSearchMode ? (
            "Nothing matches that."
          ) : hasAnyConversation ? (
            "Nothing here yet."
          ) : (
            <>
              No conversations yet.{" "}
              <Link href="/dashboard/integrations" className="font-semibold text-foreground underline underline-offset-4">
                Connect a channel
              </Link>{" "}
              and they will land here.
            </>
          )}
        </p>
      </div>
    )
  }

  const cardActions = (ticketId: string) => ({
    onOpen: () => onOpen(ticketId),
    onSend: () => onSend(ticketId),
    onReview: () => onReview(ticketId),
    onTrust: () => onTrust(ticketId),
    onNotReal: () => onNotReal(ticketId),
    onRecover: () => onRecover(ticketId),
    onAnswered,
  })

  const renderCard = (
    entry: BuiltEntry,
    variant: "default" | "trust" | "spam" = "default",
  ) => (
    <InboxTicketCard
      key={entry.ticket.id}
      ticket={entry.ticket}
      row={entry.row}
      variant={variant}
      isSending={approvingTicketId === entry.ticket.id}
      actionsDisabled={approvingTicketId !== null && approvingTicketId !== entry.ticket.id}
      actions={cardActions(entry.ticket.id)}
    />
  )

  const showWaitingFold = grouped.needs_review.length > 0 && grouped.waiting_on_customer.length > 0
  const showExternalFold = (grouped.needs_review.length > 0 || grouped.waiting_on_customer.length > 0)
    && grouped.external.length > 0

  return (
    <div className="flex flex-col gap-5 sm:gap-6" data-testid="tickets-list">
      <InboxStreamSection
        count={grouped.needs_review.length}
        testId="inbox-section-needs-review"
        lead={<InboxNeedsReviewLead count={grouped.needs_review.length} />}
      >
        {grouped.needs_review.map(entry => renderCard(entry))}
      </InboxStreamSection>

      <InboxStreamSection
        count={grouped.waiting_on_customer.length}
        testId="inbox-section-waiting"
        foldBefore={showWaitingFold}
        lead={<InboxWaitingLead count={grouped.waiting_on_customer.length} />}
      >
        {grouped.waiting_on_customer.map(entry => renderCard(entry))}
      </InboxStreamSection>

      {!isSearchMode && (
        <InboxStreamSection
          count={grouped.external.length}
          testId="inbox-section-external"
          foldBefore={showExternalFold}
          lead={<InboxExternalLead count={grouped.external.length} />}
        >
          {grouped.external.map(entry => renderCard(entry, "trust"))}
        </InboxStreamSection>
      )}

      {!isSearchMode && (
        <InboxSpamSection count={grouped.spam.length}>
          {grouped.spam.map(entry => renderCard(entry, "spam"))}
        </InboxSpamSection>
      )}

      {!isSearchMode && hasMore && (
        <button
          type="button"
          data-testid="inbox-load-more"
          onClick={onLoadMore}
          disabled={isLoadingMore}
          className="w-full rounded-2xl border border-border py-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
        >
          {isLoadingMore ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  )
}
