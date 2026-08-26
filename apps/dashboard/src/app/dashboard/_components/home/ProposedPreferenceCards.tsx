"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Check, Loader2, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MERCHANT_PREFERENCE_CATEGORY_LABELS } from "@shopkeeper/db"
import type { HomeProposedPreferenceItem } from "@/lib/home/summary-contract"
import {
  NeedsYouCardBody,
  NeedsYouCardFooter,
  NeedsYouCardHeader,
  NeedsYouCardShell,
} from "./needs-you-card-ui"
import { needsYouSecondaryButtonClassName } from "./needs-you-card-styles"

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
      const res = await fetch(`/api/agent/preferences/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const body = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) throw new Error(body.error ?? "Failed to update preference")
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
        <NeedsYouCardShell key={item.id} variant="shell">
          <NeedsYouCardHeader className="pb-3">
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
          </NeedsYouCardHeader>
          <NeedsYouCardBody>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-strong">
              {item.guidance}
            </p>
            {item.proposedRationale ? (
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                {item.proposedRationale}
              </p>
            ) : null}
          </NeedsYouCardBody>
          <NeedsYouCardFooter>
            <Button
              type="button"
              onClick={() => void resolvePreference(item.id, "confirm")}
              disabled={busyId !== null}
              className="w-full bg-[#2b2118] text-[#f6f2eb] hover:bg-[#1a120c] sm:w-auto"
            >
              {busyId === item.id ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              Use this preference
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void resolvePreference(item.id, "reject")}
              disabled={busyId !== null}
              className={needsYouSecondaryButtonClassName}
            >
              {busyId === item.id ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
              Dismiss
            </Button>
            <Link href="/dashboard/agent/configure" className={needsYouSecondaryButtonClassName}>
              Review in settings
            </Link>
          </NeedsYouCardFooter>
        </NeedsYouCardShell>
      ))}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  )
}
