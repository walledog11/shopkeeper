import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { ViewId, NavView } from "./types"

interface Props {
  navViews: NavView[]
  activeView: ViewId
  setActiveView: (view: ViewId) => void
}

const VIEW_ACTIVE_STYLES: Record<string, string> = {
  open:     "border-l-amber-400 bg-amber-400/[0.07] text-amber-400",
  resolved: "border-l-green-400 bg-green-400/[0.07] text-green-400",
  recent:   "border-l-blue-400/60 bg-blue-400/[0.05] text-blue-300",
}

const VIEW_BADGE_STYLES: Record<string, string> = {
  open:     "bg-amber-400/[0.12] text-amber-400",
  resolved: "bg-green-400/[0.12] text-green-400",
  recent:   "bg-blue-400/[0.10] text-blue-300",
}

export default function ViewsNav({ navViews, activeView, setActiveView }: Props) {
  return (
    <Card className="bg-card border-border rounded-md shrink-0">
      <div className="px-3 py-2.5 border-b border-border">
        <p className="text-xs text-white/40">Views</p>
      </div>
      <div className="p-1.5 space-y-0.5">
        {navViews.map(view => (
          <button
            key={view.id}
            onClick={() => setActiveView(view.id)}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md border-l-2 text-left transition-all ${
              activeView === view.id
                ? VIEW_ACTIVE_STYLES[view.id] ?? "border-l-transparent bg-white/[0.10] text-white"
                : "border-l-transparent text-white/50 hover:bg-white/[0.05] hover:text-white/80"
            }`}
          >
            <span className="text-xs font-medium truncate">{view.label}</span>
            {view.count > 0 && (
              <Badge variant="ghost" className={`ml-2 text-[10px] font-semibold shrink-0 ${
                activeView === view.id
                  ? VIEW_BADGE_STYLES[view.id] ?? "bg-white/[0.15] text-white"
                  : "bg-white/[0.07] text-white/40"
              }`}>
                {view.count}
              </Badge>
            )}
          </button>
        ))}
      </div>
      <div className="px-3 py-2.5 border-t border-border">
        <Link
          href="/dashboard/tickets"
          className="flex items-center gap-1 text-xs font-medium text-white/30 hover:text-white/70 transition-colors"
        >
          Go to inbox <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </Card>
  )
}
