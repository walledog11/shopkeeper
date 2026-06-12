"use client"

import Link from "next/link"
import { Bot } from "lucide-react"
import { AUTONOMY_TIERS } from "@/lib/agent/autonomy-tiers"
import type { AutonomyTier } from "@shopkeeper/agent/settings"
import { cn } from "@/lib/ui/cn"

const TIER_TINTS: Record<AutonomyTier, string> = {
  watch: "border-yellow-300/25 bg-yellow-300/10 text-yellow-200 hover:bg-yellow-300/[0.14]",
  guarded: "border-sky-300/25 bg-sky-300/10 text-sky-200 hover:bg-sky-300/[0.14]",
  trusted: "border-emerald-300/25 bg-emerald-300/10 text-emerald-200 hover:bg-emerald-300/[0.14]",
  broad: "border-violet-300/25 bg-violet-300/10 text-violet-200 hover:bg-violet-300/[0.14]",
  full: "border-rose-300/25 bg-rose-300/10 text-rose-200 hover:bg-rose-300/[0.14]",
}

interface Props {
  tier: AutonomyTier
  compact?: boolean
  className?: string
}

export default function AutonomyPill({ tier, compact = false, className }: Props) {
  const label = AUTONOMY_TIERS.find(option => option.id === tier)?.label ?? tier

  return (
    <Link
      href="/dashboard/settings?tab=agent#autonomy"
      aria-label={`Trust level: ${label}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold transition-colors",
        "min-w-0 max-w-full",
        compact ? "px-2.5 py-1 text-xs" : "px-2.5 py-1.5 text-xs",
        TIER_TINTS[tier],
        className,
      )}
    >
      <Bot className={cn("shrink-0", compact ? "size-3.5" : "size-4")} />
      <span className="truncate">Trust level: {label}</span>
    </Link>
  )
}
