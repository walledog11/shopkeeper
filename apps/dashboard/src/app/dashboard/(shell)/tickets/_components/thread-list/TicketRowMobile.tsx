import Image from "next/image"
import type { TicketListPresentation } from "../../_lib/ticket-list-presentation"
import { getInitials } from "./constants"
import { TicketRowStatusPill } from "./ticket-row-status-pill"
import type { Ticket } from "@/types"

interface TicketRowMobileProps {
  ticket: Ticket
  presentation: TicketListPresentation
  longWait?: boolean
  browseMode?: boolean
}

export function TicketRowMobile({
  ticket,
  presentation,
  longWait = false,
  browseMode = false,
}: TicketRowMobileProps) {
  const initials = getInitials(presentation.customerLabel)
  const meta = [presentation.customerLabel, presentation.channelName, presentation.timeAgo]
    .filter(Boolean)
    .join(" · ")

  return (
    <>
      <div className="relative size-9 shrink-0">
        <div className="flex size-9 items-center justify-center rounded-xl border border-border bg-foreground/[0.05] text-[13px] font-semibold text-strong">
          {initials}
        </div>
        <div className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-md border border-border bg-card">
          <Image src={ticket.logo} width={9} height={9} alt={ticket.platform} className="object-contain opacity-70" />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-strong truncate leading-snug">
          {presentation.headline}
        </p>

        <p className={`text-xs truncate mt-0.5 ${longWait ? "text-muted-foreground font-medium" : "text-faint"}`}>
          {meta}
        </p>

        {presentation.subline ? (
          <p className={`text-xs line-clamp-2 mt-1 leading-relaxed ${browseMode ? "text-faint" : "text-muted-foreground"}`}>
            {presentation.subline}
          </p>
        ) : null}

        {!browseMode ? (
          <div className="flex items-center gap-2 mt-2 min-w-0">
            <TicketRowStatusPill
              label={presentation.primaryStatus.label}
              tone={presentation.primaryStatus.tone}
            />
          </div>
        ) : null}
      </div>
    </>
  )
}
