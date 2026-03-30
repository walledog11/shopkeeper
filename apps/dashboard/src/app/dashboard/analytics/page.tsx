"use client"

import { useState } from 'react'
import Image from "next/image"
import { TrendingUp, Inbox, CheckCircle2, MessageSquare, BarChart2, AlertTriangle, CheckCircle, Bot, Clock, Calendar } from "lucide-react"
import { useThreads } from "@/hooks/useThreads"
import { getChannelInfo } from "@/lib/channels"

type Preset = '7d' | '30d' | '90d' | 'all' | 'custom'

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getRangeFrom(preset: Preset, customFrom: string): Date {
  if (preset === '7d')  { const d = new Date(); d.setDate(d.getDate() - 7);  return d }
  if (preset === '30d') { const d = new Date(); d.setDate(d.getDate() - 30); return d }
  if (preset === '90d') { const d = new Date(); d.setDate(d.getDate() - 90); return d }
  if (preset === 'all') return new Date(0)
  return new Date(customFrom)
}

function getRangeTo(preset: Preset, customTo: string): Date {
  if (preset === 'custom') {
    const d = new Date(customTo); d.setHours(23, 59, 59, 999); return d
  }
  return new Date()
}

const AUDIT_LABELS: Record<Preset, string> = {
  '7d': '7-Day', '30d': '30-Day', '90d': '90-Day', 'all': 'All-Time', 'custom': 'Custom Range',
}

const BADGE_LABELS: Record<Preset, string> = {
  '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days', 'all': 'All time', 'custom': '',
}

