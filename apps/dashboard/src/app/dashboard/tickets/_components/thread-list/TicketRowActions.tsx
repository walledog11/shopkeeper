import { Loader2 } from "lucide-react"
import type { TicketListPresentation } from "../../_lib/ticket-list-presentation"

interface TicketRowActionsProps {
  presentation: TicketListPresentation
  isApproving: boolean
  disabled?: boolean
  onSend: () => void
  onReview: () => void
  className?: string
}

export function canShowTicketRowSendAction(presentation: TicketListPresentation): boolean {
  return presentation.tier === "approve" && presentation.action?.handler === "quick-approve"
}

export function canShowTicketRowReviewAction(presentation: TicketListPresentation): boolean {
  return presentation.tier === "review" && presentation.action?.handler === "focus-plan"
}

export function hasTicketRowListAction(presentation: TicketListPresentation): boolean {
  return canShowTicketRowSendAction(presentation) || canShowTicketRowReviewAction(presentation)
}

export function TicketRowActions({
  presentation,
  isApproving,
  disabled = false,
  onSend,
  onReview,
  className = "",
}: TicketRowActionsProps) {
  const canSend = canShowTicketRowSendAction(presentation)
  const canReview = canShowTicketRowReviewAction(presentation)

  if (!canSend && !canReview) return null

  if (canSend) {
    return (
      <button
        type="button"
        data-testid="ticket-row-send"
        disabled={disabled || isApproving}
        onClick={event => {
          event.stopPropagation()
          onSend()
        }}
        className={`inline-flex items-center justify-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold bg-emerald-500 text-white shadow-sm hover:bg-emerald-400 disabled:opacity-50 transition-colors ${className}`}
      >
        {isApproving ? <Loader2 aria-hidden className="size-3 animate-spin" /> : null}
        {isApproving ? "Sending" : "Send"}
      </button>
    )
  }

  return (
    <button
      type="button"
      data-testid="ticket-row-review"
      disabled={disabled}
      onClick={event => {
        event.stopPropagation()
        onReview()
      }}
      className={`inline-flex items-center justify-center rounded-full px-3 py-1.5 text-xs font-semibold bg-white/10 text-white/80 hover:bg-white/15 hover:text-white transition-colors ${className}`}
    >
      Review
    </button>
  )
}
