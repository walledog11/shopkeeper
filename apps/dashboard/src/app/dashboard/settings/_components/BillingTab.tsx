"use client"

import useSWR from "swr"
import { fetcher } from "@/lib/api/fetcher"
import { Button } from "@/components/ui/button"
import { formatUnixDate } from "@/lib/format/date"
import { CreditCard, Loader2, ExternalLink, CheckCircle2, AlertTriangle, XCircle, Clock } from "lucide-react"

interface BillingInfo {
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'none'
  planName: string | null
  amount: number | null
  interval: 'month' | 'year' | null
  trialEnd: number | null
  nextInvoice: { date: number; amount: number } | null
  paymentMethod: { brand: string; last4: string } | null
  invoices: { id: string; date: number; amount: number; status: string | null; pdfUrl: string | null }[]
}

const STATUS_CONFIG = {
  active:   { label: 'Active',   icon: CheckCircle2,    className: 'text-green-400 bg-green-400/10 border-green-400/20' },
  trialing: { label: 'Trial',    icon: Clock,           className: 'text-blue-400 bg-blue-400/10 border-blue-400/20' },
  past_due: { label: 'Past due', icon: AlertTriangle,   className: 'text-amber-400 bg-amber-400/10 border-amber-400/20' },
  canceled: { label: 'Canceled', icon: XCircle,         className: 'text-muted-foreground bg-muted border-border' },
  none:     { label: 'Free',     icon: CheckCircle2,    className: 'text-muted-foreground bg-muted border-border' },
}

function formatAmount(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

function CardBrandIcon({ brand }: { brand: string }) {
  const label = brand.charAt(0).toUpperCase() + brand.slice(1)
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted text-xs font-semibold text-muted-foreground">
      {label}
    </span>
  )
}

async function openBillingPortal() {
  const res = await fetch('/api/billing/portal', { method: 'POST' })
  if (!res.ok) return
  const { url } = await res.json()
  window.location.href = url
}

export default function BillingTab() {
  const { data, isLoading, error } = useSWR<BillingInfo>('/api/billing', fetcher)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-red-500">
        <AlertTriangle className="size-4 shrink-0" />
        Failed to load billing information.
      </div>
    )
  }

  const statusCfg = STATUS_CONFIG[data.status] ?? STATUS_CONFIG.none
  const StatusIcon = statusCfg.icon
  const isActive = data.status === 'active' || data.status === 'trialing'
  const trialDaysLeft = data.trialEnd
    ? Math.max(0, Math.ceil((data.trialEnd * 1000 - Date.now()) / 86400000))
    : null

  return (
    <div className="space-y-6 max-w-3xl">

      <div>
        <h1 className="text-lg font-bold text-foreground">Billing</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage your subscription and payment details.</p>
      </div>

      {/* ── Current plan ── */}
      <div className="bg-card rounded-md border border-border overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-4 sm:gap-8 p-5 sm:p-6">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Current plan</h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">Your active subscription and billing cycle.</p>
          </div>
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-foreground">
                    {data.planName ?? (isActive ? 'Pro' : 'Free')}
                  </p>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${statusCfg.className}`}>
                    <StatusIcon className="size-3" />
                    {statusCfg.label}
                  </span>
                </div>
                {data.amount !== null && data.interval && (
                  <p className="text-xs text-muted-foreground">
                    {formatAmount(data.amount)} / {data.interval}
                  </p>
                )}
                {data.status === 'trialing' && trialDaysLeft !== null && (
                  <p className="text-xs text-blue-400 font-medium">
                    {trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''} left in trial
                  </p>
                )}
                {data.nextInvoice && isActive && (
                  <p className="text-xs text-muted-foreground">
                    Next invoice {formatAmount(data.nextInvoice.amount)} on {formatUnixDate(data.nextInvoice.date)}
                  </p>
                )}
              </div>
              <Button
                size="sm"
                onClick={openBillingPortal}
                className="h-8 px-4 bg-slate-900 text-white hover:bg-slate-700 text-xs font-semibold shrink-0"
              >
                {isActive ? 'Manage plan' : 'Upgrade'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Payment method ── */}
      <div className="bg-card rounded-md border border-border overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-4 sm:gap-8 p-5 sm:p-6">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Payment method</h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">The card charged at each renewal.</p>
          </div>
          <div className="flex items-center justify-between gap-4">
            {data.paymentMethod ? (
              <div className="flex items-center gap-2.5">
                <CreditCard className="size-4 text-muted-foreground shrink-0" />
                <CardBrandIcon brand={data.paymentMethod.brand} />
                <span className="text-sm text-foreground">ending in <span className="font-semibold">{data.paymentMethod.last4}</span></span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">No payment method on file</p>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={openBillingPortal}
              className="h-8 px-3 text-xs font-semibold shrink-0"
            >
              {data.paymentMethod ? 'Update' : 'Add card'}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Invoice history ── */}
      <div className="bg-card rounded-md border border-border overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground">Invoice history</h2>
        </div>
        {data.invoices.length === 0 ? (
          <div className="px-6 py-8 text-sm text-muted-foreground text-center">No invoices yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-5 sm:px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date</th>
                <th className="px-5 sm:px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount</th>
                <th className="px-5 sm:px-6 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Status</th>
                <th className="px-5 sm:px-6 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.invoices.map(inv => (
                <tr key={inv.id} className="hover:bg-muted transition-colors">
                  <td className="px-5 sm:px-6 py-3.5 text-muted-foreground">{formatUnixDate(inv.date)}</td>
                  <td className="px-5 sm:px-6 py-3.5 font-medium text-foreground">{formatAmount(inv.amount)}</td>
                  <td className="px-5 sm:px-6 py-3.5 hidden sm:table-cell">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${
                      inv.status === 'paid'
                        ? 'text-green-400 bg-green-400/10 border-green-400/20'
                        : 'text-muted-foreground bg-muted border-border'
                    }`}>
                      {inv.status ?? ','}
                    </span>
                  </td>
                  <td className="px-5 sm:px-6 py-3.5 text-right">
                    {inv.pdfUrl ? (
                      <a
                        href={inv.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Download <ExternalLink className="size-3" />
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground/40">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

    </div>
  )
}
