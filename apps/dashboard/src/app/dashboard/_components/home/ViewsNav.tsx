import Link from "next/link"
import { ArrowRight } from "lucide-react"
import type { ViewId, NavView } from "./types"

interface Props {
  navViews: NavView[]
  activeView: ViewId
  setActiveView: (view: ViewId) => void
}

export default function ViewsNav({ navViews, activeView, setActiveView }: Props) {
  return (
    <div className="bg-white rounded-md shadow-md shrink-0">
      <div className="px-3 py-2.5 border-b border-slate-100">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Views</p>
      </div>
      <div className="p-1.5 space-y-0.5">
        {navViews.map(view => (
          <button
            key={view.id}
            onClick={() => setActiveView(view.id)}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-left transition-colors ${
              activeView === view.id
                ? 'bg-teal-800 text-white'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <span className="text-xs font-medium truncate">{view.label}</span>
            {view.count > 0 && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ml-2 shrink-0 ${
                activeView === view.id
                  ? 'bg-teal-700/30 text-white'
                  : 'bg-slate-100 text-slate-500'
              }`}>
                {view.count}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="px-3 py-2.5 border-t border-slate-100">
        <Link
          href="/dashboard/tickets"
          className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-900 transition-colors"
        >
          Go to inbox <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  )
}
