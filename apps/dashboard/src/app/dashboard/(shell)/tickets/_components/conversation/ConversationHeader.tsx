"use client"

import { ArrowLeft, CheckCircle2, Loader2, RotateCcw, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/ui/cn"
import {
  NeedsYouCardHeader,
  TicketCardMetaRow,
  type TicketCardMeta,
} from "@/app/dashboard/_components/home/needs-you-card-ui"
import { needsYouMetaPillShellClassName } from "@/app/dashboard/_components/home/needs-you-card-styles"
import type { TicketCocoAction } from "../../_lib/resolve-ticket-coco-action"

interface Props {
  activeTab: "open" | "closed"
  cocoAction?: TicketCocoAction | null
  meta: TicketCardMeta
  onBack: () => void
  onCocoAction?: () => void
  onResolve: () => void
  onReopen: () => void
  onOpenContext?: () => void
  embedded?: boolean
  flush?: boolean
}

const COCO_ACTION_CLASS: Record<NonNullable<TicketCocoAction>["variant"], string> = {
  send: "bg-emerald-700 text-white hover:bg-emerald-700/90 hover:text-white",
  draft: "bg-[#f5ebe0] text-[#1a1a1a] hover:bg-[#efe4d6] hover:text-[#1a1a1a]",
  caution: "bg-amber-600 text-white hover:bg-amber-600/90 hover:text-white",
  neutral: "bg-[#f5ebe0] text-[#1a1a1a] hover:bg-[#efe4d6] hover:text-[#1a1a1a]",
  loading: "bg-white text-muted-foreground hover:bg-white hover:text-muted-foreground",
}

export default function ConversationHeader({
  activeTab,
  cocoAction,
  meta,
  onBack,
  onCocoAction,
  onResolve,
  onReopen,
  onOpenContext,
  embedded = false,
  flush = false,
}: Props) {
  const BackIcon = embedded ? X : ArrowLeft

  const actions = (
    <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
      {cocoAction && onCocoAction && (
        <Button
          size="sm"
          data-testid="ticket-coco-action"
          data-coco-action={cocoAction.id}
          disabled={cocoAction.disabled}
          onClick={onCocoAction}
          className={cn(
            needsYouMetaPillShellClassName,
            "h-9 max-w-[9.5rem] gap-1.5 px-3 text-xs font-semibold sm:h-10 sm:max-w-none",
            COCO_ACTION_CLASS[cocoAction.variant],
          )}
        >
          {cocoAction.disabled ? (
            <Loader2 className="size-3.5 shrink-0 animate-spin" />
          ) : null}
          <span className="truncate sm:hidden">{cocoAction.shortLabel}</span>
          <span className="hidden truncate sm:inline">{cocoAction.label}</span>
        </Button>
      )}
      {activeTab === "open" && (
        <Button
          size="sm"
          onClick={onResolve}
          aria-label="Close ticket"
          className={cn(
            needsYouMetaPillShellClassName,
            "size-9 px-0 text-xs font-semibold sm:h-10 sm:w-auto sm:gap-1.5 sm:px-3",
            "bg-foreground text-background hover:bg-foreground/90 hover:text-background",
          )}
        >
          <CheckCircle2 className="size-3.5" />
          <span className="hidden sm:inline">Close ticket</span>
        </Button>
      )}
      {activeTab === "closed" && (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-green-600/20 bg-green-600/10 px-2.5 py-1 text-xs font-semibold text-green-700">
            <CheckCircle2 className="mr-1 size-3" /> Closed
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={onReopen}
            className="flex h-8 items-center gap-1.5 border-border text-xs font-semibold text-muted-foreground hover:bg-foreground/[0.06] hover:text-strong"
          >
            <RotateCcw className="size-3.5" /> Reopen
          </Button>
        </div>
      )}
    </div>
  )

  const header = (
    <TicketCardMetaRow
      meta={meta}
      onCustomerClick={onOpenContext}
      leading={(
        <Button
          variant="ghost"
          size="icon"
          aria-label={embedded ? "Close conversation" : "Back"}
          className={cn(
            embedded ? "" : "md:hidden",
            needsYouMetaPillShellClassName,
            "size-9 shrink-0 bg-white text-[#6b5d4f] hover:bg-white hover:text-[#1a1a1a] sm:size-10",
          )}
          onClick={onBack}
        >
          <BackIcon className="size-4" />
        </Button>
      )}
      trailing={actions}
    />
  )

  if (flush) return header

  return (
    <NeedsYouCardHeader className="shrink-0">
      {header}
    </NeedsYouCardHeader>
  )
}