export default function AnalyticsPage() {
  const { threads: openThreads, isLoading: loadingOpen } = useThreads('open')
  const { threads: closedThreads, isLoading: loadingClosed } = useThreads('closed')

  const isLoading = loadingOpen || loadingClosed
  const allThreads = [...openThreads, ...closedThreads]

  // ── Date range state ──
  const [preset, setPreset] = useState<Preset>('7d')
  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0]
  })
  const [customTo, setCustomTo] = useState(() => new Date().toISOString().split('T')[0])

  const rangeFrom   = getRangeFrom(preset, customFrom)
  const rangeTo     = getRangeTo(preset, customTo)
  const rangeDays   = Math.max(1, Math.ceil((rangeTo.getTime() - rangeFrom.getTime()) / (1000 * 60 * 60 * 24)))
  const auditLabel  = AUDIT_LABELS[preset]
  const badgeLabel  = preset === 'custom'
    ? `${shortDate(rangeFrom.toISOString())} – ${shortDate(rangeTo.toISOString())}`
    : BADGE_LABELS[preset]

  // ── Filtered threads ──
  const rangeThreads = allThreads.filter(t => {
    const d = new Date(t.createdAt)
    return d >= rangeFrom && d <= rangeTo
  })
  const rangeClosed = rangeThreads.filter(t => t.status === 'closed')
  const rangeOpen   = rangeThreads.filter(t => t.status === 'open')

  const totalThreads   = rangeThreads.length
  const totalMessages  = rangeThreads.reduce((sum, t) => sum + t.messages.length, 0)
  const resolutionRate = totalThreads > 0 ? Math.round((rangeClosed.length / totalThreads) * 100) : 0

  // By channel
  const channelMap = new Map<string, number>()
  for (const t of rangeThreads) channelMap.set(t.channelType, (channelMap.get(t.channelType) ?? 0) + 1)
  const byChannel = [...channelMap.entries()].map(([channel, count]) => ({ channel, count }))

  // By tag
  const tagMap = new Map<string, number>()
  for (const t of rangeThreads) if (t.tag) tagMap.set(t.tag, (tagMap.get(t.tag) ?? 0) + 1)
  const byTag = [...tagMap.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)

  // ── Audit KPIs ──
  const avgMessages = totalThreads > 0
    ? Math.round((rangeThreads.reduce((sum, t) => sum + t.messages.length, 0) / totalThreads) * 10) / 10
    : 0

  const allOutbound = rangeThreads.flatMap(t => t.messages.filter(m => m.senderType === 'agent' || m.senderType === 'ai'))
  const aiMessages  = allOutbound.filter(m => m.senderType === 'ai')
  const aiUsageRate = allOutbound.length > 0 ? Math.round((aiMessages.length / allOutbound.length) * 100) : 0

  const responseTimes: number[] = []
  for (const t of rangeThreads) {
    const firstCustomer = t.messages.find(m => m.senderType === 'customer')
    const firstResponse = t.messages.find(m => m.senderType === 'agent' || m.senderType === 'ai')
    if (firstCustomer && firstResponse) {
      const diff = (new Date(firstResponse.sentAt).getTime() - new Date(firstCustomer.sentAt).getTime()) / 60000
      if (diff > 0) responseTimes.push(diff)
    }
  }
  const avgResponseMinutes = responseTimes.length > 0
    ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
    : null

  function formatResponseTime(mins: number) {
    if (mins < 60) return `${mins}m`
    const h = Math.floor(mins / 60), m = mins % 60
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }

  // ── Audit score ──
  const resolutionScore = totalThreads === 0 ? null :
    resolutionRate >= 80 ? 100 :
    resolutionRate >= 60 ? Math.round(60 + (resolutionRate - 60) / 20 * 40) :
    Math.round((resolutionRate / 60) * 60)

  const aiScore = allOutbound.length === 0 ? null :
    aiUsageRate >= 50 ? 100 :
    aiUsageRate >= 30 ? Math.round(60 + (aiUsageRate - 30) / 20 * 40) :
    Math.round((aiUsageRate / 30) * 60)

  const msgScore = totalThreads === 0 ? null :
    avgMessages <= 4 ? 100 :
    avgMessages <= 6 ? Math.round(60 + (6 - avgMessages) / 2 * 40) :
    Math.max(0, Math.round(60 - ((avgMessages - 6) / 4) * 60))

  const replyScore = avgResponseMinutes === null ? null :
    avgResponseMinutes <= 30 ? 100 :
    avgResponseMinutes <= 240 ? Math.round(60 + (240 - avgResponseMinutes) / 210 * 40) :
    Math.max(0, Math.round(60 - ((avgResponseMinutes - 240) / 240) * 60))

  const scoreParts = [
    { score: resolutionScore, weight: 40 },
    { score: aiScore, weight: 20 },
    { score: msgScore, weight: 20 },
    { score: replyScore, weight: 20 },
  ].filter((p): p is { score: number; weight: number } => p.score !== null)

  const totalWeight = scoreParts.reduce((s, p) => s + p.weight, 0)
  const auditScore = totalWeight > 0 && totalThreads > 0
    ? Math.round(scoreParts.reduce((s, p) => s + p.score * p.weight, 0) / totalWeight)
    : null

  const auditGrade = auditScore === null ? '—' :
    auditScore >= 90 ? 'A' : auditScore >= 75 ? 'B' : auditScore >= 60 ? 'C' : auditScore >= 40 ? 'D' : 'F'

  function kpiStatus(score: number | null): 'excellent' | 'good' | 'needs_work' | 'no_data' {
    if (score === null) return 'no_data'
    if (score >= 80) return 'excellent'
    if (score >= 55) return 'good'
    return 'needs_work'
  }

  const STATUS_LABEL = { excellent: 'Excellent', good: 'On Track', needs_work: 'Needs Work', no_data: 'No Data' }
  const STATUS_COLORS = {
    excellent: { bg: 'bg-emerald-50', border: 'border-emerald-100', badge: 'bg-emerald-100 text-emerald-700', bar: 'bg-emerald-400', icon: 'bg-emerald-100 text-emerald-600' },
    good:      { bg: 'bg-blue-50',    border: 'border-blue-100',    badge: 'bg-blue-100 text-blue-700',       bar: 'bg-blue-400',    icon: 'bg-blue-100 text-blue-600'    },
    needs_work:{ bg: 'bg-amber-50',   border: 'border-amber-100',   badge: 'bg-amber-100 text-amber-700',     bar: 'bg-amber-400',   icon: 'bg-amber-100 text-amber-600'  },
    no_data:   { bg: 'bg-slate-50',   border: 'border-slate-100',   badge: 'bg-slate-100 text-slate-500',     bar: 'bg-slate-300',   icon: 'bg-slate-100 text-slate-400'  },
  }

  const kpiCards = [
    {
      label: 'Resolution Rate',
      value: totalThreads > 0 ? `${resolutionRate}%` : '—',
      sub: `${rangeClosed.length} of ${totalThreads} tickets closed`,
      icon: <CheckCircle2 className="w-3 h-3 text-current" />,
      status: kpiStatus(resolutionScore),
      statusLabel: STATUS_LABEL[kpiStatus(resolutionScore)],
      barPct: Math.min(100, resolutionRate),
      benchmarkLabel: 'Target ≥ 80%',
    },
    {
      label: 'AI Usage',
      value: allOutbound.length > 0 ? `${aiUsageRate}%` : '—',
      sub: `${aiMessages.length} of ${allOutbound.length} replies`,
      icon: <Bot className="w-3 h-3 text-current" />,
      status: kpiStatus(aiScore),
      statusLabel: STATUS_LABEL[kpiStatus(aiScore)],
      barPct: Math.min(100, aiUsageRate * 2),
      benchmarkLabel: 'Target ≥ 50%',
    },
    {
      label: 'Avg Messages / Ticket',
      value: totalThreads > 0 ? avgMessages.toString() : '—',
      sub: 'Lower means faster resolution',
      icon: <MessageSquare className="w-3 h-3 text-current" />,
      status: kpiStatus(msgScore),
      statusLabel: STATUS_LABEL[kpiStatus(msgScore)],
      barPct: totalThreads > 0 ? Math.max(0, Math.min(100, 100 - ((avgMessages - 4) / 8) * 100)) : 0,
      benchmarkLabel: 'Target ≤ 4 msgs',
    },
    {
      label: 'First Reply Time',
      value: avgResponseMinutes !== null ? formatResponseTime(avgResponseMinutes) : '—',
      sub: avgResponseMinutes !== null ? `${responseTimes.length} tickets measured` : 'No data yet',
      icon: <Clock className="w-3 h-3 text-current" />,
      status: kpiStatus(replyScore),
      statusLabel: STATUS_LABEL[kpiStatus(replyScore)],
      barPct: avgResponseMinutes !== null ? Math.max(0, Math.min(100, 100 - ((avgResponseMinutes - 5) / 235) * 100)) : 0,
      benchmarkLabel: 'Target < 30 min',
    },
  ]

  const auditIssues = kpiCards.filter(k => k.status === 'needs_work').length

  // Audit tips
  type Tip = { text: string; ok: boolean; benchmark: string }
  const auditTips: Tip[] = []
  if (totalThreads === 0) {
    auditTips.push({ ok: true, text: 'No tickets in this period yet.', benchmark: '' })
  } else {
    if (resolutionRate < 60)
      auditTips.push({ ok: false, text: `Resolution is ${resolutionRate}% — enable AI auto-replies to clear your backlog faster`, benchmark: 'Healthy ≥ 80% · OK 60–80% · Needs work < 60%' })
    if (allOutbound.length > 0 && aiUsageRate < 30)
      auditTips.push({ ok: false, text: `AI handles only ${aiUsageRate}% of replies — turn on AI drafts to scale your team`, benchmark: 'Healthy ≥ 50% · OK 30–50% · Low < 30%' })
    if (avgMessages > 6)
      auditTips.push({ ok: false, text: `${avgMessages} messages per ticket on average — add FAQs to your AI context to shorten threads`, benchmark: 'Healthy ≤ 4 msgs · OK 4–6 · Too long > 6' })
    if (avgResponseMinutes !== null && avgResponseMinutes > 240)
      auditTips.push({ ok: false, text: `${formatResponseTime(avgResponseMinutes)} average first reply — configure AI triage to respond instantly`, benchmark: 'Healthy < 30 min · OK < 4h · Slow > 4h' })
    if (auditTips.length === 0)
      auditTips.push({ ok: true, text: 'All metrics are within healthy ranges — keep it up!', benchmark: '' })
  }
  const visibleTips = auditTips.slice(0, 4)

  // ── Adaptive chart (per-day ≤30d · per-week ≤90d · per-month otherwise) ──
  type Bucket = { label: string; count: number }
  let chartData: Bucket[] = []
  let chartTitle = 'Tickets Over Time'

  if (rangeDays <= 30) {
    chartTitle = rangeDays <= 7 ? 'Tickets Last 7 Days' : `Tickets — Daily`
    chartData = Array.from({ length: rangeDays }, (_, i) => {
      const date = new Date(rangeFrom)
      date.setDate(date.getDate() + i)
      const dateStr = date.toISOString().split('T')[0]
      return { label: shortDate(date.toISOString()), count: rangeThreads.filter(t => t.createdAt.startsWith(dateStr)).length }
    })
  } else if (rangeDays <= 91) {
    chartTitle = 'Tickets — Weekly'
    const weeks = Math.ceil(rangeDays / 7)
    chartData = Array.from({ length: weeks }, (_, i) => {
      const start = new Date(rangeFrom); start.setDate(start.getDate() + i * 7)
      const end   = new Date(start);     end.setDate(end.getDate() + 6)
      return {
        label: shortDate(start.toISOString()),
        count: rangeThreads.filter(t => { const d = new Date(t.createdAt); return d >= start && d <= end }).length,
      }
    })
  } else {
    chartTitle = 'Tickets — Monthly'
    const monthMap = new Map<string, number>()
    for (const t of rangeThreads) {
      const d = new Date(t.createdAt)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      monthMap.set(key, (monthMap.get(key) ?? 0) + 1)
    }
    chartData = [...monthMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, count]) => ({
        label: new Date(key + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        count,
      }))
    if (chartData.length === 0) chartData = [{ label: 'No data', count: 0 }]
  }

  const maxCount   = Math.max(...chartData.map(d => d.count), 1)
  const maxTag     = Math.max(...byTag.map(t => t.count), 1)
  const maxChannel = Math.max(...byChannel.map(c => c.count), 1)
  const today      = new Date().toISOString().split('T')[0]

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="px-5 md:px-6 py-4 space-y-3 pb-10">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Analytics</h1>
            <p className="text-sm text-slate-400 mt-0.5">Support performance overview</p>
          </div>
          <div className="w-10 h-10 rounded-md bg-slate-50 border border-slate-200 flex items-center justify-center">
            <BarChart2 className="w-5 h-5 text-slate-400" />
          </div>
        </div>

        {/* ── Date range selector ── */}
        <div className="bg-white border border-slate-200 rounded-md shadow-sm px-3.5 py-2.5 flex flex-wrap items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <div className="flex items-center gap-1 flex-wrap">
            {([
              { value: '7d',     label: 'Last 7 days'  },
              { value: '30d',    label: 'Last 30 days' },
              { value: '90d',    label: 'Last 90 days' },
              { value: 'all',    label: 'All time'     },
              { value: 'custom', label: 'Custom'       },
            ] as { value: Preset; label: string }[]).map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setPreset(value)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  preset === value
                    ? 'bg-teal-700 text-white'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800 border border-transparent hover:border-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="flex items-center gap-2 pl-1 border-l border-slate-100 ml-1">
              <input
                type="date"
                value={customFrom}
                max={customTo}
                onChange={e => setCustomFrom(e.target.value)}
                className="text-xs border border-slate-200 rounded-md px-2 py-1 text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-teal-400 focus:border-teal-400"
              />
              <span className="text-[10px] text-slate-400 font-medium">to</span>
              <input
                type="date"
                value={customTo}
                min={customFrom}
                max={today}
                onChange={e => setCustomTo(e.target.value)}
                className="text-xs border border-slate-200 rounded-md px-2 py-1 text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-teal-400 focus:border-teal-400"
              />
            </div>
          )}
        </div>

        {/* ── Performance Audit ── */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">

          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                <BarChart2 className="w-4 h-4 text-indigo-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">{auditLabel} Performance Audit</p>
                <p className="text-xs text-slate-400 mt-0.5">KPI health check for your support operation</p>
              </div>
            </div>
            <span className="text-[10px] font-semibold text-indigo-500 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-full uppercase tracking-wide">
              {badgeLabel}
            </span>
          </div>

          {isLoading ? (
            <div className="p-5 animate-pulse space-y-3">
              <div className="flex gap-3">
                <div className="w-24 h-32 rounded-xl bg-slate-100 shrink-0" />
                <div className="flex-1 grid grid-cols-2 gap-2.5">
                  {[...Array(4)].map((_, i) => <div key={i} className="h-[68px] bg-slate-100 rounded-xl" />)}
                </div>
              </div>
              <div className="h-16 bg-slate-100 rounded-xl" />
            </div>
          ) : (
            <div className="p-5 space-y-3">

              <div className="flex gap-3 items-start">
                {/* Grade card */}
                <div className={`shrink-0 self-start w-24 rounded-xl border px-3 py-3.5 flex flex-col items-center gap-1 text-center ${
                  auditScore === null ? 'bg-slate-50 border-slate-200' :
                  auditScore >= 75    ? 'bg-emerald-50 border-emerald-100' :
                  auditScore >= 55    ? 'bg-blue-50 border-blue-100' :
                  auditScore >= 40    ? 'bg-amber-50 border-amber-100' :
                  'bg-red-50 border-red-100'
                }`}>
                  <span className={`text-5xl font-black leading-none ${
                    auditScore === null ? 'text-slate-300' :
                    auditScore >= 75    ? 'text-emerald-500' :
                    auditScore >= 55    ? 'text-blue-500' :
                    auditScore >= 40    ? 'text-amber-500' :
                    'text-red-500'
                  }`}>{auditGrade}</span>
                  <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">Overall</span>
                  {auditScore !== null && (
                    <span className={`text-[11px] font-bold ${
                      auditScore >= 75 ? 'text-emerald-500' :
                      auditScore >= 55 ? 'text-blue-500' :
                      auditScore >= 40 ? 'text-amber-500' :
                      'text-red-500'
                    }`}>{auditScore}/100</span>
                  )}
                  <div className="pt-1.5 border-t border-slate-200/60 w-full text-center space-y-0.5 mt-0.5">
                    <p className="text-[9px] text-slate-400">{totalThreads} ticket{totalThreads !== 1 ? 's' : ''}</p>
                    {auditIssues > 0 && (
                      <p className="text-[9px] font-semibold text-amber-500">{auditIssues} issue{auditIssues !== 1 ? 's' : ''}</p>
                    )}
                  </div>
                </div>

                {/* KPI 2×2 */}
                <div className="flex-1 grid grid-cols-2 gap-2.5">
                  {kpiCards.map(kpi => {
                    const colors = STATUS_COLORS[kpi.status]
                    return (
                      <div key={kpi.label} className={`rounded-xl border px-3 py-2.5 ${colors.bg} ${colors.border}`}>
                        <div className="flex items-center justify-between mb-1.5 gap-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 ${colors.icon}`}>
                              {kpi.icon}
                            </div>
                            <span className="text-[10px] font-semibold text-slate-500 truncate">{kpi.label}</span>
                          </div>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0 ${colors.badge}`}>
                            {kpi.statusLabel}
                          </span>
                        </div>
                        <div className="flex items-center gap-2.5">
                          <span className="text-xl font-black text-slate-900 leading-none shrink-0 min-w-[2rem]">{kpi.value}</span>
                          <div className="flex-1 h-2 rounded-full bg-black/[0.07] overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-700 ${colors.bar}`} style={{ width: `${kpi.barPct}%` }} />
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[9px] text-slate-400 truncate pr-2">{kpi.sub}</span>
                          <span className="text-[9px] text-slate-400 shrink-0">{kpi.benchmarkLabel}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Recommendations */}
              {visibleTips.length > 0 && (
                <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3.5">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2.5">
                    {visibleTips.every(t => t.ok) ? 'All systems healthy' : `${auditIssues} recommendation${auditIssues !== 1 ? 's' : ''}`}
                  </p>
                  <div className="space-y-1.5">
                    {visibleTips.map((tip, i) => (
                      <div key={i} className={`flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-xs ${
                        tip.ok ? 'bg-emerald-50 border border-emerald-100 text-emerald-700' : 'bg-white border border-slate-200 text-slate-700'
                      }`}>
                        {tip.ok
                          ? <CheckCircle className="w-3.5 h-3.5 shrink-0 text-emerald-500 mt-0.5" />
                          : <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400 mt-0.5" />
                        }
                        <span className="leading-relaxed">{tip.text}</span>
                        {tip.benchmark && (
                          <span className="ml-auto shrink-0 text-[9px] text-slate-400 font-medium pl-3 mt-0.5 text-right leading-tight">{tip.benchmark}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Overview stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Total Tickets',   value: totalThreads,  icon: <Inbox className="w-5 h-5 text-blue-500" />,     bg: 'bg-blue-50',   accent: 'border-t-2 border-t-blue-400'   },
            { label: 'Open',            value: rangeOpen.length,   icon: <Inbox className="w-5 h-5 text-amber-500" />,    bg: 'bg-amber-50',  accent: 'border-t-2 border-t-amber-400'  },
            { label: 'Resolved',        value: rangeClosed.length, icon: <CheckCircle2 className="w-5 h-5 text-green-500" />, bg: 'bg-green-50',  accent: 'border-t-2 border-t-green-400'  },
            { label: 'Total Messages',  value: totalMessages, icon: <MessageSquare className="w-5 h-5 text-purple-500" />, bg: 'bg-purple-50', accent: 'border-t-2 border-t-purple-400' },
          ].map(stat => (
            <div key={stat.label} className={`bg-white border border-slate-200 rounded-md px-4 py-4 flex items-center justify-between shadow-sm hover:shadow-md hover:-translate-y-px transition-all ${stat.accent}`}>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{stat.label}</p>
                {isLoading ? (
                  <div className="h-8 w-16 bg-slate-100 rounded animate-pulse" />
                ) : (
                  <p className="text-3xl font-bold text-slate-900 leading-none">{stat.value.toLocaleString()}</p>
                )}
              </div>
              <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center`}>{stat.icon}</div>
            </div>
          ))}
        </div>

        {/* Resolution rate bar */}
        {!isLoading && (
          <div className="bg-white border border-slate-200 rounded-md p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-500" />
                <p className="text-sm font-semibold text-slate-900">Resolution Rate</p>
              </div>
              <span className="text-sm font-bold text-slate-900">{resolutionRate}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full transition-all duration-700" style={{ width: `${resolutionRate}%` }} />
            </div>
            <p className="text-xs text-slate-400 mt-2">{rangeClosed.length} of {totalThreads} tickets resolved</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

          {/* Adaptive chart */}
          <div className="bg-white border border-slate-200 rounded-md p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-900 mb-4">{chartTitle}</p>
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
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {chartData.map((bucket, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-[11px] text-slate-400 w-14 shrink-0 text-right">{bucket.label}</span>
                    <div className="flex-1 flex items-center h-7 bg-slate-50 rounded overflow-hidden">
                      {bucket.count > 0 ? (
                        <div
                          title={`${bucket.count} ticket${bucket.count !== 1 ? 's' : ''}`}
                          className="h-full bg-amber-400 hover:bg-amber-500 transition-all duration-500 flex items-center justify-end pr-2 rounded cursor-default"
                          style={{ width: `${Math.max((bucket.count / maxCount) * 100, 6)}%` }}
                        >
                          <span className="text-[10px] font-bold text-amber-900">{bucket.count}</span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-300 pl-2">—</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top tags */}
          <div className="bg-white border border-slate-200 rounded-md p-5 shadow-sm">
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
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium text-slate-700">{item.tag}</span>
                      <span className="text-xs font-semibold text-slate-500">{item.count}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        title={`${item.count} ticket${item.count !== 1 ? 's' : ''}`}
                        className="h-full bg-teal-700 rounded-full transition-all duration-500 hover:bg-teal-800 cursor-default"
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
          <div className="bg-white border border-slate-200 rounded-md p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-900 mb-4">Tickets by Channel</p>
            <div className="flex items-end gap-6">
              {byChannel.map(item => {
                const info = getChannelInfo(item.channel as 'email' | 'ig_dm' | 'tiktok')
                return (
                  <div key={item.channel} className="flex flex-col items-center gap-2 flex-1 max-w-[120px]">
                    <span className="text-sm font-bold text-slate-900">{item.count}</span>
                    <div className="w-full bg-slate-100 rounded-md overflow-hidden" style={{ height: 120 }}>
                      <div
                        title={`${item.count} ticket${item.count !== 1 ? 's' : ''}`}
                        className="w-full bg-teal-700 hover:bg-teal-800 rounded-md transition-all duration-700 cursor-default"
                        style={{ height: `${(item.count / maxChannel) * 120}px`, marginTop: `${120 - (item.count / maxChannel) * 120}px` }}
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
