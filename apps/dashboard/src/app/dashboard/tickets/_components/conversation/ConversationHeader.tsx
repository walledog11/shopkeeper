"use client"

import { ArrowLeft, CheckCircle2, Info, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface Props {
  activeTab: "open" | "closed"
  customer: string
  platform: string
  agentName?: string
  onAskAgent?: () => void
  onBack: () => void
  onResolve: () => void
  onReopen: () => void
  onOpenContext?: () => void
}

export default function ConversationHeader({
  activeTab,
  customer,
  platform,
  agentName,
  onAskAgent,
  onBack,
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
        {onAskAgent && agentName && activeTab === "open" && (
          <Button
            variant="outline"
            size="sm"
            onClick={onAskAgent}
            className="hidden sm:inline-flex h-8 text-xs font-semibold border-border text-white/75 hover:text-white hover:bg-white/[0.06]"
          >
            Ask {agentName}
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
