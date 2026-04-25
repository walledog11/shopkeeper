"use client"

import { useState } from 'react'
import {
  Bot, Download, FileText, Users,
  Clock, CheckCircle2, MessageSquare, RotateCcw,
  MapPin, Package, ShoppingCart, Shield, Loader2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DateRangeSelector } from '@/components/dashboard/DateRangeSelector'
import { getDateRangeFrom, getDateRangeTo, type DateRangePreset as Preset } from '@/lib/analytics/date-range'
import { useReports } from '@/hooks/useReports'

function formatMinutes(mins: number | null): string {
  if (mins === null) return '—'
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60), m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function formatChannel(ch: string): string {
  const map: Record<string, string> = {
    email: 'Email', ig_dm: 'Instagram', whatsapp: 'WhatsApp',
    sms: 'SMS', shopify: 'Shopify', dashboard_agent: 'Internal', sms_agent: 'Internal',
  }
  return map[ch] ?? ch
}

function formatTool(tool: string): string {
  const map: Record<string, string> = {
    send_reply: 'Send reply',
    get_shopify_orders: 'Fetch orders',
    get_shopify_customer: 'Fetch customer',
    search_shopify_customers: 'Search customers',
    search_shopify_products: 'Search products',
    get_order_by_name: 'Look up order',
    search_kb: 'Search knowledge base',
    create_refund: 'Issue refund',
    cancel_order: 'Cancel order',
    edit_shopify_order: 'Edit order',
    create_shopify_order: 'Create order',
    update_shopify_order_address: 'Update address',
    update_shopify_customer_info: 'Update customer',
    add_shopify_customer_note: 'Add Shopify note',
    add_internal_note: 'Add internal note',
    send_email: 'Send email',
    update_thread_status: 'Update status',
    update_thread_tag: 'Update tag',
  }
  return map[tool] ?? tool
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function downloadCSV(filename: string, rows: (string | number)[][]) {
  const csv = rows.map(row =>
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\n')
  triggerDownload(new Blob([csv], { type: 'text/csv' }), filename)
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-muted ${className}`} />
}

// ── Export button ──────────────────────────────────────────────────────────────

function ExportButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground border border-border hover:border-white/[0.2] rounded-md px-2.5 py-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <Download className="w-3 h-3" />
      Export CSV
    </button>
  )
}

// ── Support Summary Card ───────────────────────────────────────────────────────

function SupportSummaryCard({
  data,
  isLoading,
  rangeLabel,
}: {
  data: ReturnType<typeof useReports>['data']
  isLoading: boolean
  rangeLabel: string
}) {
  const support = data?.support
  const maxChannel = Math.max(...(support?.byChannel.map(c => c.count) ?? [1]), 1)

  function handleExport() {
    if (!support) return
    downloadCSV(`support-summary-${rangeLabel.replace(/\s/g, '-')}.csv`, [
      ['Period', 'Total Tickets', 'Closed', 'Open/Pending', 'Resolution Rate (%)', 'Avg First Reply (min)'],
      [rangeLabel, support.total, support.closed, support.openAndPending, support.resolutionRate, support.avgFirstReplyMinutes ?? 'N/A'],
      [],
      ['Channel', 'Tickets'],
      ...support.byChannel.map(c => [formatChannel(c.channel), c.count]),
      [],
      ['Topic', 'Tickets'],
      ...support.byTag.map(t => [t.tag, t.count]),
    ])
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="border-b border-border pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="w-3.5 h-3.5 text-primary" />
            </div>
            <CardTitle className="text-sm">Support Summary</CardTitle>
          </div>
          <ExportButton onClick={handleExport} disabled={isLoading || !support} />
        </div>
      </CardHeader>

      <CardContent className="pt-5 flex-1 space-y-5">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total Tickets',   value: support?.total,          icon: <MessageSquare className="w-4 h-4 text-white/40" /> },
            { label: 'Resolved',        value: support?.closed,         icon: <CheckCircle2 className="w-4 h-4 text-emerald-500/70" /> },
            { label: 'Resolution Rate', value: support ? `${support.resolutionRate}%` : undefined, icon: <CheckCircle2 className="w-4 h-4 text-primary/70" /> },
          ].map(({ label, value, icon }) => (
            <div key={label} className="rounded-xl border border-border bg-muted/30 px-3 py-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
                {icon}
              </div>
              {isLoading
                ? <Skeleton className="h-7 w-12" />
                : <p className="text-2xl font-extrabold text-foreground leading-none">{value?.toLocaleString() ?? '—'}</p>
              }
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-4 py-3">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground">Avg first reply</span>
          </div>
          {isLoading
            ? <Skeleton className="h-5 w-12" />
            : <span className="text-sm font-bold text-foreground">{formatMinutes(support?.avgFirstReplyMinutes ?? null)}</span>
          }
        </div>

        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2.5">By channel</p>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
            </div>
          ) : support?.byChannel.length ? (
            <div className="space-y-2">
              {support.byChannel.map(c => (
                <div key={c.channel} className="flex items-center gap-2.5">
                  <span className="text-xs text-muted-foreground w-20 shrink-0">{formatChannel(c.channel)}</span>
                  <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary/60 transition-all duration-500"
                      style={{ width: `${Math.round((c.count / maxChannel) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-foreground w-6 text-right shrink-0">{c.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No ticket data</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Agent Activity Card ────────────────────────────────────────────────────────

function AgentActivityCard({
  data,
  isLoading,
  rangeLabel,
}: {
  data: ReturnType<typeof useReports>['data']
  isLoading: boolean
  rangeLabel: string
}) {
  const agent = data?.agent
  const maxTool = Math.max(...(agent?.topTools.map(t => t.count) ?? [1]), 1)

  function handleExport() {
    if (!agent) return
    downloadCSV(`agent-activity-${rangeLabel.replace(/\s/g, '-')}.csv`, [
      ['Metric', 'Count'],
      ['Agent runs', agent.totalRuns],
      ['Replies sent', agent.repliesSent],
      ['Refunds issued', agent.refundsIssued],
      ['Orders cancelled', agent.cancellations],
      ['Orders edited', agent.orderEdits],
      ['Orders created', agent.ordersCreated],
      ['Address updates', agent.addressUpdates],
      [],
      ['Tool', 'Calls'],
      ...agent.topTools.map(t => [formatTool(t.tool), t.count]),
    ])
  }

  const actionItems = [
    { label: 'Refunds issued',   value: agent?.refundsIssued,  icon: <RotateCcw className="w-4 h-4 text-amber-400" />,      color: 'text-amber-400' },
    { label: 'Orders cancelled', value: agent?.cancellations,  icon: <Package className="w-4 h-4 text-red-400" />,          color: 'text-red-400' },
    { label: 'Orders edited',    value: agent?.orderEdits,     icon: <ShoppingCart className="w-4 h-4 text-blue-400" />,    color: 'text-blue-400' },
    { label: 'Orders created',   value: agent?.ordersCreated,  icon: <ShoppingCart className="w-4 h-4 text-emerald-400" />, color: 'text-emerald-400' },
    { label: 'Address updates',  value: agent?.addressUpdates, icon: <MapPin className="w-4 h-4 text-muted-foreground" />,  color: 'text-foreground' },
  ]

  return (
    <Card className="flex flex-col">
      <CardHeader className="border-b border-border pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <Bot className="w-3.5 h-3.5 text-violet-400" />
            </div>
            <CardTitle className="text-sm">Agent Activity</CardTitle>
          </div>
          <ExportButton onClick={handleExport} disabled={isLoading || !agent} />
        </div>
      </CardHeader>

      <CardContent className="pt-5 flex-1 space-y-5">
        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Agent Runs',   value: agent?.totalRuns,   icon: <Bot className="w-4 h-4 text-violet-400/70" /> },
            { label: 'Replies Sent', value: agent?.repliesSent, icon: <MessageSquare className="w-4 h-4 text-white/40" /> },
            { label: 'Refunds',      value: agent?.refundsIssued, icon: <RotateCcw className="w-4 h-4 text-amber-400/70" /> },
          ].map(({ label, value, icon }) => (
            <div key={label} className="rounded-xl border border-border bg-muted/30 px-3 py-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
                {icon}
              </div>
              {isLoading
                ? <Skeleton className="h-7 w-12" />
                : <p className="text-2xl font-extrabold text-foreground leading-none">{value?.toLocaleString() ?? '0'}</p>
              }
            </div>
          ))}
        </div>

        {/* Order actions */}
        <div className="space-y-1.5">
          {actionItems.map(({ label, value, icon, color }) => (
            <div key={label} className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3.5 py-2.5">
              <div className="flex items-center gap-2.5">
                {icon}
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
              {isLoading
                ? <Skeleton className="h-5 w-6" />
                : <span className={`text-sm font-bold ${value ? color : 'text-muted-foreground/50'}`}>{value ?? 0}</span>
              }
            </div>
          ))}
        </div>

        {/* Top tools */}
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2.5">Top tools used</p>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
            </div>
          ) : agent?.topTools.length ? (
            <div className="space-y-2">
              {agent.topTools.map(t => (
                <div key={t.tool} className="flex items-center gap-2.5">
                  <span className="text-xs text-muted-foreground w-32 shrink-0 truncate">{formatTool(t.tool)}</span>
                  <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-violet-500/60 transition-all duration-500"
                      style={{ width: `${Math.round((t.count / maxTool) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-foreground w-6 text-right shrink-0">{t.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No agent activity yet</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Top Topics Card ───────────────────────────────────────────────────────────

const TAG_BAR_COLORS: Record<string, string> = {
  Shipping:        'bg-blue-500/70',
  Returns:         'bg-amber-500/70',
  'Order Status':  'bg-emerald-500/70',
  'Product Inquiry': 'bg-violet-500/70',
  General:         'bg-slate-500/70',
}

const TAG_BADGE_COLORS: Record<string, string> = {
  Shipping:        'bg-blue-900/40 text-blue-400 border-blue-800/50',
  Returns:         'bg-amber-900/40 text-amber-400 border-amber-800/50',
  'Order Status':  'bg-emerald-900/40 text-emerald-400 border-emerald-800/50',
  'Product Inquiry': 'bg-violet-900/40 text-violet-400 border-violet-800/50',
  General:         'bg-slate-800/40 text-slate-400 border-slate-700/50',
}

function TopTopicsCard({
  data,
  isLoading,
  rangeLabel,
}: {
  data: ReturnType<typeof useReports>['data']
  isLoading: boolean
  rangeLabel: string
}) {
  const byTag = data?.support.byTag ?? []
  const total = byTag.reduce((s, t) => s + t.count, 0)
  const maxCount = Math.max(...byTag.map(t => t.count), 1)

  function handleExport() {
    if (!byTag.length) return
    downloadCSV(`top-topics-${rangeLabel.replace(/\s/g, '-')}.csv`, [
      ['Topic', 'Tickets', '% of Total'],
      ...byTag.map(t => [t.tag, t.count, total > 0 ? `${Math.round((t.count / total) * 100)}%` : '—']),
    ])
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="border-b border-border pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <CardTitle className="text-sm">Top Topics</CardTitle>
          </div>
          <ExportButton onClick={handleExport} disabled={isLoading || !byTag.length} />
        </div>
      </CardHeader>

      <CardContent className="pt-5 flex-1">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex justify-between">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-3.5 w-10" />
                </div>
                <Skeleton className="h-2 w-full" />
              </div>
            ))}
          </div>
        ) : byTag.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <p className="text-sm text-muted-foreground">No tagged tickets yet</p>
            <p className="text-[11px] text-muted-foreground/60 mt-1">Tags are assigned automatically by AI</p>
          </div>
        ) : (
          <div className="space-y-3">
            {byTag.map(t => {
              const pct = total > 0 ? Math.round((t.count / total) * 100) : 0
              const barColor = TAG_BAR_COLORS[t.tag] ?? 'bg-primary/60'
              const badgeColor = TAG_BADGE_COLORS[t.tag] ?? 'bg-muted text-muted-foreground border-border'
              return (
                <div key={t.tag}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${badgeColor}`}>
                        {t.tag}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-muted-foreground">{pct}%</span>
                      <span className="text-xs font-semibold text-foreground w-5 text-right">{t.count}</span>
                    </div>
                  </div>
                  <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                      style={{ width: `${Math.round((t.count / maxCount) * 100)}%` }}
                    />
                  </div>
                </div>
              )
            })}

            {total > 0 && (
              <p className="text-[10px] text-muted-foreground pt-1">
                {total} tagged ticket{total !== 1 ? 's' : ''} in this period
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Customer Contact Card ──────────────────────────────────────────────────────

function CustomerContactCard({
  data,
  isLoading,
  rangeLabel,
}: {
  data: ReturnType<typeof useReports>['data']
  isLoading: boolean
  rangeLabel: string
}) {
  const customers = data?.customers

  function handleExport() {
    if (!customers) return
    downloadCSV(`customer-contact-${rangeLabel.replace(/\s/g, '-')}.csv`, [
      ['Metric', 'Count'],
      ['Unique customers', customers.unique],
      ['Repeat customers (3+ tickets)', customers.repeat],
      [],
      ['Name / ID', 'Tickets'],
      ...customers.top.map(c => [c.name ?? c.platformId, c.count]),
    ])
  }

  return (
    <Card className="flex flex-col">
      <CardHeader className="border-b border-border pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Users className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <CardTitle className="text-sm">Customer Contact</CardTitle>
          </div>
          <ExportButton onClick={handleExport} disabled={isLoading || !customers} />
        </div>
      </CardHeader>

      <CardContent className="pt-5 flex-1 space-y-5">
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Unique Customers',    value: customers?.unique, icon: <Users className="w-4 h-4 text-blue-400/70" /> },
            { label: 'Repeat (3+ tickets)', value: customers?.repeat, icon: <Users className="w-4 h-4 text-amber-400/70" /> },
          ].map(({ label, value, icon }) => (
            <div key={label} className="rounded-xl border border-border bg-muted/30 px-3 py-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide leading-tight">{label}</p>
                {icon}
              </div>
              {isLoading
                ? <Skeleton className="h-7 w-12" />
                : <p className="text-2xl font-extrabold text-foreground leading-none">{value?.toLocaleString() ?? '0'}</p>
              }
            </div>
          ))}
        </div>

        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2.5">Most active customers</p>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : customers?.top.length ? (
            <div className="space-y-1.5">
              {customers.top.map(c => (
                <div key={c.platformId} className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{c.name ?? 'Unknown'}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{c.platformId}</p>
                  </div>
                  <span className="text-sm font-bold text-foreground shrink-0 ml-3">
                    {c.count} {c.count === 1 ? 'ticket' : 'tickets'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No customer data</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ── GDPR Export Section ────────────────────────────────────────────────────────

function GdprExportSection() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleExport() {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) return
    setStatus('loading')
    setErrorMsg('')
    try {
      const res = await fetch(`/api/reports/gdpr?email=${encodeURIComponent(trimmed)}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setErrorMsg((body as { error?: string }).error ?? 'Export failed. Check the email address and try again.')
        setStatus('error')
        return
      }
      // Server sends Content-Disposition: attachment, browser uses that filename
      triggerDownload(await res.blob(), `customer-data-${trimmed.replace(/[^a-z0-9]/g, '-')}.json`)
      setStatus('idle')
    } catch {
      setErrorMsg('Something went wrong. Please try again.')
      setStatus('error')
    }
  }

  return (
    <Card>
      <CardHeader className="border-b border-border pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center">
            <Shield className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          <div>
            <CardTitle className="text-sm">Customer Data Export</CardTitle>
            <p className="text-[10px] text-muted-foreground mt-0.5">GDPR / CCPA — export all data associated with a customer</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-5">
        <p className="text-xs text-muted-foreground mb-4">
          Enter the customer&apos;s email address to download all their support conversations and profile data as a JSON file.
          Use this to respond to data access requests under GDPR (Art. 15) or CCPA.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); setStatus('idle') }}
            onKeyDown={e => e.key === 'Enter' && handleExport()}
            placeholder="customer@example.com"
            className="flex-1 min-w-48 bg-muted border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary focus:border-primary"
          />
          <button
            onClick={handleExport}
            disabled={status === 'loading' || !email.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === 'loading'
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Exporting…</>
              : <><Download className="w-3.5 h-3.5" /> Export Data</>
            }
          </button>
        </div>
        {status === 'error' && (
          <p className="text-xs text-red-400 mt-2">{errorMsg}</p>
        )}
        <p className="text-[10px] text-muted-foreground mt-3">
          Message data is retained for 90 days, then archived. Archived threads are purged after another 90 days.
        </p>
      </CardContent>
    </Card>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

const BADGE_LABELS: Record<Preset, string> = {
  '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days', 'all': 'All time', 'custom': '',
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function ReportsPage() {
  const [preset, setPreset] = useState<Preset>('30d')
  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0]
  })
  const [customTo, setCustomTo] = useState(() => new Date().toISOString().split('T')[0])

  const rangeFrom = getDateRangeFrom(preset, customFrom)
  const rangeTo   = getDateRangeTo(preset, customTo)

  const rangeLabel = preset === 'custom'
    ? `${shortDate(rangeFrom.toISOString())} – ${shortDate(rangeTo.toISOString())}`
    : BADGE_LABELS[preset]

  const today = new Date().toISOString().split('T')[0]

  const { data, isLoading, error } = useReports(rangeFrom, rangeTo)

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="px-5 md:px-6 py-4 space-y-3 pb-10">

        <DateRangeSelector
          preset={preset}
          setPreset={setPreset}
          customFrom={customFrom}
          setCustomFrom={setCustomFrom}
          customTo={customTo}
          setCustomTo={setCustomTo}
          today={today}
        />

        {error && (
          <p className="text-sm text-red-400 px-1">Failed to load report data. Please try again.</p>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <SupportSummaryCard data={data} isLoading={isLoading} rangeLabel={rangeLabel} />
          <AgentActivityCard  data={data} isLoading={isLoading} rangeLabel={rangeLabel} />
          <CustomerContactCard data={data} isLoading={isLoading} rangeLabel={rangeLabel} />
          <TopTopicsCard      data={data} isLoading={isLoading} rangeLabel={rangeLabel} />
        </div>

        <GdprExportSection />

      </div>
    </div>
  )
}
