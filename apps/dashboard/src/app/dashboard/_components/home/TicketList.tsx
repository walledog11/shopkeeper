"use client"

import Image from "next/image"
import Link from "next/link"
import { CheckCircle2, Zap, Settings, BarChart2, ArrowRight } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
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
        <div key={i} className="flex gap-3">
          <Skeleton className="w-7 h-7 rounded-full shrink-0 bg-white/[0.06]" />
          <div className="flex-1 space-y-1.5 pt-0.5">
            <Skeleton className="h-3 w-1/3 bg-white/[0.06]" />
            <Skeleton className="h-3 w-2/3 bg-white/[0.06]" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState({ activeView, openCount, resolvedCount, setActiveView, hasChannel }: Pick<Props, 'activeView' | 'openCount' | 'resolvedCount' | 'setActiveView' | 'hasChannel'>) {
  if (!hasChannel && openCount === 0 && resolvedCount === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
        <div className="w-12 h-12 rounded-full bg-green-400/10 border border-green-400/20 flex items-center justify-center">
          <Zap className="w-6 h-6 text-green-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white/70">No channel connected yet</p>
          <p className="text-xs text-white/35 mt-1 max-w-[220px] mx-auto leading-relaxed">
            Connect your support inbox to start receiving customer messages as tickets.
          </p>
        </div>
        <Link
          href="/dashboard/settings?tab=integrations"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-green-400 text-black text-xs font-semibold hover:bg-green-300 transition-colors"
        >
          Connect a channel <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col p-6 gap-5">
      <div className="flex flex-col items-center text-center pt-4">
        <div className="w-10 h-10 rounded-full bg-white/[0.06] flex items-center justify-center mx-auto mb-3">
          <CheckCircle2 className="w-5 h-5 text-green-400" />
        </div>
        <p className="text-sm font-semibold text-white/60">
          {activeView === 'open' ? "All caught up — no open tickets" :
           activeView === 'resolved' ? "No resolved tickets yet" :
           activeView === 'recent' ? "No activity in the last 24 hours" :
           "No tickets in this view"}
        </p>
        <p className="text-xs text-white/30 mt-1">
          {activeView === 'open'
            ? "New messages from connected channels will appear here."
            : "Switch views using the panel on the left."}
        </p>
      </div>

      {(openCount > 0 || resolvedCount > 0) && (
        <div className="grid grid-cols-2 gap-2">
          {openCount > 0 && activeView !== 'open' && (
            <button
              onClick={() => setActiveView('open')}
              className="flex flex-col items-start p-3 rounded-md border border-amber-400/15 bg-amber-400/5 hover:border-amber-400/25 hover:bg-amber-400/10 transition-all text-left"
            >
              <span className="text-lg font-bold text-amber-400 leading-none">{openCount}</span>
              <span className="text-xs text-amber-400/70 mt-0.5">open ticket{openCount !== 1 ? 's' : ''}</span>
            </button>
          )}
          {resolvedCount > 0 && activeView !== 'resolved' && (
            <button
              onClick={() => setActiveView('resolved')}
              className="flex flex-col items-start p-3 rounded-md border border-green-400/15 bg-green-400/5 hover:border-green-400/25 hover:bg-green-400/10 transition-all text-left"
            >
              <span className="text-lg font-bold text-green-400 leading-none">{resolvedCount}</span>
              <span className="text-xs text-green-400/70 mt-0.5">resolved ticket{resolvedCount !== 1 ? 's' : ''}</span>
            </button>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-xs text-white/40">Suggested next steps</p>
        {[
          { icon: Zap, label: "Connect a channel to start receiving messages", href: "/dashboard/settings?tab=integrations" },
          { icon: Settings, label: "Configure your AI agent", href: "/dashboard/settings" },
          { icon: BarChart2, label: "View your analytics dashboard", href: "/dashboard/analytics" },
        ].map(({ icon: Icon, label, href }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-md border border-white/[0.07] hover:border-white/[0.12] hover:bg-white/[0.04] transition-all"
          >
            <Icon className="w-3.5 h-3.5 text-white/30 shrink-0" />
            <span className="text-xs text-white/50">{label}</span>
            <ArrowRight className="w-3 h-3 text-white/20 ml-auto shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  )
}

const CHANNEL_BORDER: Record<string, string> = {
  ig_dm:           "group-hover:border-l-pink-500/60",
  email:           "group-hover:border-l-blue-400/60",
  shopify:         "group-hover:border-l-green-500/60",
  sms:             "group-hover:border-l-purple-400/60",
  sms_agent:       "group-hover:border-l-purple-400/60",
  tiktok:          "group-hover:border-l-cyan-400/60",
  dashboard_agent: "group-hover:border-l-white/20",
}

function TicketRow({ thread }: { thread: Thread }) {
  const channel = getChannelInfo(thread.channelType)
  const customer = getCustomerName(thread.customer)
  const lastMsg = thread.messages[0]
  const preview = lastMsg?.contentText || "No messages yet"
  const isAgent = lastMsg?.senderType === "agent" || lastMsg?.senderType === "ai"
  const borderClass = CHANNEL_BORDER[thread.channelType] ?? "group-hover:border-l-white/20"

  return (
    <Link
      href={`/dashboard/tickets?thread=${thread.id}`}
      className={`group flex items-start gap-3 pr-5 pl-4 py-3 border-l-2 border-l-transparent ${borderClass} hover:bg-white/[0.04] transition-all overflow-hidden`}
    >
      <div className="w-7 h-7 rounded-full bg-white/[0.09] flex items-center justify-center shrink-0 mt-0.5">
        <Image src={channel.logo} alt={channel.name} width={14} height={14} className="object-contain opacity-80" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-0.5 min-w-0">
          <span className="text-sm font-semibold text-white/90 truncate">{customer}</span>
          <span className="text-[11px] text-white/30 shrink-0">{timeAgo(thread.updatedAt)}</span>
        </div>
        <p className="text-xs text-white/40 truncate">
          {isAgent && <span className="text-white/25">You: </span>}
          {preview}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-white/30">{channel.name}</span>
          {thread.tag && (
            <>
              <span className="text-white/15">·</span>
              <span className="text-[10px] text-white/30">{thread.tag}</span>
            </>
          )}
          <span className="text-white/15">·</span>
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
            thread.status === "open"
              ? "bg-amber-400/10 text-amber-400"
              : "bg-green-400/10 text-green-400"
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
    <Card className="bg-card border-border rounded-md flex flex-col overflow-hidden">
      <div className="flex border-b border-border">
        {navViews.map(view => (
          <button
            key={view.id}
            onClick={() => setActiveView(view.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium border-b-2 transition-all ${
              activeView === view.id
                ? "border-white/70 text-white"
                : "border-transparent text-white/35 hover:text-white/60"
            }`}
          >
            {view.label}
            {view.count > 0 && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                activeView === view.id
                  ? "bg-white/10 text-white/70"
                  : "bg-white/[0.06] text-white/30"
              }`}>
                {view.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {isLoading ? (
          <motion.div key="skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <LoadingSkeleton />
          </motion.div>
        ) : displayedThreads.length === 0 ? (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            <EmptyState
              activeView={activeView}
              openCount={openCount}
              resolvedCount={resolvedCount}
              setActiveView={setActiveView}
              hasChannel={hasChannel}
            />
          </motion.div>
        ) : (
          <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="flex flex-col overflow-x-hidden overflow-y-auto max-h-[340px] divide-y divide-white/[0.05]">
            {displayedThreads.map(thread => (
              <TicketRow key={thread.id} thread={thread} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <Link
        href="/dashboard/tickets"
        className="flex items-center justify-center gap-1.5 px-4 py-2.5 border-t border-border text-xs text-white/30 hover:text-white/60 transition-colors"
      >
        View all tickets <ArrowRight className="w-3 h-3" />
      </Link>
    </Card>
  )
}
