import type { TicketListPresentation } from "../../_lib/ticket-list-presentation"

export function canShowTicketRowSendAction(presentation: TicketListPresentation): boolean {
  return presentation.tier === "ready" && presentation.action?.handler === "quick-approve"
}

export function canShowTicketRowReviewAction(presentation: TicketListPresentation): boolean {
  return presentation.tier === "review" && presentation.action?.handler === "focus-plan"
}

export function hasTicketRowListAction(presentation: TicketListPresentation): boolean {
  return canShowTicketRowSendAction(presentation) || canShowTicketRowReviewAction(presentation)
}
