"use client"

import { useState } from 'react'
import { Bot, Clock, CheckCircle2, MessageSquare } from "lucide-react"
import { useThreads } from "@/hooks/useThreads"
import { DateRangeSelector } from "./_components/DateRangeSelector"
import { AuditSection } from "./_components/AuditSection"
import { OverviewStats } from "./_components/OverviewStats"
import { TicketChart } from "./_components/TicketChart"
import { TopTopicsCard } from "./_components/TopTopicsCard"
import { ChannelBreakdown } from "./_components/ChannelBreakdown"

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
    <div className="h-full overflow-y-auto bg-background">
      <div className="px-5 md:px-6 py-4 space-y-3 pb-10">

        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight text-foreground">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Support performance overview</p>
        </div>

        <DateRangeSelector
          preset={preset}
          setPreset={setPreset}
          customFrom={customFrom}
          setCustomFrom={setCustomFrom}
          customTo={customTo}
          setCustomTo={setCustomTo}
          today={today}
        />

        <AuditSection
          auditLabel={auditLabel}
          badgeLabel={badgeLabel}
          isLoading={isLoading}
          auditScore={auditScore}
          auditGrade={auditGrade}
          auditIssues={auditIssues}
          totalThreads={totalThreads}
          kpiCards={kpiCards}
          visibleTips={visibleTips}
        />

        <OverviewStats
          totalThreads={totalThreads}
          openCount={rangeOpen.length}
          closedCount={rangeClosed.length}
          totalMessages={totalMessages}
          resolutionRate={resolutionRate}
          isLoading={isLoading}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <TicketChart
            chartTitle={chartTitle}
            chartData={chartData}
            maxCount={maxCount}
            isLoading={isLoading}
          />
          <TopTopicsCard
            byTag={byTag}
            maxTag={maxTag}
            isLoading={isLoading}
          />
        </div>

        {!isLoading && (
          <ChannelBreakdown
            byChannel={byChannel}
            maxChannel={maxChannel}
          />
        )}

      </div>
    </div>
  )
}
