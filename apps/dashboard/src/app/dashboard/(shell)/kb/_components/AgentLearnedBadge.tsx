import { Sparkles } from "lucide-react"

interface AgentLearnedBadgeProps {
  className?: string
}

export function AgentLearnedBadge({ className = "" }: AgentLearnedBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-800/80 ${className}`}
    >
      <Sparkles aria-hidden className="size-3 shrink-0" />
      Agent learned
    </span>
  )
}
