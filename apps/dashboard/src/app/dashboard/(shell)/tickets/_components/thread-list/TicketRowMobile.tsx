import Image from "next/image"
import type { TicketListPresentation } from "../../_lib/ticket-list-presentation"
import { getAvatarGradient, getInitials } from "./constants"
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
  const gradient = getAvatarGradient(presentation.customerLabel)
  const initials = getInitials(presentation.customerLabel)
  const meta = [presentation.customerLabel, presentation.channelName, presentation.timeAgo]
    .filter(Boolean)
    .join(" · ")

  return (
    <>
      <div className="relative size-9 shrink-0">
        <div className={`size-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-[14px] font-bold shadow-sm`}>
          {initials}
        </div>
        <div className="absolute -bottom-0.5 -right-0.5 size-4.5 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center">
          <Image src={ticket.logo} width={9} height={9} alt={ticket.platform} className="object-contain brightness-0 invert opacity-80" />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground/90 truncate leading-snug">
          {presentation.headline}
        </p>

        <p className={`text-xs truncate mt-0.5 ${longWait ? "text-foreground/55 font-medium" : "text-foreground/40"}`}>
          {meta}
        </p>

        {presentation.subline ? (
          <p className={`text-xs line-clamp-2 mt-1 leading-relaxed ${browseMode ? "text-foreground/40" : "text-foreground/50"}`}>
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
