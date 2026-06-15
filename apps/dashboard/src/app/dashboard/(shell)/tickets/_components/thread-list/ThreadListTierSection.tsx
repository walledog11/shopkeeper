"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/ui/cn"
import type { TicketTriageTier } from "../../_lib/ticket-list-presentation"

interface ThreadListTierSectionProps {
  tier: TicketTriageTier
  label: string
  count: number
  collapsible?: boolean
  defaultExpanded?: boolean
  children: React.ReactNode
}

export function ThreadListTierSection({
  tier,
  label,
  count,
  collapsible = false,
  defaultExpanded = true,
  children,
}: ThreadListTierSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const headerContent = (
    <>
      <span className="truncate">
        {label}
        {" "}
        <span className="text-white/30">({count})</span>
      </span>
      {collapsible ? (
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-white/30 transition-transform duration-200",
            expanded && "rotate-180",
          )}
        />
      ) : null}
    </>
  )

  const headerClassName = cn(
    "w-full flex items-center justify-between gap-2 px-4 py-2.5",
    "border-t border-white/[0.08] bg-white/[0.02]",
    "text-[11px] font-semibold uppercase tracking-wide text-white/45",
  )

  return (
    <section data-testid="tickets-tier-section" data-tier={tier}>
      {collapsible ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(current => !current)}
          className={cn(headerClassName, "text-left transition-colors hover:text-white/60")}
        >
          {headerContent}
        </button>
      ) : (
        <div className={headerClassName}>
          {headerContent}
        </div>
      )}

      {expanded ? (
        <div className="divide-y divide-white/[0.1]">
          {children}
        </div>
      ) : null}
    </section>
  )
}
