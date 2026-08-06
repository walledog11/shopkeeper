"use client"

import Link from "next/link"
import { useState } from "react"
import useSWR from "swr"
import { AlertCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { errorMessageFromUnknown, fetcher, requestJson } from "@/lib/api/fetcher"
import type { PendingPlanView } from "@/lib/agent/api/operator-pending"

// The queue is concurrently mutable from the merchant's phone, so an open panel
// re-reads it rather than trusting what it loaded on mount.
const REFRESH_INTERVAL_MS = 10_000

// `actionLabel` is parked to complete "I won't …" on a dismissal; it completes
// "I'd …" here too, so the panel and the phone card name the action identically.
function planLead(plan: PendingPlanView): string {
  if (plan.actionLabel) return `I'd ${plan.actionLabel}.`
  if (plan.steps.length > 0) return `I'd ${plan.steps.join(", then ").toLowerCase()}.`
  const who = plan.customerName?.split(" ")[0]
  return who ? `Something for ${who} needs your call.` : "This needs your call."
}

function PendingPlanCard({
  plan,
  onResolved,
}: {
  plan: PendingPlanView
  onResolved: () => void
}) {
  const [busy, setBusy] = useState<"approve" | "dismiss" | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function decide(decision: "approve" | "dismiss") {
    if (busy || !plan.planId) return
    setBusy(decision)
    setError(null)
    try {
      await requestJson("/api/agent/pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.planId, decision }),
      }, "Could not record that. Try again.")
      onResolved()
    } catch (err) {
      setError(errorMessageFromUnknown(err, "Could not record that. Try again."))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="rounded-2xl border border-amber-600/25 bg-amber-600/[0.07] px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {plan.customerName && (
          <>
            <span className="min-w-0 truncate font-medium text-foreground/70">{plan.customerName}</span>
            <span className="shrink-0 text-foreground/25">·</span>
          </>
        )}
        <span className="shrink-0">Waiting on you</span>
      </div>

      <p className="mt-1.5 text-sm text-foreground">{planLead(plan)}</p>

      {plan.draft && (
        <p className="mt-2 border-l-2 border-border pl-2.5 text-xs leading-relaxed text-foreground/55 line-clamp-3">
          {plan.draft}
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap gap-2">
        {plan.planId ? (
          <>
            <Button
              type="button"
              size="sm"
              disabled={busy !== null}
              onClick={() => void decide("approve")}
              className="rounded-full bg-green-600 text-primary-foreground hover:bg-green-700"
            >
              {busy === "approve" && <Loader2 className="size-3.5 animate-spin" />}
              {busy === "approve" ? "Approving" : "Approve"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => void decide("dismiss")}
              className="rounded-full"
            >
              Dismiss
            </Button>
          </>
        ) : null}
        <Button asChild size="sm" variant="ghost" className="rounded-full text-muted-foreground">
          <Link href={`/dashboard/tickets?thread=${plan.threadId}`}>Open ticket</Link>
        </Button>
      </div>

      {error && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
          <AlertCircle aria-hidden className="size-3 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}

// What is waiting on the merchant, wherever they parked it. This is the panel's
// lead: the conversation and the composer are below it, because a queue with
// something in it is a better reason to open the panel than an empty box.
export default function AgentPanelPendingLedger({ enabled = true }: { enabled?: boolean }) {
  const { data, mutate } = useSWR<{ plans: PendingPlanView[] }>(
    enabled ? "/api/agent/pending" : null,
    fetcher,
    { refreshInterval: REFRESH_INTERVAL_MS },
  )

  const plans = data?.plans ?? []
  if (plans.length === 0) return null

  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {plans.length === 1 ? "1 plan waiting on you" : `${plans.length} plans waiting on you`}
      </h3>
      {plans.map((plan) => (
        <PendingPlanCard
          key={plan.planId ?? plan.threadId}
          plan={plan}
          onResolved={() => void mutate()}
        />
      ))}
    </section>
  )
}
