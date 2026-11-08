"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Check, Loader2, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { updatePreference } from "@/lib/agent/preference-requests"
import { MERCHANT_PREFERENCE_CATEGORY_LABELS } from "@shopkeeper/db/merchant-preferences"
import type { HomeProposedPreferenceItem } from "@/lib/home/summary-contract"
import {
  SupportCardBody,
  SupportCardFooter,
  SupportCardHeader,
  SupportCardShell,
} from "@/components/support-card/card"
import { supportCardSecondaryButtonClassName } from "@/components/support-card/styles"
import { appPrimaryButtonClassName } from "@/lib/ui/app-button-styles"

export function ProposedPreferenceCards({
  items,
  onUpdated,
}: {
  items: HomeProposedPreferenceItem[]
  onUpdated: () => void
}) {
  const [localItems, setLocalItems] = useState(items)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLocalItems(items)
  }, [items])

  if (localItems.length === 0) return null

  async function resolvePreference(id: string, action: "confirm" | "reject") {
    if (busyId) return
    setBusyId(id)
    setError(null)
    try {
      await updatePreference(id, action)
      setLocalItems((current) => current.filter((item) => item.id !== id))
      onUpdated()
    } catch (resolveError) {
      setError(resolveError instanceof Error ? resolveError.message : "Failed to update preference")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {localItems.map((item) => (
        <SupportCardShell key={item.id} variant="shell">
          <SupportCardHeader className="pb-3">
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-violet-700/15">
                <Sparkles className="size-3.5 text-violet-700" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-strong">Suggested preference</p>
                <p className="mt-0.5 text-xs text-faint">
                  {MERCHANT_PREFERENCE_CATEGORY_LABELS[item.category]} · confirm before it guides planning
                </p>
              </div>
            </div>
          </SupportCardHeader>
          <SupportCardBody>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-strong">
              {item.guidance}
            </p>
            {item.proposedRationale ? (
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {item.proposedRationale}
              </p>
            ) : null}
          </SupportCardBody>
          <SupportCardFooter>
            <Button
              type="button"
              onClick={() => void resolvePreference(item.id, "confirm")}
              disabled={busyId !== null}
              className={appPrimaryButtonClassName}
            >
              {busyId === item.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Use this preference
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void resolvePreference(item.id, "reject")}
              disabled={busyId !== null}
              className={supportCardSecondaryButtonClassName}
            >
              {busyId === item.id ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
              Dismiss
            </Button>
            <Link href="/dashboard/kb?book=preferences" className={supportCardSecondaryButtonClassName}>
              Review in Memory
            </Link>
          </SupportCardFooter>
        </SupportCardShell>
      ))}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  )
}
