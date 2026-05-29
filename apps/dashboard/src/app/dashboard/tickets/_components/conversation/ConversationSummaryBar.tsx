"use client"

import { Brain, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface Props {
  summary: string | null
  isRefreshing: boolean
  onRefresh: () => void
}

export default function ConversationSummaryBar({
  summary,
  isRefreshing,
  onRefresh,
}: Props) {
  const displaySummary = summary?.trim()

  return (
    <div className="shrink-0 border-b border-border bg-[#050505] px-2 py-1 mt-1 md:px-6">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-gradient-to-r from-slate-200 via-slate-400 to-slate-600 text-white">
            <Brain className="size-2.5" />
          </div>
          <p className="min-w-0 text-xs leading-6 text-white/55">
            <span className="font-semibold text-white/90">Summary</span>
            <span className="text-white/35"> · </span>
            <span className={displaySummary ? "" : "text-white/35"}>
              {displaySummary || "Generating summary…"}
            </span>
          </p>
        </div>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="mt-0.5 shrink-0 text-white/35 hover:bg-white/[0.06] hover:text-white/75"
                disabled={isRefreshing}
                onClick={onRefresh}
                aria-label="Refresh summary"
              >
                <RefreshCw className={`size-3 ${isRefreshing ? "animate-spin" : ""}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Refresh summary</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  )
}
