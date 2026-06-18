import { getMeaningfulTagStyle } from "./constants"

interface TicketTagPillProps {
  tag: string | null | undefined
  className?: string
}

export function TicketTagPill({ tag, className }: TicketTagPillProps) {
  const style = getMeaningfulTagStyle(tag)
  if (!style) return null
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${style.className}${className ? ` ${className}` : ""}`}>
      {style.label}
    </span>
  )
}
