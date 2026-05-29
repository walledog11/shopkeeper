"use client"

import { useMemo, useReducer } from "react"
import useSWR, { type KeyedMutator } from "swr"
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

interface MemoryEditorState {
  draftSummary: string
  draftKeyFacts: string[]
  isSaving: boolean
  saveError: string | null
}

type MemoryEditorAction =
  | { type: "summary"; value: string }
  | { type: "fact"; index: number; value: string }
  | { type: "addFact" }
  | { type: "removeFact"; index: number }
  | { type: "reset"; memory: CustomerMemory }
  | { type: "saving" }
  | { type: "saveError"; error: string }
  | { type: "saved" }

function createMemoryEditorState(memory: CustomerMemory): MemoryEditorState {
  return {
    draftSummary: memory.summary,
    draftKeyFacts: memory.keyFacts,
    isSaving: false,
    saveError: null,
  }
}

function memoryEditorReducer(state: MemoryEditorState, action: MemoryEditorAction): MemoryEditorState {
  switch (action.type) {
    case "summary":
      return { ...state, draftSummary: action.value.slice(0, SUMMARY_MAX_CHARS) }
    case "fact":
      return {
        ...state,
        draftKeyFacts: state.draftKeyFacts.map((fact, index) => (
          index === action.index ? action.value.slice(0, KEY_FACT_MAX_CHARS) : fact
        )),
      }
    case "addFact":
      if (state.draftKeyFacts.length >= KEY_FACTS_MAX) return state
      return { ...state, draftKeyFacts: [...state.draftKeyFacts, ""] }
    case "removeFact":
      return { ...state, draftKeyFacts: state.draftKeyFacts.filter((_, index) => index !== action.index) }
    case "reset":
      return createMemoryEditorState(action.memory)
    case "saving":
      return { ...state, isSaving: true, saveError: null }
    case "saveError":
      return { ...state, saveError: action.error }
    case "saved":
      return { ...state, isSaving: false }
  }
}

function sameStringArray(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index])
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
    <CustomerMemoryEditor
      key={`${customerId}-${data?.memoryUpdatedAt ?? "empty"}`}
      customerId={customerId}
      memory={memory}
      mutate={mutate}
    />
  )
}

interface CustomerMemoryEditorProps {
  customerId: string
  memory: CustomerMemory
  mutate: KeyedMutator<CustomerMemoryResponse>
}

