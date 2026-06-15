"use client"

import { ArrowLeft, CheckCircle2, Info, Loader2, RotateCcw } from "lucide-react"
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
}

const COCO_ACTION_CLASS: Record<NonNullable<TicketCocoAction>["variant"], string> = {
  send: "border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/10 hover:text-emerald-100",
  draft: "border-violet-500/40 text-violet-200 hover:bg-violet-500/10 hover:text-violet-100",
  caution: "border-amber-500/40 text-amber-200 hover:bg-amber-500/10 hover:text-amber-100",
  neutral: "border-border text-white/75 hover:text-white hover:bg-white/[0.06]",
  loading: "border-border text-white/50 hover:bg-transparent hover:text-white/50",
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
}: Props) {
  return (
    <div className="h-14 border-b border-border flex items-center justify-between px-3 md:px-6 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden shrink-0 -ml-2 text-white/40 hover:text-white/80 hover:bg-white/[0.06] size-8"
          onClick={onBack}
        >
          <ArrowLeft className="size-4" />
        </Button>
        {onOpenContext ? (
          <button
            type="button"
            className="min-w-0 cursor-pointer border-0 bg-transparent p-0 text-left [font-family:inherit] xl:pointer-events-none xl:cursor-auto"
            onClick={onOpenContext}
          >
            <h3 className="text-[15px] font-semibold text-white/80 truncate leading-tight">
              {customer}
            </h3>
            <p className="text-xs text-white/35 font-medium capitalize">
              via {platform}
            </p>
          </button>
        ) : (
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-white/80 truncate leading-tight">
              {customer}
            </h3>
            <p className="text-xs text-white/35 font-medium capitalize">
              via {platform}
            </p>
          </div>
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
        {onOpenContext && (
          <Button
            variant="ghost"
            size="icon"
            className="xl:hidden shrink-0 text-white/40 hover:text-white/80 hover:bg-white/[0.06] size-8"
            onClick={onOpenContext}
          >
            <Info className="size-4" />
          </Button>
        )}
        {activeTab === "open" && (
          <Button
            size="sm"
            onClick={onResolve}
            className="bg-white hover:bg-white/90 text-black text-xs font-semibold flex items-center gap-1.5 h-8"
          >
            <CheckCircle2 className="size-3.5" />
            <span className="hidden sm:inline">Close Ticket</span>
          </Button>
        )}
        {activeTab === "closed" && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-semibold bg-green-400/10 text-green-400 border-green-400/20 px-2.5 py-1 text-xs">
              <CheckCircle2 className="size-3 mr-1" /> Closed
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={onReopen}
              className="text-white/50 border-border hover:bg-white/[0.06] hover:text-white/80 text-xs font-semibold flex items-center gap-1.5 h-8"
            >
              <RotateCcw className="size-3.5" /> Reopen
            </Button>
          </div>
        )}
      </div>
      
    </div>
  )
}
