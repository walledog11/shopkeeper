"use client"

import useSWR from "swr"
import Image from "next/image"
import Link from "next/link"
import { useUser } from "@clerk/nextjs"
import { Inbox, CheckCircle2, MessageSquare, ArrowRight } from "lucide-react"
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

export default function DashboardHome() {
  const { user } = useUser()
  const name = user?.firstName ?? user?.fullName ?? "there"
  const greeting = getGreeting()

  const { data: openThreads = [], isLoading: loadingOpen } = useSWR<Thread[]>(
    "/api/threads?status=open",
    fetcher,
    { refreshInterval: 10000 }
  )
  const { data: closedThreads = [], isLoading: loadingClosed } = useSWR<Thread[]>(
    "/api/threads?status=closed",
    fetcher
  )

  const isLoading = loadingOpen || loadingClosed

  const openCount = openThreads.length
  const resolvedCount = closedThreads.length
  const allThreads = [...openThreads, ...closedThreads]
  const totalMessages = allThreads.reduce((sum, t) => sum + t.messages.length, 0)

  // Most recently updated threads across all statuses
  const recentActivity = [...allThreads]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5)

  // Open threads with the most messages = most complex, need attention most
  const needsAttention = [...openThreads]
    .sort((a, b) => b.messages.length - a.messages.length)
    .slice(0, 4)

  return (
    <div className="space-y-6 pb-10">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{greeting}, {name}.</h1>
        <p className="text-sm text-slate-400 mt-1">
          {isLoading
            ? "Loading your queue..."
            : openCount === 0
              ? "You're all caught up. No open tickets."
              : `You have ${openCount} open ticket${openCount !== 1 ? "s" : ""} waiting.`
          }
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/dashboard/tickets" className="group bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between hover:border-slate-300 hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-4">
            <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center">
              <Inbox className="w-4 h-4 text-orange-600" />
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 group-hover:translate-x-0.5 transition-all" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wide">Open Tickets</p>
            <p className="text-3xl font-bold text-slate-900">
              {isLoading ? <span className="text-slate-300">—</span> : openCount}
            </p>
          </div>
        </Link>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div className="w-9 h-9 rounded-xl bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wide">Total Resolved</p>
            <p className="text-3xl font-bold text-slate-900">
              {isLoading ? <span className="text-slate-300">—</span> : resolvedCount}
            </p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-blue-600" />
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wide">Messages Handled</p>
            <p className="text-3xl font-bold text-slate-900">
              {isLoading ? <span className="text-slate-300">—</span> : totalMessages.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Recent activity */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
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
                  <div className="flex-1 space-y-2">
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
                    href="/dashboard/tickets"
                    className="flex items-start gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors group"
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
                        <span className={`text-[10px] font-semibold ${thread.status === "open" ? "text-yellow-600" : "text-green-600"}`}>
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
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">Needs Attention</h2>
            {needsAttention.length > 0 && (
              <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {openCount}
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="p-5 space-y-3">
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
            <div className="p-4 space-y-2">
              {needsAttention.map(thread => {
                const channel = getChannelInfo(thread.channelType)
                const customer = getCustomerName(thread.customer)
                const msgCount = thread.messages.length
                const lastMsg = thread.messages[thread.messages.length - 1]

                return (
                  <Link
                    key={thread.id}
                    href="/dashboard/tickets"
                    className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50 cursor-pointer transition-all block"
                  >
                    <span className="w-2 h-2 rounded-full bg-yellow-400 mt-1.5 shrink-0" />
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
                        <span className="text-[10px] text-slate-400">{msgCount} message{msgCount !== 1 ? "s" : ""}</span>
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
  )
}
