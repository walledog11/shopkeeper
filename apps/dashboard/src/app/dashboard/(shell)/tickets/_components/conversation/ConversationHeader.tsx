"use client"

import { ArrowLeft, CheckCircle2, Loader2, RotateCcw, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { TicketCocoAction } from "../../_lib/resolve-ticket-coco-action"

interface Props {
  activeTab: "open" | "closed"
  cocoAction?: TicketCocoAction | null
  customer: string
  platform: string
  onBack: () => void
  onCocoAction?: () => void
  onResolve: () => void
  onReopen: () => void
  onOpenContext?: () => void
  embedded?: boolean
}

const COCO_ACTION_CLASS: Record<NonNullable<TicketCocoAction>["variant"], string> = {
  send: "border-emerald-600/30 text-emerald-700 hover:bg-emerald-600/10 hover:text-emerald-800",
  draft: "border-border text-foreground/75 hover:bg-foreground/[0.06] hover:text-foreground/90",
  caution: "border-amber-600/30 text-amber-700 hover:bg-amber-600/10 hover:text-amber-800",
  neutral: "border-border text-foreground/75 hover:bg-foreground/[0.06] hover:text-foreground/90",
  loading: "border-border text-foreground/50 hover:bg-transparent hover:text-foreground/50",
}

function initialsOf(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return "?"
  const at = trimmed.indexOf("@")
  const base = at > 0 ? trimmed.slice(0, at) : trimmed
  const parts = base.split(/\s+/).filter(Boolean)
  const letters = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : base.slice(0, 2)
  return letters.toUpperCase()
}

export default function ConversationHeader({
  activeTab,
  cocoAction,
  customer,
  platform,
  onBack,
  onCocoAction,
  onResolve,
  onReopen,
  onOpenContext,
  embedded = false,
}: Props) {
  const BackIcon = embedded ? X : ArrowLeft
  const initials = initialsOf(customer)

  const identity = (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground/[0.08] text-xs font-semibold text-foreground/60">
        {initials}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-semibold leading-tight text-foreground/85">
          {customer}
        </span>
        <span className="block text-xs font-medium capitalize text-foreground/40">via {platform}</span>
      </span>
    </>
  )

  return (
    <div className={`${embedded ? "h-14 px-3" : "h-16 px-3 md:px-5"} border-b border-border flex items-center justify-between gap-2 shrink-0`}>
      <div className="flex min-w-0 items-center gap-2.5">
        <Button
          variant="ghost"
          size="icon"
          aria-label={embedded ? "Close conversation" : "Back"}
          className={`${embedded ? "" : "md:hidden"} shrink-0 -ml-1 text-foreground/40 hover:text-foreground/80 hover:bg-foreground/[0.06] size-8`}
          onClick={onBack}
        >
          <BackIcon className="size-4" />
        </Button>
        {onOpenContext ? (
          <button
            type="button"
            className="flex min-w-0 cursor-pointer items-center gap-2.5 border-0 bg-transparent p-0 text-left [font-family:inherit]"
            onClick={onOpenContext}
          >
            {identity}
          </button>
        ) : (
          <div className="flex min-w-0 items-center gap-2.5">{identity}</div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {cocoAction && onCocoAction && (
          <Button
            variant="outline"
            size="sm"
            data-testid="ticket-coco-action"
            data-coco-action={cocoAction.id}
            disabled={cocoAction.disabled}
            onClick={onCocoAction}
            className={`inline-flex items-center gap-1.5 h-8 max-w-[9.5rem] sm:max-w-none text-xs font-semibold ${COCO_ACTION_CLASS[cocoAction.variant]}`}
          >
            {cocoAction.disabled ? (
              <Loader2 className="size-3.5 animate-spin shrink-0" />
            ) : null}
            <span className="truncate sm:hidden">{cocoAction.shortLabel}</span>
            <span className="truncate hidden sm:inline">{cocoAction.label}</span>
          </Button>
        )}
        {activeTab === "open" && (
          <Button
            size="sm"
            onClick={onResolve}
            className="bg-foreground hover:bg-foreground/90 text-background text-xs font-semibold flex items-center gap-1.5 h-8"
          >
            <CheckCircle2 className="size-3.5" />
            <span className="hidden sm:inline">Close Ticket</span>
          </Button>
        )}
        {activeTab === "closed" && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-semibold bg-green-600/10 text-green-700 border-green-600/20 px-2.5 py-1 text-xs">
              <CheckCircle2 className="size-3 mr-1" /> Closed
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={onReopen}
              className="text-foreground/50 border-border hover:bg-foreground/[0.06] hover:text-foreground/80 text-xs font-semibold flex items-center gap-1.5 h-8"
            >
              <RotateCcw className="size-3.5" /> Reopen
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
