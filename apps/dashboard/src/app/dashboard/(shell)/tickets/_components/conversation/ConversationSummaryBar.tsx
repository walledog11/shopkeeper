"use client"

import { useEffect, useState } from "react"
import { Brain, ChevronDown, ChevronUp, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useIsMobile } from "@/hooks/useMobile"

interface Props {
  summary: string | null
  isRefreshing: boolean
  onRefresh: () => void
  startCollapsed?: boolean
}

export default function ConversationSummaryBar({
  summary,
  isRefreshing,
  onRefresh,
  startCollapsed = false,
}: Props) {
  const isMobile = useIsMobile()
  const [expanded, setExpanded] = useState(() => !isMobile && !startCollapsed)
  const displaySummary = summary?.trim()

  useEffect(() => {
    if (startCollapsed) setExpanded(false)
  }, [startCollapsed])

  if (isMobile && !expanded) {
    return (
      <div className="shrink-0 border-b border-border bg-foreground/[0.02] px-3 py-1.5 mt-1">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex w-full min-w-0 items-center gap-2 text-left"
          aria-expanded={false}
        >
          <div className="flex size-5 shrink-0 items-center justify-center rounded-md bg-foreground/10 text-foreground/60">
            <Brain className="size-2.5" />
          </div>
          <span className="text-xs font-semibold text-foreground/70">Summary</span>
          <ChevronDown className="ml-auto size-3.5 shrink-0 text-foreground/35" />
        </button>
      </div>
    )
  }

  return (
    <div className="shrink-0 border-b border-border bg-foreground/[0.02] px-2 py-1 mt-1 md:px-6">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          {isMobile ? (
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-foreground/10 text-foreground/60"
              aria-label="Collapse summary"
            >
              <ChevronUp className="size-3" />
            </button>
          ) : (
            <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-foreground/10 text-foreground/60">
              <Brain className="size-2.5" />
            </div>
          )}
          <p className="min-w-0 text-xs leading-6 text-foreground/60">
            <span className="font-semibold text-foreground/85">Summary</span>
            <span className="text-foreground/35"> · </span>
            <span className={displaySummary ? "" : "text-foreground/35"}>
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