function CustomerMemoryEditor({ customerId, memory, mutate }: CustomerMemoryEditorProps) {
  const [state, dispatch] = useReducer(memoryEditorReducer, memory, createMemoryEditorState)
  const { draftSummary, draftKeyFacts, isSaving, saveError } = state

  const hasChanges = draftSummary !== memory.summary || !sameStringArray(draftKeyFacts, memory.keyFacts)
  const flags = useMemo(() => policyFlagBadges(memory.policyFlags ?? {}), [memory.policyFlags])
  const canAddFact = draftKeyFacts.length < KEY_FACTS_MAX

  const handleFactChange = (index: number, value: string) => {
    dispatch({ type: "fact", index, value })
  }

  const handleAddFact = () => {
    if (!canAddFact) return
    dispatch({ type: "addFact" })
  }

  const handleRemoveFact = (index: number) => {
    dispatch({ type: "removeFact", index })
  }

  const handleCancel = () => {
    dispatch({ type: "reset", memory })
  }

  const handleSave = async () => {
    dispatch({ type: "saving" })
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
        dispatch({ type: "saveError", error: typeof json.error === "string" ? json.error : "Failed to save memory." })
        return
      }
      void mutate(json as CustomerMemoryResponse, false)
    } catch (err) {
      console.error("Failed to save customer memory", err)
      dispatch({ type: "saveError", error: "Failed to save memory." })
    } finally {
      dispatch({ type: "saved" })
    }
  }

  const headerAction = hasChanges ? (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={handleCancel}
        disabled={isSaving}
        className="flex size-6 items-center justify-center rounded text-white/35 transition-colors hover:bg-white/[0.05] hover:text-white/70 disabled:opacity-40"
        aria-label="Cancel memory changes"
        title="Cancel"
      >
        <X className="size-3" />
      </button>
      <button
        type="button"
        onClick={() => { void handleSave() }}
        disabled={isSaving}
        className="flex size-6 items-center justify-center rounded bg-[#96BF48] text-white transition-colors hover:bg-[#7da33a] disabled:opacity-50"
        aria-label="Save customer memory"
        title="Save"
      >
        {isSaving ? <RefreshCw className="size-3 animate-spin" /> : <Check className="size-3" />}
      </button>
    </div>
  ) : undefined

  return (
    <section className={panelSectionClass}>
      <SectionHeader title="WHAT WE KNOW" action={headerAction} />

      <div className="space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <label htmlFor={`customer-memory-summary-${customerId}`} className="text-xs font-medium uppercase tracking-[0.12em] text-white/30">
              Summary
            </label>
            <span className="text-xs tabular-nums text-white/25">{draftSummary.length} / {SUMMARY_MAX_CHARS}</span>
          </div>
          <textarea
            aria-label="Customer memory summary"
            id={`customer-memory-summary-${customerId}`}
            value={draftSummary}
            onChange={(event) => dispatch({ type: "summary", value: event.target.value })}
            maxLength={SUMMARY_MAX_CHARS}
            rows={3}
            className="w-full resize-none rounded-md border border-white/[0.10] bg-white/[0.04] px-2 py-1.5 text-xs leading-4 text-white/80 outline-none transition-colors placeholder:text-white/25 focus:border-white/[0.22]"
            placeholder="No summary yet."
          />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-[0.12em] text-white/30">Key facts</span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs tabular-nums text-white/25">{draftKeyFacts.length} / {KEY_FACTS_MAX}</span>
              <button
                type="button"
                onClick={handleAddFact}
                disabled={!canAddFact}
                className="flex size-5 items-center justify-center rounded text-white/35 transition-colors hover:bg-white/[0.05] hover:text-white/70 disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Add key fact"
                title="Add fact"
              >
                <Plus className="size-3" />
              </button>
            </div>
          </div>

          {draftKeyFacts.length > 0 ? (
            <div className="space-y-1.5">
              {draftKeyFacts.map((fact, index) => (
                <div key={`${fact}-${index + 1}`} className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <input
                      aria-label={`Key fact ${index + 1}`}
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
                      className="flex size-7 shrink-0 items-center justify-center rounded text-white/30 transition-colors hover:bg-white/[0.05] hover:text-red-300"
                      aria-label="Remove key fact"
                      title="Remove"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                  <div className="text-right text-xs tabular-nums text-white/20">{fact.length} / {KEY_FACT_MAX_CHARS}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-white/[0.08] px-2 py-1.5 text-xs text-white/35">No key facts.</p>
          )}
        </div>

        {flags.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-white/30">Signals</div>
            <div className="flex flex-wrap gap-1.5">
              {flags.map((flag) => (
                <span key={flag} className="rounded border border-white/[0.10] bg-white/[0.04] px-1.5 py-0.5 text-xs font-medium text-white/60">
                  {flag}
                </span>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-[0.12em] text-white/30">Recent interactions</div>
          {memory.recentInteractions.length > 0 ? (
            <div className="space-y-1.5">
              {memory.recentInteractions.slice(0, 10).map((interaction) => (
                <div key={`${interaction.threadId}-${interaction.closedAt}`} className="rounded-md border border-white/[0.07] bg-white/[0.025] px-2 py-1.5">
                  <div className="mb-0.5 flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-xs font-medium text-white/60">
                      {interaction.tag || interaction.channel}
                    </span>
                    <span className="shrink-0 text-xs text-white/30">{formatShortDate(interaction.closedAt)}</span>
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
