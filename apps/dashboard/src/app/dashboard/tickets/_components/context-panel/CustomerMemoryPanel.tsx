"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { Check, Plus, RefreshCw, Trash2, X } from "lucide-react"
import {
  EMPTY_MEMORY,
  KEY_FACTS_MAX,
  KEY_FACT_MAX_CHARS,
  SUMMARY_MAX_CHARS,
  type CustomerMemory,
  type CustomerMemoryPolicyFlags,
} from "@clerk/db/customer-memory"
import { fetcher } from "@/lib/api/fetcher"
import { SectionHeader } from "./SectionHeader"
import { panelSectionClass } from "./constants"
import { formatShortDate } from "./formatters"

interface CustomerMemoryResponse {
  memory: CustomerMemory
  memoryUpdatedAt: string | null
}

interface CustomerMemoryPanelProps {
  customerId: string
}

function sameStringArray(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

function policyFlagBadges(flags: CustomerMemoryPolicyFlags) {
  const badges: string[] = []
  if (flags.vip) badges.push("VIP")
  if (flags.complaintPattern) badges.push("Complaint pattern")

  const refundCount = typeof flags.priorRefundsCount === "number" ? flags.priorRefundsCount : null
  const refundTotal = typeof flags.priorRefundsTotal === "number" ? flags.priorRefundsTotal : null
  if (refundCount !== null && refundTotal !== null) {
    badges.push(`${refundCount} refunds / $${refundTotal.toFixed(2)}`)
  } else if (refundCount !== null) {
    badges.push(`${refundCount} refunds`)
  } else if (refundTotal !== null) {
    badges.push(`Refunded $${refundTotal.toFixed(2)}`)
  }

  return badges
}

export function CustomerMemoryPanel({ customerId }: CustomerMemoryPanelProps) {
  const { data, error, isLoading, mutate } = useSWR<CustomerMemoryResponse>(
    customerId ? `/api/customers/${customerId}/memory` : null,
    fetcher,
  )
  const memory = data?.memory ?? EMPTY_MEMORY
  const [draftSummary, setDraftSummary] = useState(memory.summary)
  const [draftKeyFacts, setDraftKeyFacts] = useState<string[]>(memory.keyFacts)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    setDraftSummary(memory.summary)
    setDraftKeyFacts(memory.keyFacts)
    setSaveError(null)
  }, [customerId, data?.memoryUpdatedAt, memory.keyFacts, memory.summary])

  const hasChanges = draftSummary !== memory.summary || !sameStringArray(draftKeyFacts, memory.keyFacts)
  const flags = useMemo(() => policyFlagBadges(memory.policyFlags ?? {}), [memory.policyFlags])
  const canAddFact = draftKeyFacts.length < KEY_FACTS_MAX

  const handleFactChange = (index: number, value: string) => {
    setDraftKeyFacts((facts) => facts.map((fact, i) => i === index ? value.slice(0, KEY_FACT_MAX_CHARS) : fact))
  }

  const handleAddFact = () => {
    if (!canAddFact) return
    setDraftKeyFacts((facts) => [...facts, ""])
  }

  const handleRemoveFact = (index: number) => {
    setDraftKeyFacts((facts) => facts.filter((_, i) => i !== index))
  }

  const handleCancel = () => {
    setDraftSummary(memory.summary)
    setDraftKeyFacts(memory.keyFacts)
    setSaveError(null)
  }

  const handleSave = async () => {
    setIsSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/customers/${customerId}/memory`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: draftSummary,
          keyFacts: draftKeyFacts,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.memory) {
        setSaveError(typeof json.error === "string" ? json.error : "Failed to save memory.")
        return
      }
      void mutate(json as CustomerMemoryResponse, false)
    } catch (err) {
      console.error("Failed to save customer memory", err)
      setSaveError("Failed to save memory.")
    } finally {
      setIsSaving(false)
    }
  }

  const headerAction = hasChanges ? (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={handleCancel}
        disabled={isSaving}
        className="flex h-6 w-6 items-center justify-center rounded text-white/35 transition-colors hover:bg-white/[0.05] hover:text-white/70 disabled:opacity-40"
        aria-label="Cancel memory changes"
        title="Cancel"
      >
        <X className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={() => { void handleSave() }}
        disabled={isSaving}
        className="flex h-6 w-6 items-center justify-center rounded bg-[#96BF48] text-white transition-colors hover:bg-[#7da33a] disabled:opacity-50"
        aria-label="Save customer memory"
        title="Save"
      >
        {isSaving ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
      </button>
    </div>
  ) : undefined

  if (isLoading && !data) {
    return (
      <section className={panelSectionClass}>
        <SectionHeader title="WHAT WE KNOW" />
        <div className="space-y-2 animate-pulse">
          <div className="h-16 rounded-md bg-white/[0.04]" />
          <div className="h-8 rounded-md bg-white/[0.04]" />
          <div className="h-8 rounded-md bg-white/[0.03]" />
        </div>
      </section>
    )
  }

  if (error) {
    return (
      <section className={panelSectionClass}>
        <SectionHeader title="WHAT WE KNOW" />
        <p className="text-xs text-red-400">Unable to load memory.</p>
      </section>
    )
  }

  return (
    <section className={panelSectionClass}>
      <SectionHeader title="WHAT WE KNOW" action={headerAction} />

      <div className="space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <label htmlFor={`customer-memory-summary-${customerId}`} className="text-[10px] font-medium uppercase tracking-[0.12em] text-white/30">
              Summary
            </label>
            <span className="text-[10px] tabular-nums text-white/25">{draftSummary.length} / {SUMMARY_MAX_CHARS}</span>
          </div>
          <textarea
            id={`customer-memory-summary-${customerId}`}
            value={draftSummary}
            onChange={(event) => setDraftSummary(event.target.value.slice(0, SUMMARY_MAX_CHARS))}
            maxLength={SUMMARY_MAX_CHARS}
            rows={3}
            className="w-full resize-none rounded-md border border-white/[0.10] bg-white/[0.04] px-2 py-1.5 text-xs leading-4 text-white/80 outline-none transition-colors placeholder:text-white/25 focus:border-white/[0.22]"
            placeholder="No summary yet."
          />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-white/30">Key facts</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] tabular-nums text-white/25">{draftKeyFacts.length} / {KEY_FACTS_MAX}</span>
              <button
                type="button"
                onClick={handleAddFact}
                disabled={!canAddFact}
                className="flex h-5 w-5 items-center justify-center rounded text-white/35 transition-colors hover:bg-white/[0.05] hover:text-white/70 disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Add key fact"
                title="Add fact"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          </div>

          {draftKeyFacts.length > 0 ? (
            <div className="space-y-1.5">
              {draftKeyFacts.map((fact, index) => (
                <div key={index} className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={fact}
                      onChange={(event) => handleFactChange(index, event.target.value)}
                      maxLength={KEY_FACT_MAX_CHARS}
                      className="min-w-0 flex-1 rounded-md border border-white/[0.10] bg-white/[0.04] px-2 py-1.5 text-xs text-white/80 outline-none transition-colors placeholder:text-white/25 focus:border-white/[0.22]"
                      placeholder="Key fact"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveFact(index)}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-white/30 transition-colors hover:bg-white/[0.05] hover:text-red-300"
                      aria-label="Remove key fact"
                      title="Remove"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="text-right text-[10px] tabular-nums text-white/20">{fact.length} / {KEY_FACT_MAX_CHARS}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-white/[0.08] px-2 py-1.5 text-xs text-white/35">No key facts.</p>
          )}
        </div>

        {flags.length > 0 && (
          <div>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.12em] text-white/30">Signals</div>
            <div className="flex flex-wrap gap-1.5">
              {flags.map((flag) => (
                <span key={flag} className="rounded border border-white/[0.10] bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium text-white/60">
                  {flag}
                </span>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="mb-1 text-[10px] font-medium uppercase tracking-[0.12em] text-white/30">Recent interactions</div>
          {memory.recentInteractions.length > 0 ? (
            <div className="space-y-1.5">
              {memory.recentInteractions.slice(0, 10).map((interaction) => (
                <div key={`${interaction.threadId}-${interaction.closedAt}`} className="rounded-md border border-white/[0.07] bg-white/[0.025] px-2 py-1.5">
                  <div className="mb-0.5 flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[11px] font-medium text-white/60">
                      {interaction.tag || interaction.channel}
                    </span>
                    <span className="shrink-0 text-[10px] text-white/30">{formatShortDate(interaction.closedAt)}</span>
                  </div>
                  <p className="text-xs leading-4 text-white/45">{interaction.outcome}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-white/35">No recent interactions.</p>
          )}
        </div>

        {saveError && <p className="text-xs text-red-400">{saveError}</p>}
      </div>
    </section>
  )
}
