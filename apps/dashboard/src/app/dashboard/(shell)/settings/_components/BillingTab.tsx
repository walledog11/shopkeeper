"use client"

import useSWR from "swr"
import { fetcher } from "@/lib/api/fetcher"
import { Button } from "@/components/ui/button"
import { SettingsDisclosure } from "@/components/settings-form/shared"
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
  canceled: { label: 'Canceled', icon: XCircle,         className: 'text-faint bg-foreground/[0.06] border-foreground/[0.10]' },
  none:     { label: 'Free',     icon: CheckCircle2,    className: 'text-faint bg-foreground/[0.06] border-foreground/[0.10]' },
}

function formatAmount(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

function CardBrandIcon({ brand }: { brand: string }) {
  const label = brand.charAt(0).toUpperCase() + brand.slice(1)
  return (
    <span className="inline-flex items-center gap-1 rounded bg-foreground/[0.06] px-2 py-0.5 text-xs font-semibold text-muted-foreground">
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
      <div id="billing" className="flex items-center justify-center rounded-xl border border-border bg-card py-16">
        <Loader2 className="size-5 animate-spin text-faint" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div id="billing" className="flex items-center gap-2 rounded-xl border border-border bg-card px-5 py-6 text-sm text-red-400 sm:px-6">
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
    <div id="billing" className="scroll-mt-6 space-y-6">
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-4 sm:gap-8 p-5 sm:p-6">
          <div>
            <h2 className="text-sm font-semibold text-strong">Billing</h2>
            <p className="text-xs text-faint mt-1 leading-relaxed">Plan, payment method, and invoices for this workspace.</p>
          </div>
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-strong">
                    {data.planName ?? (isActive ? 'Pro' : 'Free')}
                  </p>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${statusCfg.className}`}>
                    <StatusIcon className="size-3" />
                    {statusCfg.label}
                  </span>
                </div>
                {data.amount !== null && data.interval && (
                  <p className="text-xs text-faint">
                    {formatAmount(data.amount)} / {data.interval}
                  </p>
                )}
                {data.status === 'trialing' && trialDaysLeft !== null && (
                  <p className="text-xs text-blue-400 font-medium">
                    {trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''} left in trial
                  </p>
                )}
                {data.nextInvoice && isActive && (
                  <p className="text-xs text-faint">
                    Next invoice {formatAmount(data.nextInvoice.amount)} on {formatUnixDate(data.nextInvoice.date)}
                  </p>
                )}
              </div>
              <Button
                size="sm"
                onClick={openBillingPortal}
                className="h-8 px-4 bg-foreground/[0.12] text-white hover:bg-foreground/[0.18] text-xs font-semibold shrink-0"
              >
                {isActive ? 'Manage plan' : 'Upgrade'}
              </Button>
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-foreground/[0.06] pt-4">
              {data.paymentMethod ? (
                <div className="flex items-center gap-2.5">
                  <CreditCard className="size-4 text-faint shrink-0" />
                  <CardBrandIcon brand={data.paymentMethod.brand} />
                  <span className="text-sm text-strong">ending in <span className="font-semibold text-strong">{data.paymentMethod.last4}</span></span>
                </div>
              ) : (
                <p className="text-sm text-faint italic">No payment method on file</p>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={openBillingPortal}
                className="h-8 px-3 text-xs font-semibold border-foreground/[0.10] text-muted-foreground hover:bg-foreground/[0.08] shrink-0"
              >
                {data.paymentMethod ? 'Update card' : 'Add card'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <SettingsDisclosure
        title="Invoice history"
        description="Download receipts and past invoice PDFs."
      >
        {data.invoices.length === 0 ? (
          <div className="py-4 text-center text-xs text-muted-foreground">No invoices yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-foreground/[0.08]">
                  <th className="py-3 pr-5 text-left text-xs font-semibold uppercase tracking-wide text-faint">Date</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-faint">Amount</th>
                  <th className="hidden px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-faint sm:table-cell">Status</th>
                  <th className="py-3 pl-5 text-right text-xs font-semibold uppercase tracking-wide text-faint">PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/[0.06]">
                {data.invoices.map(inv => (
                  <tr key={inv.id} className="transition-colors hover:bg-foreground/[0.02]">
                    <td className="py-3.5 pr-5 text-muted-foreground">{formatUnixDate(inv.date)}</td>
                    <td className="px-5 py-3.5 font-medium text-strong">{formatAmount(inv.amount)}</td>
                    <td className="hidden px-5 py-3.5 sm:table-cell">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${
                        inv.status === 'paid'
                          ? 'text-green-400 bg-green-400/10 border-green-400/20'
                          : 'text-faint bg-foreground/[0.06] border-foreground/[0.10]'
                      }`}>
                        {inv.status ?? '—'}
                      </span>
                    </td>
                    <td className="py-3.5 pl-5 text-right">
                      {inv.pdfUrl ? (
                        <a
                          href={inv.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-strong"
                        >
                          Download <ExternalLink className="size-3" />
                        </a>
                      ) : (
                        <span className="text-xs text-faint">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SettingsDisclosure>

    </div>
  )
}
