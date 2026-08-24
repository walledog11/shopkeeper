"use client"

import { useState } from "react"
import useSWR from "swr"
import { useOrganization } from "@clerk/nextjs"
import { fetcher } from "@/lib/api/fetcher"
import { Button } from "@/components/ui/button"
import { formatUnixDate } from "@/lib/format/date"
import { CreditCard, Loader2, ExternalLink, CheckCircle2, AlertTriangle, XCircle, Clock } from "lucide-react"
import { Pulse } from "@/app/dashboard/_components/skeletons/Pulse"
import { GLASS_SETTINGS_ACTION, SOLID_SETTINGS_TILE } from "@/lib/ui/glass-card-styles"
import { cn } from "@/lib/ui/cn"
import { SettingsTile } from "./SettingsTile"

interface BillingInfo {
  status: "active" | "trialing" | "past_due" | "canceled" | "none"
  planName: string | null
  amount: number | null
  interval: "month" | "year" | null
  trialEnd: number | null
  nextInvoice: { date: number; amount: number } | null
  paymentMethod: { brand: string; last4: string } | null
  invoices: { id: string; date: number; amount: number; status: string | null; pdfUrl: string | null }[]
}

const STATUS_CONFIG = {
  active: { label: "Active", icon: CheckCircle2, className: "text-green-600 bg-green-600/10 border-green-600/20" },
  trialing: { label: "Trial", icon: Clock, className: "text-blue-600 bg-blue-600/10 border-blue-600/20" },
  past_due: { label: "Past due", icon: AlertTriangle, className: "text-amber-600 bg-amber-600/10 border-amber-600/20" },
  canceled: { label: "Canceled", icon: XCircle, className: "text-faint bg-foreground/[0.06] border-foreground/[0.10]" },
  none: { label: "Free", icon: CheckCircle2, className: "text-faint bg-foreground/[0.06] border-foreground/[0.10]" },
}

function formatAmount(cents: number) {
  return `$${(cents / 100).toFixed(2)}`
}

function CardBrandIcon({ brand }: { brand: string }) {
  const label = brand.charAt(0).toUpperCase() + brand.slice(1)
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-foreground/[0.06] px-2 py-0.5 text-xs font-semibold text-muted-foreground">
      {label}
    </span>
  )
}

async function openBillingPortal() {
  const res = await fetch("/api/billing/portal", { method: "POST" })
  if (!res.ok) return
  const { url } = await res.json()
  window.location.href = url
}

const PLANS = [
  { tier: "starter", name: "Starter", price: "$19", blurb: "Unified inbox and AI drafts on every reply." },
  { tier: "pro", name: "Pro", price: "$49", blurb: "Adds Shopify actions and approvals from your phone." },
] as const

const settingsPrimaryButtonClass =
  "w-full bg-[#2b2118] text-[#f6f2eb] hover:bg-[#1a120c] sm:w-auto"

function PlanPicker() {
  const [tier, setTier] = useState<(typeof PLANS)[number]["tier"]>("pro")
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function startCheckout() {
    setStarting(true)
    setError(null)
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      })
      const body = await res.json().catch(() => null)
      if (res.ok && body?.url) {
        window.location.href = body.url
        return
      }
      setError(body?.error ?? "Could not start checkout. Try again in a moment.")
    } catch {
      setError("Could not start checkout. Try again in a moment.")
    }
    setStarting(false)
  }

  return (
    <SettingsTile
      label="Choose a plan"
      action={
        <Button
          type="button"
          onClick={startCheckout}
          disabled={starting}
          className={settingsPrimaryButtonClass}
        >
          {starting ? <Loader2 className="size-4 animate-spin" /> : "Start free trial"}
        </Button>
      }
    >
      <div className="space-y-3">
        <p>Every plan starts with 14 days free.</p>
        <div role="radiogroup" aria-label="Plan" className="space-y-2">
          {PLANS.map((plan) => {
            const selected = plan.tier === tier
            return (
              <button
                key={plan.tier}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setTier(plan.tier)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                  selected
                    ? "border-foreground/[0.28] bg-foreground/[0.04]"
                    : "border-foreground/[0.10] hover:bg-foreground/[0.02]",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border",
                    selected ? "border-foreground/60" : "border-foreground/25",
                  )}
                >
                  {selected ? <span className="size-2 rounded-full bg-foreground/70" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold text-strong">{plan.name}</span>
                    <span className="text-xs text-faint">{plan.price}/mo</span>
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed">{plan.blurb}</span>
                </span>
              </button>
            )
          })}
        </div>
        {error ? (
          <p className="flex items-start gap-2 text-xs text-red-600">
            <AlertTriangle className="mt-px size-3.5 shrink-0" />
            {error}
          </p>
        ) : null}
      </div>
    </SettingsTile>
  )
}

