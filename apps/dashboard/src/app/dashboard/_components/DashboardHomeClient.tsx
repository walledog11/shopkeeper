"use client"

import useSWR from "swr"
import Image from "next/image"
import Link from "next/link"
import { useState } from "react"
import { Inbox, CheckCircle2, MessageSquare, ArrowRight, X, Zap } from "lucide-react"
import { fetcher } from "@/lib/fetcher"
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

export default function DashboardHomeClient({ userName, initialOpenThreads, initialClosedThreads }: Props) {
  const greeting = getGreeting()
  const [bannerDismissed, setBannerDismissed] = useState(false)

  const { data: openThreads = [], isLoading: loadingOpen } = useSWR<Thread[]>(
    "/api/threads?status=open",
    fetcher,
    { refreshInterval: 15000, fallbackData: initialOpenThreads }
  )
  const { data: closedThreads = [], isLoading: loadingClosed } = useSWR<Thread[]>(
    "/api/threads?status=closed",
    fetcher,
    { fallbackData: initialClosedThreads }
  )

  const isLoading = loadingOpen || loadingClosed

  const openCount = openThreads.length
  const resolvedCount = closedThreads.length
  const allThreads = [...openThreads, ...closedThreads]
  const totalMessages = allThreads.reduce((sum, t) => sum + t.messages.length, 0)

  const recentActivity = [...allThreads]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5)

  const needsAttention = [...openThreads]
    .sort((a, b) => b.messages.length - a.messages.length)
    .slice(0, 4)

  // Show onboarding banner if no open or closed threads yet
  const showBanner = !bannerDismissed && openCount === 0 && resolvedCount === 0 && !isLoading

  return (
    <div className="h-full overflow-y-auto bg-white">
    <div className="max-w-5xl mx-auto px-8 py-7 space-y-6 pb-10">

      {/* Onboarding banner */}
      {showBanner && (
        <div className="relative flex items-center gap-6 bg-white border border-slate-200 rounded-2xl px-6 py-5 shadow-sm overflow-hidden">
          {/* Decorative gradient strip */}
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-yellow-400 to-yellow-300 rounded-l-2xl" />
          <div className="w-12 h-12 rounded-xl bg-yellow-50 border border-yellow-200 flex items-center justify-center shrink-0">
            <Zap className="w-6 h-6 text-yellow-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-900">Connect your first channel</p>
            <p className="text-sm text-slate-500 mt-0.5">
              Route support messages from Gmail, Instagram, or other channels into Clerk.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setBannerDismissed(true)}
              className="text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors"
            >
              Maybe later
            </button>
            <Link
              href="/dashboard/integrations"
              className="flex items-center gap-1.5 bg-[#1c3b38] hover:bg-[#163230] text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              Set up <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <button
            onClick={() => setBannerDismissed(true)}
            className="absolute top-3 right-3 text-slate-300 hover:text-slate-500 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
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
          className="hidden md:flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 border border-slate-200 hover:border-slate-300 rounded-lg px-3.5 py-2 transition-all"
        >
          View all tickets <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <Link
          href="/dashboard/tickets"
          className="group bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-5 flex items-center justify-between hover:shadow-sm transition-all"
        >
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Open Tickets</p>
            <p className="text-3xl font-bold text-slate-900 leading-none">
              {isLoading ? <span className="text-slate-200">—</span> : openCount}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center group-hover:bg-orange-100 transition-colors">
            <Inbox className="w-5 h-5 text-orange-500" />
          </div>
        </Link>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Resolved</p>
            <p className="text-3xl font-bold text-slate-900 leading-none">
              {isLoading ? <span className="text-slate-200">—</span> : resolvedCount}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Messages</p>
            <p className="text-3xl font-bold text-slate-900 leading-none">
              {isLoading ? <span className="text-slate-200">—</span> : totalMessages.toLocaleString()}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-blue-500" />
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Recent activity */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">Recent Activity</h2>
            <Link href="/dashboard/tickets" className="text-xs font-medium text-slate-400 hover:text-slate-700 transition-colors">
              View all
            </Link>
          </div>

          {isLoading ? (
            <div className="p-5 space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex gap-3 animate-pulse">
                  <div className="w-8 h-8 rounded-full bg-slate-100 shrink-0" />
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="h-3 bg-slate-100 rounded w-1/3" />
                    <div className="h-3 bg-slate-100 rounded w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : recentActivity.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-sm">
              No activity yet. Messages from connected channels will appear here.
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {recentActivity.map(thread => {
                const channel = getChannelInfo(thread.channelType)
                const customer = getCustomerName(thread.customer)
                const lastMsg = thread.messages[thread.messages.length - 1]
                const preview = lastMsg?.contentText || "No messages yet"
                const isAgent = lastMsg?.senderType === "agent" || lastMsg?.senderType === "ai"

                return (
                  <Link
                    key={thread.id}
                    href={`/dashboard/tickets?thread=${thread.id}`}
                    className="flex items-start gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors"
                  >
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                      <Image src={channel.logo} alt={channel.name} width={16} height={16} className="object-contain" />
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
                      <div className="flex items-center gap-2 mt-1.5">
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

        {/* Needs attention */}
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">Needs Attention</h2>
            {needsAttention.length > 0 && (
              <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {openCount}
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="p-4 space-y-3">
              {[1, 2].map(i => (
                <div key={i} className="p-3 rounded-xl border border-slate-100 animate-pulse space-y-2">
                  <div className="h-3 bg-slate-100 rounded w-1/2" />
                  <div className="h-3 bg-slate-100 rounded w-3/4" />
                </div>
              ))}
            </div>
          ) : needsAttention.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle2 className="w-8 h-8 text-green-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No open tickets right now.</p>
            </div>
          ) : (
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
                    className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-all block"
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
                      <div className="flex items-center gap-1.5 mt-1.5">
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
                  className="block w-full py-2.5 text-xs font-semibold text-center text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-colors"
                >
                  View all {openCount} open tickets →
                </Link>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
    </div>
  )
}
