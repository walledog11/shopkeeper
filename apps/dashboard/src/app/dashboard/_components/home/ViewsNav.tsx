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

export default function ViewsNav({ navViews, activeView, setActiveView }: Props) {
  return (
    <Card className="bg-card border-border rounded-md shrink-0">
      <div className="px-3 py-2.5 border-b border-border">
        <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest">Views</p>
      </div>
      <div className="p-1.5 space-y-0.5">
        {navViews.map(view => (
          <button
            key={view.id}
            onClick={() => setActiveView(view.id)}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-left transition-colors ${
              activeView === view.id
                ? "bg-white/[0.10] text-white"
                : "text-white/50 hover:bg-white/[0.05] hover:text-white/80"
            }`}
          >
            <span className="text-xs font-medium truncate">{view.label}</span>
            {view.count > 0 && (
              <Badge variant="ghost" className={`ml-2 text-[10px] font-semibold shrink-0 ${
                activeView === view.id
                  ? "bg-white/[0.15] text-white"
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
