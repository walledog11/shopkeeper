import type { TicketListPresentationStatusTone } from "../../_lib/ticket-list-presentation"

const TONE_CLASS: Record<TicketListPresentationStatusTone, string> = {
  send: "bg-emerald-500 text-white shadow-sm",
  caution: "bg-amber-500/15 text-amber-400",
  neutral: "bg-white/10 text-white/55",
  danger: "bg-red-500/10 text-red-400",
}

interface TicketRowStatusPillProps {
  label: string
  tone: TicketListPresentationStatusTone
}

export function TicketRowStatusPill({ label, tone }: TicketRowStatusPillProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold shrink-0 ${TONE_CLASS[tone]}`}>
      {label}
    </span>
  )
}
