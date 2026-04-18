"use client"

import { ArrowLeft, CheckCircle2, Info, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface Props {
  activeTab: "open" | "closed"
  customer: string
  platform: string
  onBack: () => void
  onResolve: () => void
  onReopen: () => void
  onOpenContext?: () => void
}

export default function ConversationHeader({
  activeTab,
  customer,
  platform,
  onBack,
  onResolve,
  onReopen,
  onOpenContext,
}: Props) {
  return (
    <div className="h-16 border-b border-border flex items-center justify-between px-3 md:px-6 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden shrink-0 -ml-2 text-white/40 hover:text-white/80 hover:bg-white/[0.06] h-8 w-8"
          onClick={onBack}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div
          className={`min-w-0 ${onOpenContext ? "cursor-pointer xl:cursor-auto xl:pointer-events-none" : ""}`}
          onClick={onOpenContext}
        >
          <h3 className="text-[15px] font-semibold text-white/80 truncate leading-tight">
            {customer}
          </h3>
          <p className="text-xs text-white/35 font-medium capitalize">
            via {platform}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {onOpenContext && (
          <Button
            variant="ghost"
            size="icon"
            className="xl:hidden shrink-0 text-white/40 hover:text-white/80 hover:bg-white/[0.06] h-8 w-8"
            onClick={onOpenContext}
          >
            <Info className="w-4 h-4" />
          </Button>
        )}
        {activeTab === "open" && (
          <Button
            size="sm"
            onClick={onResolve}
            className="bg-white hover:bg-white/90 text-black text-xs font-semibold flex items-center gap-1.5 h-8"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Close Ticket</span>
          </Button>
        )}
        {activeTab === "closed" && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-semibold bg-green-400/10 text-green-400 border-green-400/20 px-2.5 py-1 text-xs">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Closed
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={onReopen}
              className="text-white/50 border-border hover:bg-white/[0.06] hover:text-white/80 text-xs font-semibold flex items-center gap-1.5 h-8"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reopen
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
