"use client"

import { ArrowLeft, CheckCircle2, Loader2, RotateCcw, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  NeedsYouCardHeader,
  TicketCardMetaRow,
  type TicketCardMeta,
} from "@/app/dashboard/_components/home/needs-you-card-ui"
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
}

const COCO_ACTION_CLASS: Record<NonNullable<TicketCocoAction>["variant"], string> = {
  send: "border-emerald-600/30 text-emerald-700 hover:bg-emerald-600/10 hover:text-emerald-800",
  draft: "border-border text-strong hover:bg-foreground/[0.06] hover:text-strong",
  caution: "border-amber-600/30 text-amber-700 hover:bg-amber-600/10 hover:text-amber-800",
  neutral: "border-border text-strong hover:bg-foreground/[0.06] hover:text-strong",
  loading: "border-border text-muted-foreground hover:bg-transparent hover:text-muted-foreground",
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
}: Props) {
  const BackIcon = embedded ? X : ArrowLeft

  const metaRow = onOpenContext ? (
    <button
      type="button"
      className="min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left [font-family:inherit]"
      onClick={onOpenContext}
    >
      <TicketCardMetaRow meta={meta} />
    </button>
  ) : (
    <div className="min-w-0 flex-1">
      <TicketCardMetaRow meta={meta} />
    </div>
  )

  return (
    <NeedsYouCardHeader className="shrink-0">
      <div className="flex items-center gap-2.5">
        <Button
          variant="ghost"
          size="icon"
          aria-label={embedded ? "Close conversation" : "Back"}
          className={`${embedded ? "" : "md:hidden"} shrink-0 -ml-1 text-faint hover:text-strong hover:bg-foreground/[0.06] size-8`}
          onClick={onBack}
        >
          <BackIcon className="size-4" />
        </Button>
        {metaRow}
        <div className="flex shrink-0 items-center gap-2">
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
              aria-label="Close ticket"
              className="inline-flex h-8 items-center gap-1.5 bg-foreground text-xs font-semibold text-background hover:bg-foreground/90 sm:border sm:border-border sm:bg-transparent sm:text-muted-foreground sm:hover:bg-foreground/[0.06] sm:hover:text-strong"
            >
              <CheckCircle2 className="size-3.5" />
              <span className="hidden sm:inline">Close ticket</span>
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
                className="text-muted-foreground border-border hover:bg-foreground/[0.06] hover:text-strong text-xs font-semibold flex items-center gap-1.5 h-8"
              >
                <RotateCcw className="size-3.5" /> Reopen
              </Button>
            </div>
          )}
        </div>
      </div>
    </NeedsYouCardHeader>
  )
}
