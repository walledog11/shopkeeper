"use client"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { TicketListPresentation } from "../../_lib/ticket-list-presentation"
import { getMeaningfulTagStyle } from "./constants"
import { TicketRowStatusPill } from "./ticket-row-status-pill"
import type { Ticket } from "@/types"

interface TicketRowDesktopMetaProps {
  presentation: TicketListPresentation
  ticket: Ticket
  isSpam: boolean
  closed: boolean
  isSearchMode?: boolean
  showSlaStatus: boolean
}

export function TicketRowDesktopMeta({
  presentation,
  ticket,
  isSpam,
  closed,
  isSearchMode,
  showSlaStatus,
}: TicketRowDesktopMetaProps) {
  const secondaryTag = getMeaningfulTagStyle(ticket.tag)
  const planSnippet = ticket.hasPlan && presentation.subline.trim()
    ? presentation.subline.trim()
    : null

  const statusPill = (
    <TicketRowStatusPill
      label={presentation.primaryStatus.label}
      tone={presentation.primaryStatus.tone}
    />
  )

  if (isSpam) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
        <TicketRowStatusPill label="Spam" tone="danger" />
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
      {planSnippet ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex cursor-default">{statusPill}</span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-sm text-left leading-relaxed">
            {planSnippet}
          </TooltipContent>
        </Tooltip>
      ) : (
        statusPill
      )}

      {secondaryTag ? (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold shrink-0 ${secondaryTag.className}`}
        >
          {secondaryTag.label}
        </span>
      ) : null}

      {showSlaStatus && isSearchMode && ticket.status && !closed ? (
        <span className="text-xs text-white/25 font-medium capitalize ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
          {ticket.status}
        </span>
      ) : null}
    </div>
  )
}
