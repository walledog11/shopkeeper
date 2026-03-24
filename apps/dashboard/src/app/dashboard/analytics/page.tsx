"use client"

import Image from "next/image"
import { TrendingUp, Inbox, CheckCircle2, MessageSquare, BarChart2 } from "lucide-react"
import { useThreads } from "@/hooks/useThreads"
import { getChannelInfo } from "@/lib/channels"
import type { Thread } from "@/types"

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function AnalyticsPage() {
  const { threads: openThreads, isLoading: loadingOpen } = useThreads('open')
  const { threads: closedThreads, isLoading: loadingClosed } = useThreads('closed')

  const isLoading = loadingOpen || loadingClosed
  const allThreads = [...openThreads, ...closedThreads]

  // Overview
  const totalThreads = allThreads.length
  const totalMessages = allThreads.reduce((sum, t) => sum + t.messages.length, 0)
  const resolutionRate = totalThreads > 0 ? Math.round((closedThreads.length / totalThreads) * 100) : 0

  // By channel
  const channelMap = new Map<string, number>()
  for (const t of allThreads) {
    channelMap.set(t.channelType, (channelMap.get(t.channelType) ?? 0) + 1)
  }
  const byChannel = [...channelMap.entries()].map(([channel, count]) => ({ channel, count }))

  // By tag
  const tagMap = new Map<string, number>()
  for (const t of allThreads) {
    if (t.tag) tagMap.set(t.tag, (tagMap.get(t.tag) ?? 0) + 1)
  }
  const byTag = [...tagMap.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  // Last 7 days
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date()
    date.setDate(date.getDate() - (6 - i))
    const dateStr = date.toISOString().split('T')[0]
    const dayThreads = allThreads.filter(t => t.createdAt.startsWith(dateStr))
    return {
      date: dateStr,
      opened: dayThreads.length,
    }
  })

  const maxDay = Math.max(...last7Days.map(d => d.opened), 1)
  const maxTag = Math.max(...byTag.map(t => t.count), 1)
  const maxChannel = Math.max(...byChannel.map(c => c.count), 1)

  return (
    <div className="h-full overflow-y-auto bg-white">
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-5 md:py-7 space-y-5 pb-10">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Analytics</h1>
            <p className="text-sm text-slate-400 mt-0.5">Support performance overview</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center">
            <BarChart2 className="w-5 h-5 text-slate-400" />
          </div>
        </div>

        {/* Overview stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Total Tickets', value: totalThreads, icon: <Inbox className="w-4 h-4 text-blue-500" />, bg: 'bg-blue-50' },
            { label: 'Open', value: openThreads.length, icon: <Inbox className="w-4 h-4 text-amber-500" />, bg: 'bg-amber-50' },
            { label: 'Resolved', value: closedThreads.length, icon: <CheckCircle2 className="w-4 h-4 text-green-500" />, bg: 'bg-green-50' },
            { label: 'Total Messages', value: totalMessages, icon: <MessageSquare className="w-4 h-4 text-purple-500" />, bg: 'bg-purple-50' },
          ].map(stat => (
            <div key={stat.label} className="bg-white border border-slate-200 rounded-xl p-4 md:p-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{stat.label}</p>
                <div className={`w-7 h-7 rounded-lg ${stat.bg} flex items-center justify-center`}>
                  {stat.icon}
                </div>
              </div>
              {isLoading ? (
                <div className="h-8 w-16 bg-slate-100 rounded animate-pulse" />
              ) : (
                <p className="text-2xl md:text-3xl font-bold text-slate-900 leading-none">
                  {stat.value.toLocaleString()}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Resolution rate */}
        {!isLoading && (
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-500" />
                <p className="text-sm font-semibold text-slate-900">Resolution Rate</p>
              </div>
              <span className="text-sm font-bold text-slate-900">{resolutionRate}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all duration-700"
                style={{ width: `${resolutionRate}%` }}
              />
            </div>
            <p className="text-xs text-slate-400 mt-2">
              {closedThreads.length} of {totalThreads} tickets resolved
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Last 7 days */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-sm font-semibold text-slate-900 mb-4">Tickets Last 7 Days</p>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(7)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 animate-pulse">
                    <div className="w-12 h-3 bg-slate-100 rounded" />
                    <div className="flex-1 h-5 bg-slate-100 rounded" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {last7Days.map(day => (
                  <div key={day.date} className="flex items-center gap-3">
                    <span className="text-[11px] text-slate-400 w-14 shrink-0 text-right">{shortDate(day.date)}</span>
                    <div className="flex-1 flex items-center gap-1 h-6">
                      {day.opened > 0 ? (
                        <div
                          className="h-full bg-amber-400 rounded-sm transition-all duration-500 flex items-center justify-end pr-1.5"
                          style={{ width: `${Math.max((day.opened / maxDay) * 100, 4)}%` }}
                        >
                          <span className="text-[9px] font-bold text-amber-900">{day.opened}</span>
                        </div>
                      ) : (
                        <div className="h-full w-1 bg-slate-100 rounded-sm" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top tags */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-sm font-semibold text-slate-900 mb-4">Top Topics</p>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="animate-pulse space-y-1">
                    <div className="flex justify-between">
                      <div className="h-3 w-20 bg-slate-100 rounded" />
                      <div className="h-3 w-6 bg-slate-100 rounded" />
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full" />
                  </div>
                ))}
              </div>
            ) : byTag.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">No tagged tickets yet.</p>
            ) : (
              <div className="space-y-3">
                {byTag.map(item => (
                  <div key={item.tag}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-slate-700">{item.tag}</span>
                      <span className="text-xs font-semibold text-slate-500">{item.count}</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#1c3b38] rounded-full transition-all duration-500"
                        style={{ width: `${(item.count / maxTag) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* By channel */}
        {!isLoading && byChannel.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-sm font-semibold text-slate-900 mb-4">Tickets by Channel</p>
            <div className="flex items-end gap-6">
              {byChannel.map(item => {
                const info = getChannelInfo(item.channel as 'email' | 'ig_dm' | 'tiktok')
                return (
                  <div key={item.channel} className="flex flex-col items-center gap-2 flex-1 max-w-[120px]">
                    <span className="text-sm font-bold text-slate-900">{item.count}</span>
                    <div className="w-full bg-slate-100 rounded-lg overflow-hidden" style={{ height: 80 }}>
                      <div
                        className="w-full bg-[#1c3b38] rounded-lg transition-all duration-700"
                        style={{ height: `${(item.count / maxChannel) * 80}px`, marginTop: `${80 - (item.count / maxChannel) * 80}px` }}
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Image src={info.logo} alt={info.name} width={14} height={14} className="object-contain" />
                      <span className="text-xs text-slate-500 font-medium">{info.name}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
