"use client"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { TicketListPresentation } from "../../_lib/ticket-list-presentation"
import { TicketRowStatusPill } from "./ticket-row-status-pill"
import { TicketTagPill } from "./ticket-tag-pill"
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

      <TicketTagPill tag={ticket.tag} className="shrink-0" />

      {showSlaStatus && isSearchMode && ticket.status && !closed ? (
        <span className="text-xs text-faint font-medium capitalize ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
          {ticket.status}
        </span>
      ) : null}
    </div>
  )
}
