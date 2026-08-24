import type { ComponentType } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  CheckCircle2,
  MessageSquare,
  NotebookText,
  PackageCheck,
  ThumbsDown,
  Wrench,
} from "lucide-react"
import { correctReplyHref } from "@/lib/agent/action-log-display"
import type { ActionLogEntry } from "@/types"
import {
  toOutputBlock,
  type ReviewIconKey,
  type ReviewItemTone,
} from "./quality-panel-model"

export const REVIEW_ICONS: Record<ReviewIconKey, ComponentType<{ className?: string }>> = {
  alert: AlertTriangle,
  check: CheckCircle2,
  message: MessageSquare,
  note: NotebookText,
  store: PackageCheck,
  tool: Wrench,
}

export const REVIEW_TONE_CLASS: Record<
  ReviewItemTone,
  { icon: string; badge: string; border: string }
> = {
  attention: {
    icon: "border-amber-500/20 bg-amber-500/10 text-amber-700",
    badge: "border-amber-500/20 bg-amber-500/10 text-amber-800",
    border: "hover:border-amber-500/25",
  },
  auto: {
    icon: "border-sky-500/20 bg-sky-500/10 text-sky-700",
    badge: "border-sky-500/20 bg-sky-500/10 text-sky-800",
    border: "hover:border-sky-500/25",
  },
  store: {
    icon: "border-amber-500/20 bg-amber-500/10 text-amber-700",
    badge: "border-amber-500/20 bg-amber-500/10 text-amber-800",
    border: "hover:border-amber-500/25",
  },
  approved: {
    icon: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700",
    badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-800",
    border: "hover:border-emerald-500/25",
  },
  error: {
    icon: "border-red-500/20 bg-red-500/10 text-red-700",
    badge: "border-red-500/20 bg-red-500/10 text-red-800",
    border: "hover:border-red-500/25",
  },
  note: {
    icon: "border-foreground/[0.10] bg-foreground/[0.05] text-muted-foreground",
    badge: "border-foreground/[0.08] bg-foreground/[0.04] text-muted-foreground",
    border: "hover:border-foreground/[0.16]",
  },
}

export function sourceLinkLabel(href: string | null): string | null {
  if (!href) return null
  if (href.startsWith("/dashboard/orders")) return "Open order"
  if (href.startsWith("/dashboard/tickets")) return "Open ticket"
  if (href.includes("openAgent=1")) return "Open agent session"
  return "Open source"
}

export function ReviewCorrectionLink({
  entry,
  compact = false,
}: {
  entry: ActionLogEntry
  compact?: boolean
}) {
  const correctionHref = correctReplyHref(entry)
  const hasReplyOutput = entry.actions.some(
    (action, index) => toOutputBlock(action, index)?.tone === "reply",
  )
  if (!hasReplyOutput || correctionHref === null) return null

  return (
    <Link
      href={correctionHref}
      className={`inline-flex items-center gap-1 font-semibold text-faint transition-colors hover:text-amber-800 ${compact ? "text-[11px]" : "text-xs"}`}
    >
      <ThumbsDown className="size-3" />
      Sounds off
    </Link>
  )
}
