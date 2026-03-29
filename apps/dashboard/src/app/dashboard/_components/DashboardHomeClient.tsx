"use client"

import Image from "next/image"
import Link from "next/link"
import { useState, useEffect } from "react"
import { Inbox, CheckCircle2, MessageSquare, ArrowRight, Clock } from "lucide-react"
import ResourcesCard from "./ResourcesCard"
import { useThreads } from "@/hooks/useThreads"
import { timeAgo, getCustomerName } from "@/lib/utils"
import { getChannelInfo } from "@/lib/channels"
import type { Thread } from "@/types"

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}

interface Props {
  userName: string
  initialOpenThreads: Thread[]
  initialClosedThreads: Thread[]
}

type ViewId = 'all' | 'open' | 'resolved' | 'recent'

export default function DashboardHomeClient({ userName, initialOpenThreads, initialClosedThreads }: Props) {
  const greeting = getGreeting()
  const [agentBannerDismissed, setAgentBannerDismissed] = useState(false)
  const [activeView, setActiveView] = useState<ViewId>('all')

  useEffect(() => {
    setAgentBannerDismissed(localStorage.getItem('agentBannerDismissed') === 'true')
  }, [])

  function dismissAgentBanner() {
    localStorage.setItem('agentBannerDismissed', 'true')
    setAgentBannerDismissed(true)
  }

  const { threads: openThreads, isLoading: loadingOpen } = useThreads('open', initialOpenThreads)
  const { threads: closedThreads, isLoading: loadingClosed } = useThreads('closed', initialClosedThreads)

  const isLoading = loadingOpen || loadingClosed

  const openCount = openThreads.length
  const resolvedCount = closedThreads.length
  const allThreads = [...openThreads, ...closedThreads]
  const totalMessages = allThreads.reduce((sum, t) => sum + t.messages.length, 0)

  const now = Date.now()
  const recentThreads = allThreads.filter(t => now - new Date(t.updatedAt).getTime() < 24 * 60 * 60 * 1000)

  const sortByDate = (threads: Thread[]) =>
    [...threads].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

  const viewThreads: Record<ViewId, Thread[]> = {
    all: sortByDate(allThreads),
    open: sortByDate(openThreads),
    resolved: sortByDate(closedThreads),
    recent: sortByDate(recentThreads),
  }

  const displayedThreads = viewThreads[activeView]

  const needsAttention = sortByDate(openThreads)
    .sort((a, b) => b.messages.length - a.messages.length)
    .slice(0, 4)

  const channelConnected = openCount > 0 || resolvedCount > 0
  const workflowSteps = [
    { label: "Connect a channel", href: "/dashboard/integrations", status: channelConnected ? "done" : "pending" as const },
    { label: "Invite team members", href: "/dashboard/team", status: "pending" as const },
    { label: "Configure AI agent", href: "/dashboard/settings", status: "pending" as const },
    { label: "Add more channels", href: "/dashboard/integrations", status: "pending" as const },
  ]
  const workflowDoneCount = workflowSteps.filter(s => s.status === "done").length

  const navViews: { id: ViewId; label: string; count: number }[] = [
    { id: 'all', label: 'All tickets', count: allThreads.length },
    { id: 'open', label: 'Open', count: openCount },
    { id: 'resolved', label: 'Resolved', count: resolvedCount },
    { id: 'recent', label: 'Recent (24h)', count: recentThreads.length },
  ]

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-50">

      {/* Scrollable content — flex-col so 3-col grid can fill remaining height */}
      <div className="flex-1 overflow-y-auto">
      <div className="flex flex-col min-h-full max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-5 gap-4">

        {/* AI agent banner card */}
        {!agentBannerDismissed && (
          <div className="shrink-0 bg-white border border-slate-200 rounded-md shadow-sm overflow-hidden">
            <div className="flex items-center gap-6 px-6 py-5">
              {/* Illustration — hidden on mobile */}
              <div className="hidden sm:block relative shrink-0" style={{ width: '180px', height: '112px' }}>

                {/* Back card: AI agent persona selector */}
                <div className="absolute left-0 top-0 bg-white rounded-md shadow-md border border-slate-200 overflow-hidden" style={{ width: '108px', height: '100px', zIndex: 1 }}>
                  <div className="bg-[#1c3b38] px-2.5 py-1.5">
                    <span className="text-[7px] font-bold text-white tracking-wide">AI agent persona</span>
                  </div>
                  <div className="p-1.5 space-y-1">
                    <div className="flex items-center gap-1.5 px-1.5 py-1 rounded border border-slate-100 bg-white">
                      <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <circle cx="12" cy="12" r="10" /><circle cx="9" cy="10" r="0.8" fill="currentColor" stroke="none" /><circle cx="15" cy="10" r="0.8" fill="currentColor" stroke="none" /><path d="M8.5 15a4 4 0 007 0" strokeLinecap="round" />
                      </svg>
                    </div>
                    <div className="flex items-center gap-1.5 px-1.5 py-1 rounded border border-[#1c3b38] bg-teal-50">
                      <svg className="w-3.5 h-3.5 text-[#1c3b38]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <circle cx="12" cy="12" r="10" /><path d="M8 13s1.5 3 4 3 4-3 4-3" strokeLinecap="round" /><circle cx="9" cy="9.5" r="0.8" fill="currentColor" stroke="none" /><circle cx="15" cy="9.5" r="0.8" fill="currentColor" stroke="none" />
                      </svg>
                    </div>
                    <div className="flex items-center gap-1.5 px-1.5 py-1 rounded border border-slate-100 bg-white">
                      <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <circle cx="12" cy="12" r="10" /><circle cx="9" cy="10" r="0.8" fill="currentColor" stroke="none" /><circle cx="15" cy="10" r="0.8" fill="currentColor" stroke="none" /><line x1="9" y1="15" x2="15" y2="15" strokeLinecap="round" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Front card: conversation panel */}
                <div className="absolute right-0 bottom-0 flex rounded-md shadow-md border border-slate-200 bg-white overflow-hidden" style={{ width: '128px', height: '96px', zIndex: 2 }}>
                  <div className="shrink-0 bg-slate-900 flex flex-col items-center pt-2" style={{ width: '22px' }}>
                    <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 7l10 7 10-7" />
                    </svg>
                  </div>
                  <div className="flex-1 px-2 py-2 space-y-2">
                    <div className="h-1.5 bg-slate-200 rounded-full w-3/4" />
                    <div className="flex items-start gap-1.5">
                      <div className="w-4 h-4 rounded-full bg-amber-400 shrink-0 mt-0.5" />
                      <div className="flex-1 space-y-1 pt-0.5">
                        <div className="h-1.5 bg-slate-700 rounded-full w-2/3" />
                        <div className="h-1 bg-slate-200 rounded-full w-3/4" />
                      </div>
                    </div>
                    <div className="flex items-start gap-1.5">
                      <div className="w-4 h-4 rounded bg-slate-800 shrink-0 mt-0.5 flex items-center justify-center gap-0.5">
                        <div className="w-0.5 h-0.5 rounded-full bg-white" />
                        <div className="w-0.5 h-0.5 rounded-full bg-white" />
                      </div>
                      <div className="flex-1 space-y-1 pt-0.5">
                        <div className="h-1.5 bg-slate-700 rounded-full w-1/2" />
                        <div className="h-1 bg-slate-200 rounded-full w-full" />
                        <div className="h-1 bg-slate-200 rounded-full w-2/3" />
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              {/* Content + actions — stack vertically on mobile, row on desktop */}
              <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center sm:gap-6">
                <div className="flex-1 min-w-0">
                  <div className="mb-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-indigo-600 px-2.5 py-1 rounded-full">
                      <Clock className="w-3 h-3" /> 3-min setup
                    </span>
                  </div>
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900 leading-tight">Set up your AI agent</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Automatically resolve the most common questions from your customers.
                  </p>
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mt-4 sm:mt-0 shrink-0">
                  <Link
                    href="/dashboard/settings"
                    className="w-full sm:w-auto text-center bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-5 py-2.5 rounded-md transition-colors"
                  >
                    Start
                  </Link>
                  <button
                    onClick={dismissAgentBanner}
                    className="text-sm font-medium text-slate-400 hover:text-slate-700 transition-colors text-center sm:text-left"
                  >
                    Maybe later
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">{greeting}, {userName}.</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              {isLoading
                ? "Loading your queue…"
                : openCount === 0
                  ? "You're all caught up. No open tickets."
                  : `You have ${openCount} open ticket${openCount !== 1 ? "s" : ""} waiting.`
              }
            </p>
          </div>
          <Link
            href="/dashboard/tickets"
            className="hidden md:flex items-center gap-1.5 text-sm font-semibold text-slate-800 bg-yellow-400 hover:bg-yellow-300 rounded-md px-3.5 py-2 transition-all shadow-sm"
          >
            View all tickets <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Compact stat cards */}
        <div className="grid grid-cols-3 gap-2 shrink-0">
          <Link
            href="/dashboard/tickets"
            className="group block bg-white border border-slate-200 hover:border-orange-200 rounded-md px-4 py-3 flex items-center justify-between shadow-sm hover:shadow-md transition-all"
          >
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Open</p>
              <p className="text-2xl font-bold text-slate-900 leading-none mt-0.5">
                {isLoading ? <span className="text-slate-200">—</span> : openCount}
              </p>
            </div>
            <div className="w-8 h-8 rounded-md bg-gradient-to-br from-orange-50 to-amber-100 flex items-center justify-center group-hover:from-orange-100 group-hover:to-amber-200 transition-all">
              <Inbox className="w-4 h-4 text-orange-500" />
            </div>
          </Link>

          <div className="bg-white border border-slate-200 rounded-md px-4 py-3 flex items-center justify-between shadow-sm">
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Resolved</p>
              <p className="text-2xl font-bold text-slate-900 leading-none mt-0.5">
                {isLoading ? <span className="text-slate-200">—</span> : resolvedCount}
              </p>
            </div>
            <div className="w-8 h-8 rounded-md bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-md px-4 py-3 flex items-center justify-between shadow-sm">
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Messages</p>
              <p className="text-2xl font-bold text-slate-900 leading-none mt-0.5">
                {isLoading ? <span className="text-slate-200">—</span> : totalMessages.toLocaleString()}
              </p>
            </div>
            <div className="w-8 h-8 rounded-md bg-gradient-to-br from-blue-50 to-sky-100 flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-blue-500" />
            </div>
          </div>
        </div>

        {/* Main 3-column layout — flex-1 fills remaining page height */}
        <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr_260px] gap-4 flex-1 min-h-0">

          {/* Left nav panel */}
          <div className="bg-white rounded-md border border-slate-200 shadow-sm">
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
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <span className="text-xs font-medium truncate">{view.label}</span>
                  {view.count > 0 && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ml-2 shrink-0 ${
                      activeView === view.id
                        ? 'bg-white/20 text-white'
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

          {/* Center: ticket list — flex-col so it fills grid cell height */}
          <div className="bg-white rounded-md border border-slate-200 shadow-sm flex flex-col min-h-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-900">
                {navViews.find(v => v.id === activeView)?.label ?? 'Tickets'}
              </h2>
              <Link href="/dashboard/tickets" className="text-xs font-medium text-slate-400 hover:text-slate-700 transition-colors">
                View all
              </Link>
            </div>

            {isLoading ? (
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
            ) : displayedThreads.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                  <Inbox className="w-4 h-4 text-slate-300" />
                </div>
                <p className="text-sm text-slate-400">No tickets in this view.</p>
                <p className="text-xs text-slate-300 mt-0.5">Messages from connected channels will appear here.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {displayedThreads.map(thread => {
                  const channel = getChannelInfo(thread.channelType)
                  const customer = getCustomerName(thread.customer)
                  const lastMsg = thread.messages[thread.messages.length - 1]
                  const preview = lastMsg?.contentText || "No messages yet"
                  const isAgent = lastMsg?.senderType === "agent" || lastMsg?.senderType === "ai"

                  return (
                    <Link
                      key={thread.id}
                      href={`/dashboard/tickets?thread=${thread.id}`}
                      className="flex items-start gap-3 px-4 py-3.5 hover:bg-slate-50 transition-colors"
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
                })}
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="space-y-4">

            {/* Workflow Basics */}
            <div className="bg-gradient-to-br from-indigo-50 to-slate-50 rounded-md border border-slate-200 shadow-sm overflow-hidden">
              <div className="relative px-4 pt-4 pb-3 border-b border-slate-200/70">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-semibold text-indigo-500 uppercase tracking-widest mb-0.5">Setup guide</p>
                    <h2 className="text-base font-bold text-slate-900 leading-tight">Workflow<br />basics</h2>
                  </div>
                  <div className="shrink-0 w-20 h-14 overflow-hidden rounded-md">
                    <Image
                      src="/illustrations/workflow-basics.svg"
                      alt="Workflow basics"
                      width={160}
                      height={90}
                      className="w-full h-full object-cover object-left"
                    />
                  </div>
                </div>
                <div className="mt-2.5">
                  <span className="text-[10px] text-slate-500">{workflowDoneCount} of {workflowSteps.length} complete</span>
                  <div className="h-1 bg-slate-200 rounded-full overflow-hidden mt-1">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                      style={{ width: `${(workflowDoneCount / workflowSteps.length) * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="px-4 py-3 space-y-2.5">
                {workflowSteps.map((step) => (
                  <div key={step.label} className="flex items-center gap-2.5">
                    {step.status === "done" ? (
                      <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-2.5 h-2.5 text-white" />
                      </div>
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-slate-300 shrink-0" />
                    )}
                    <span className={`flex-1 text-xs font-medium ${step.status === "done" ? "text-slate-400 line-through" : "text-slate-700"}`}>
                      {step.label}
                    </span>
                    <Link
                      href={step.href}
                      className={`text-xs font-semibold shrink-0 transition-colors ${
                        step.status === "done"
                          ? "text-slate-400 hover:text-slate-600"
                          : "text-indigo-600 hover:text-indigo-800"
                      }`}
                    >
                      {step.status === "done" ? "View" : "Start"}
                    </Link>
                  </div>
                ))}
              </div>

              <div className="px-4 py-3 border-t border-slate-200/70">
                <Link
                  href="/dashboard/integrations"
                  className="flex items-center justify-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors"
                >
                  View all setup guides <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>

            {/* Tips & Strategies */}
            <ResourcesCard />

            {/* Needs Attention — only shown when there are open tickets */}
            {!isLoading && needsAttention.length > 0 && (
              <div className="bg-white rounded-md border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <h2 className="text-sm font-semibold text-slate-900">Needs Attention</h2>
                  <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                    {openCount}
                  </span>
                </div>
                <div className="p-3 space-y-1.5">
                  {needsAttention.map(thread => {
                    const channel = getChannelInfo(thread.channelType)
                    const customer = getCustomerName(thread.customer)
                    const msgCount = thread.messages.length
                    const lastMsg = thread.messages[thread.messages.length - 1]

                    return (
                      <Link
                        key={thread.id}
                        href={`/dashboard/tickets?thread=${thread.id}`}
                        className="flex items-start gap-2.5 p-2.5 rounded-md border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-all block"
                      >
                        <span className="w-2 h-2 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5 gap-2">
                            <span className="text-xs font-semibold text-slate-900 truncate">{customer}</span>
                            <span className="text-[11px] text-slate-400 shrink-0">{timeAgo(thread.updatedAt)}</span>
                          </div>
                          <p className="text-xs text-slate-500 truncate">
                            {lastMsg?.contentText || "No messages yet"}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <Image src={channel.logo} alt={channel.name} width={10} height={10} className="object-contain opacity-60" />
                            <span className="text-[10px] text-slate-400">{channel.name}</span>
                            <span className="text-slate-200">·</span>
                            <span className="text-[10px] text-slate-400">{msgCount} msg{msgCount !== 1 ? "s" : ""}</span>
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                  {openCount > 4 && (
                    <Link
                      href="/dashboard/tickets"
                      className="block w-full py-2 text-xs font-semibold text-center text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-colors"
                    >
                      View all {openCount} open tickets →
                    </Link>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
