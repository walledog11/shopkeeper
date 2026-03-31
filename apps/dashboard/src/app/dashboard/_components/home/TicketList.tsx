import Image from "next/image"
import Link from "next/link"
import { CheckCircle2, Zap, Settings, BarChart2, ArrowRight } from "lucide-react"
import { timeAgo, getCustomerName } from "@/lib/utils"
import { getChannelInfo } from "@/lib/channels"
import type { Thread } from "@/types"
import type { ViewId, NavView } from "./types"

interface Props {
  isLoading: boolean
  displayedThreads: Thread[]
  activeView: ViewId
  navViews: NavView[]
  openCount: number
  resolvedCount: number
  setActiveView: (view: ViewId) => void
  hasChannel: boolean
}

function LoadingSkeleton() {
  return (
    <div className="flex-1 p-4 space-y-3">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="flex gap-3 animate-pulse">
          <div className="w-7 h-7 rounded-full bg-slate-100 shrink-0" />
          <div className="flex-1 space-y-1.5 pt-0.5">
            <div className="h-3 bg-slate-100 rounded w-1/3" />
            <div className="h-3 bg-slate-100 rounded w-2/3" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState({ activeView, openCount, resolvedCount, setActiveView, hasChannel }: Pick<Props, 'activeView' | 'openCount' | 'resolvedCount' | 'setActiveView'> & { hasChannel: boolean }) {
  // No channel connected at all — show a focused setup CTA
  if (!hasChannel && openCount === 0 && resolvedCount === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
        <div className="w-12 h-12 rounded-full bg-yellow-50 border border-yellow-200 flex items-center justify-center">
          <Zap className="w-6 h-6 text-yellow-500" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-800">No channel connected yet</p>
          <p className="text-xs text-slate-400 mt-1 max-w-[220px] mx-auto leading-relaxed">
            Connect your support inbox to start receiving customer messages as tickets.
          </p>
        </div>
        <Link
          href="/dashboard/settings?tab=integrations"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-slate-900 text-white text-xs font-semibold hover:bg-slate-700 transition-colors shadow-sm"
        >
          Connect a channel <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col p-6 gap-5">
      <div className="flex flex-col items-center text-center pt-4">
        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
          <CheckCircle2 className="w-5 h-5 text-green-400" />
        </div>
        <p className="text-sm font-semibold text-slate-700">
          {activeView === 'open' ? "All caught up — no open tickets" :
           activeView === 'resolved' ? "No resolved tickets yet" :
           activeView === 'recent' ? "No activity in the last 24 hours" :
           "No tickets in this view"}
        </p>
        <p className="text-xs text-slate-400 mt-1">
          {activeView === 'open'
            ? "New messages from connected channels will appear here."
            : "Switch views using the panel on the left."}
        </p>
      </div>

      {/* Cross-view suggestions */}
      {(openCount > 0 || resolvedCount > 0) && (
        <div className="grid grid-cols-2 gap-2">
          {openCount > 0 && activeView !== 'open' && (
            <button
              onClick={() => setActiveView('open')}
              className="flex flex-col items-start p-3 rounded-md border border-amber-100 bg-amber-50 hover:border-amber-200 hover:bg-amber-100 transition-all text-left"
            >
              <span className="text-lg font-bold text-amber-700 leading-none">{openCount}</span>
              <span className="text-xs text-amber-600 mt-0.5">open ticket{openCount !== 1 ? 's' : ''}</span>
            </button>
          )}
          {resolvedCount > 0 && activeView !== 'resolved' && (
            <button
              onClick={() => setActiveView('resolved')}
              className="flex flex-col items-start p-3 rounded-md border border-green-100 bg-green-50 hover:border-green-200 hover:bg-green-100 transition-all text-left"
            >
              <span className="text-lg font-bold text-green-700 leading-none">{resolvedCount}</span>
              <span className="text-xs text-green-600 mt-0.5">resolved ticket{resolvedCount !== 1 ? 's' : ''}</span>
            </button>
          )}
        </div>
      )}

      {/* Suggested next actions */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Suggested next steps</p>
        {[
          { icon: Zap, label: "Connect a channel to start receiving messages", href: "/dashboard/settings?tab=integrations" },
          { icon: Settings, label: "Configure your AI agent", href: "/dashboard/settings" },
          { icon: BarChart2, label: "View your analytics dashboard", href: "/dashboard/analytics" },
        ].map(({ icon: Icon, label, href }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-md border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-all"
          >
            <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-xs text-slate-600">{label}</span>
            <ArrowRight className="w-3 h-3 text-slate-300 ml-auto shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  )
}

function TicketRow({ thread }: { thread: Thread }) {
  const channel = getChannelInfo(thread.channelType)
  const customer = getCustomerName(thread.customer)
  const lastMsg = thread.messages[0]
  const preview = lastMsg?.contentText || "No messages yet"
  const isAgent = lastMsg?.senderType === "agent" || lastMsg?.senderType === "ai"

  return (
    <Link
      href={`/dashboard/tickets?thread=${thread.id}`}
      className="flex items-start gap-3 px-4 py-2 hover:bg-slate-50 transition-colors"
    >
      <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
        <Image src={channel.logo} alt={channel.name} width={14} height={14} className="object-contain" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className="text-sm font-semibold text-slate-900 truncate">{customer}</span>
          <span className="text-[11px] text-slate-400 shrink-0">{timeAgo(thread.updatedAt)}</span>
        </div>
        <p className="text-xs text-slate-500 truncate">
          {isAgent && <span className="text-slate-400">You: </span>}
          {preview}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-slate-400">{channel.name}</span>
          {thread.tag && (
            <>
              <span className="text-slate-200">·</span>
              <span className="text-[10px] text-slate-400">{thread.tag}</span>
            </>
          )}
          <span className="text-slate-200">·</span>
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
            thread.status === "open"
              ? "bg-amber-50 text-amber-700"
              : "bg-green-50 text-green-700"
          }`}>
            {thread.status.charAt(0).toUpperCase() + thread.status.slice(1)}
          </span>
        </div>
      </div>
    </Link>
  )
}

export default function TicketList({ isLoading, displayedThreads, activeView, navViews, openCount, resolvedCount, setActiveView, hasChannel }: Props) {
  return (
    <div className="bg-white rounded-md shadow-md flex flex-col min-h-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <h2 className="text-sm font-bold text-slate-900">
          {navViews.find(v => v.id === activeView)?.label ?? 'Tickets'}
        </h2>
        <Link href="/dashboard/tickets" className="text-xs font-medium text-slate-400 hover:text-slate-700 transition-colors">
          View all
        </Link>
      </div>

      {isLoading ? (
        <LoadingSkeleton />
      ) : displayedThreads.length === 0 ? (
        <EmptyState
          activeView={activeView}
          openCount={openCount}
          resolvedCount={resolvedCount}
          setActiveView={setActiveView}
          hasChannel={hasChannel}
        />
      ) : (
        <div className="divide-y divide-slate-50">
          {displayedThreads.map(thread => (
            <TicketRow key={thread.id} thread={thread} />
          ))}
        </div>
      )}
    </div>
  )
}