function BillingSkeleton() {
  return (
    <div id="billing" className="flex flex-col gap-4 scroll-mt-6" aria-busy="true" aria-label="Loading billing">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className={cn(SOLID_SETTINGS_TILE, "space-y-2")}>
          <Pulse className="h-4 w-28 rounded-md" />
          <Pulse className="h-4 w-2/3 rounded-md bg-foreground/[0.05]" />
        </div>
      ))}
    </div>
  )
}

export default function BillingTab() {
  const { data, isLoading, error } = useSWR<BillingInfo>("/api/billing", fetcher)
  // Billing state stays readable for everyone; only admins can open the Stripe
  // portal, which is what the server enforces.
  const { membership } = useOrganization()
  const isAdmin = membership?.role === "org:admin"

  if (isLoading) {
    return <BillingSkeleton />
  }

  if (error || !data) {
    return (
      <div
        id="billing"
        className={cn(SOLID_SETTINGS_TILE, "flex scroll-mt-6 items-center gap-2 text-sm text-red-600")}
      >
        <AlertTriangle className="size-4 shrink-0" />
        Failed to load billing information.
      </div>
    )
  }

  const statusCfg = STATUS_CONFIG[data.status] ?? STATUS_CONFIG.none
  const StatusIcon = statusCfg.icon
  const isActive = data.status === "active" || data.status === "trialing"
  const trialDaysLeft = data.trialEnd
    ? Math.max(0, Math.ceil((data.trialEnd * 1000 - Date.now()) / 86400000))
    : null

  return (
    <div id="billing" className="flex flex-col gap-4 scroll-mt-6">
      <SettingsTile
        label="Plan"
        action={
          isAdmin && isActive ? (
            <Button type="button" variant="outline" onClick={openBillingPortal} className={GLASS_SETTINGS_ACTION}>
              Manage plan
            </Button>
          ) : null
        }
      >
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-strong">
              {data.planName ?? (isActive ? "Pro" : "Free")}
            </p>
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${statusCfg.className}`}>
              <StatusIcon className="size-3" />
              {statusCfg.label}
            </span>
          </div>
          {data.amount !== null && data.interval ? (
            <p>{formatAmount(data.amount)} / {data.interval}</p>
          ) : null}
          {data.status === "trialing" && trialDaysLeft !== null ? (
            <p className="font-medium text-blue-600">
              {trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""} left in trial
            </p>
          ) : null}
          {data.nextInvoice && isActive ? (
            <p>
              Next invoice {formatAmount(data.nextInvoice.amount)} on {formatUnixDate(data.nextInvoice.date)}
            </p>
          ) : null}
        </div>
      </SettingsTile>

      <SettingsTile
        label="Payment method"
        action={
          isAdmin ? (
            <Button type="button" variant="outline" onClick={openBillingPortal} className={GLASS_SETTINGS_ACTION}>
              {data.paymentMethod ? "Update card" : "Add card"}
            </Button>
          ) : null
        }
      >
        {data.paymentMethod ? (
          <div className="flex items-center gap-2.5">
            <CreditCard className="size-4 shrink-0 text-faint" />
            <CardBrandIcon brand={data.paymentMethod.brand} />
            <span>
              ending in <span className="font-semibold text-strong">{data.paymentMethod.last4}</span>
            </span>
          </div>
        ) : (
          "No payment method on file"
        )}
      </SettingsTile>

      {isAdmin && !isActive ? <PlanPicker /> : null}

      <SettingsTile label="Invoice history">
        <div className="space-y-3">
          <p>Download receipts and past invoice PDFs.</p>
          {data.invoices.length === 0 ? (
            <p>No invoices yet.</p>
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
                  {data.invoices.map((inv) => (
                    <tr key={inv.id} className="transition-colors hover:bg-foreground/[0.02]">
                      <td className="py-3.5 pr-5">{formatUnixDate(inv.date)}</td>
                      <td className="px-5 py-3.5 font-medium text-strong">{formatAmount(inv.amount)}</td>
                      <td className="hidden px-5 py-3.5 sm:table-cell">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
                          inv.status === "paid"
                            ? "border-green-600/20 bg-green-600/10 text-green-600"
                            : "border-foreground/[0.10] bg-foreground/[0.06] text-faint"
                        }`}>
                          {inv.status ?? "—"}
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
        </div>
      </SettingsTile>
    </div>
  )
}
