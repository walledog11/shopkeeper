"use client"

import useSWR from "swr"
import { fetcher } from "@/lib/fetcher"
import { Button } from "@/components/ui/button"
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
  active:   { label: 'Active',   icon: CheckCircle2,    className: 'text-green-600 bg-green-50 border-green-200' },
  trialing: { label: 'Trial',    icon: Clock,           className: 'text-blue-600 bg-blue-50 border-blue-200' },
  past_due: { label: 'Past due', icon: AlertTriangle,   className: 'text-amber-600 bg-amber-50 border-amber-200' },
  canceled: { label: 'Canceled', icon: XCircle,         className: 'text-slate-500 bg-slate-50 border-slate-200' },
  none:     { label: 'Free',     icon: CheckCircle2,    className: 'text-slate-500 bg-slate-50 border-slate-200' },
}

function formatAmount(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

function formatDate(unix: number) {
  return new Date(unix * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function CardBrandIcon({ brand }: { brand: string }) {
  const label = brand.charAt(0).toUpperCase() + brand.slice(1)
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-xs font-semibold text-slate-600">
      {label}
    </span>
  )
}

export default function BillingTab() {
  const { data, isLoading, error } = useSWR<BillingInfo>('/api/billing', fetcher)

  async function openPortal() {
    const res = await fetch('/api/billing/portal', { method: 'POST' })
    if (!res.ok) return
    const { url } = await res.json()
    window.location.href = url
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-red-500">
        <AlertTriangle className="w-4 h-4 shrink-0" />
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
        <h1 className="text-lg font-bold text-slate-900">Billing</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage your subscription and payment details.</p>
      </div>

      {/* ── Current plan ── */}
      <div className="bg-white rounded-md border border-slate-200 overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-4 sm:gap-8 p-5 sm:p-6">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Current plan</h2>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">Your active subscription and billing cycle.</p>
          </div>
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-slate-900">
                    {data.planName ?? (isActive ? 'Pro' : 'Free')}
                  </p>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${statusCfg.className}`}>
                    <StatusIcon className="w-3 h-3" />
                    {statusCfg.label}
                  </span>
                </div>
                {data.amount !== null && data.interval && (
                  <p className="text-xs text-slate-500">
                    {formatAmount(data.amount)} / {data.interval}
                  </p>
                )}
                {data.status === 'trialing' && trialDaysLeft !== null && (
                  <p className="text-xs text-blue-600 font-medium">
                    {trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''} left in trial
                  </p>
                )}
                {data.nextInvoice && isActive && (
                  <p className="text-xs text-slate-400">
                    Next invoice {formatAmount(data.nextInvoice.amount)} on {formatDate(data.nextInvoice.date)}
                  </p>
                )}
              </div>
              <Button
                size="sm"
                onClick={openPortal}
                className="h-8 px-4 bg-slate-900 text-white hover:bg-slate-700 text-xs font-semibold shrink-0"
              >
                {isActive ? 'Manage plan' : 'Upgrade'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Payment method ── */}
      <div className="bg-white rounded-md border border-slate-200 overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-4 sm:gap-8 p-5 sm:p-6">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Payment method</h2>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">The card charged at each renewal.</p>
          </div>
          <div className="flex items-center justify-between gap-4">
            {data.paymentMethod ? (
              <div className="flex items-center gap-2.5">
                <CreditCard className="w-4 h-4 text-slate-400 shrink-0" />
                <CardBrandIcon brand={data.paymentMethod.brand} />
                <span className="text-sm text-slate-700">ending in <span className="font-semibold">{data.paymentMethod.last4}</span></span>
              </div>
            ) : (
              <p className="text-sm text-slate-400 italic">No payment method on file</p>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={openPortal}
              className="h-8 px-3 text-xs font-semibold border-slate-200 text-slate-700 hover:bg-slate-50 shrink-0"
            >
              {data.paymentMethod ? 'Update' : 'Add card'}
            </Button>
          </div>
        </div>
      </div>

      {/* ── Invoice history ── */}
      <div className="bg-white rounded-md border border-slate-200 overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Invoice history</h2>
        </div>
        {data.invoices.length === 0 ? (
          <div className="px-6 py-8 text-sm text-slate-400 text-center">No invoices yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-5 sm:px-6 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Date</th>
                <th className="px-5 sm:px-6 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Amount</th>
                <th className="px-5 sm:px-6 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide hidden sm:table-cell">Status</th>
                <th className="px-5 sm:px-6 py-3 text-right text-[11px] font-semibold text-slate-400 uppercase tracking-wide">PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.invoices.map(inv => (
                <tr key={inv.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 sm:px-6 py-3.5 text-slate-700">{formatDate(inv.date)}</td>
                  <td className="px-5 sm:px-6 py-3.5 font-medium text-slate-900">{formatAmount(inv.amount)}</td>
                  <td className="px-5 sm:px-6 py-3.5 hidden sm:table-cell">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                      inv.status === 'paid'
                        ? 'text-green-600 bg-green-50 border-green-200'
                        : 'text-slate-500 bg-slate-50 border-slate-200'
                    }`}>
                      {inv.status ?? '—'}
                    </span>
                  </td>
                  <td className="px-5 sm:px-6 py-3.5 text-right">
                    {inv.pdfUrl ? (
                      <a
                        href={inv.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors"
                      >
                        Download <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
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
