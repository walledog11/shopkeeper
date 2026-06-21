"use client"

import { StackDeck } from "@/app/dashboard/_components/stack/StackDeck"
import { TicketStackCard } from "./TicketStackCard"
import type { TicketListView } from "../thread-list/constants"
import type { OrgSettings, Ticket } from "@/types"

interface TicketStackDeckProps {
  tickets: Ticket[]
  activeView: TicketListView
  hasShopify: boolean
  orgSettings?: Partial<OrgSettings> | null
  activeTicketId: string | null
  approvingTicketId: string | null
  onSelectTicket: (id: string) => void
  onQuickApprove: (id: string) => void
  onReview: (id: string) => void
}

export function TicketStackDeck({
  tickets,
  activeView,
  hasShopify,
  orgSettings = null,
  activeTicketId,
  approvingTicketId,
  onSelectTicket,
  onQuickApprove,
  onReview,
}: TicketStackDeckProps) {
  const cardFor = (ticket: Ticket, isPeek: boolean) => {
    const cardIsActive = !isPeek && activeTicketId === ticket.id

    return (
    <TicketStackCard
      ticket={ticket}
      activeView={activeView}
      hasShopify={hasShopify}
      orgSettings={orgSettings}
      isActive={cardIsActive}
      isApproving={!isPeek && approvingTicketId === ticket.id}
      actionsDisabled={approvingTicketId !== null && approvingTicketId !== ticket.id}
      onOpen={() => onSelectTicket(ticket.id)}
      onSend={() => onQuickApprove(ticket.id)}
      onReview={() => onReview(ticket.id)}
    />
    )
  }

  return (
    <StackDeck
      items={tickets}
      className="flex flex-col gap-2.5 pt-2.5"
      getId={(ticket) => ticket.id}
      activeId={activeTicketId}
      isDraggable={(ticket) => activeTicketId !== ticket.id}
      disableControlsWhenNotDraggable
      labels={{ previous: "Previous ticket", next: "Next ticket" }}
      controls="count"
      peekShellClassName="h-full w-full rounded-3xl border border-border bg-card shadow-sm box-border"
      renderCard={(ticket, context) => cardFor(ticket, context.isPeek)}
      renderPeekCard={(ticket) => cardFor(ticket, true)}
    />
  )
}
