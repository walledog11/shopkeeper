"use client"

import { useReducer } from "react"
import { AlertCircle, Loader2 } from "lucide-react"
import FloatingToast from "@/components/ui/FloatingToast"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"

export interface MerchantAnswerResult {
  saveToKb: boolean
}

interface Props {
  threadId: string
  question: string | null
  agentName: string
  onAnswered: (result: MerchantAnswerResult) => void
}

interface MerchantAnswerState {
  answer: string
  error: string | null
  isSubmitting: boolean
  saveToKb: boolean
  succeeded: boolean
  toastMessage: string | null
}

const INITIAL_STATE: MerchantAnswerState = {
  answer: "",
  error: null,
  isSubmitting: false,
  saveToKb: true,
  succeeded: false,
  toastMessage: null,
}

function mergeState(state: MerchantAnswerState, patch: Partial<MerchantAnswerState>): MerchantAnswerState {
  return { ...state, ...patch }
}

// Shared affordance for answering an `ask_operator` question. The merchant supplies the
// missing fact; the route records it, optionally saves it to the KB, and re-plans the ticket
// so a normal reply rides the usual approval flow. Used by the home deck and the ticket view.
export default function MerchantAnswerForm({ threadId, question, agentName, onAnswered }: Props) {
  const [{ answer, error, isSubmitting, saveToKb, succeeded, toastMessage }, updateState] =
    useReducer(mergeState, INITIAL_STATE)

  const submit = async () => {
    const trimmed = answer.trim()
    if (!trimmed || isSubmitting || succeeded) return
    updateState({ isSubmitting: true, error: null })

    try {
      const response = await fetch("/api/agent/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId, answer: trimmed, saveToKb }),
      })
      const data = await response.json().catch(() => null) as { error?: string } | null

      if (!response.ok) {
        updateState({ error: data?.error ?? "Could not send your answer." })
        return
      }

      updateState({
        succeeded: true,
        toastMessage: saveToKb
          ? `Saved to knowledge base — ${agentName} won't ask this again.`
          : null,
      })
      onAnswered({ saveToKb })
    } catch {
      updateState({ error: "Network error. Try again." })
    } finally {
      updateState({ isSubmitting: false })
    }
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {question && (
          <div className="flex flex-col gap-1">
            <span className="self-start text-[11px] font-semibold text-amber-700/70">
              {agentName} needs your input
            </span>
            <div className="rounded-2xl border border-amber-600/20 bg-amber-600/[0.09] px-4 py-3">
              <p className="text-sm font-medium text-foreground/85 leading-relaxed">{question}</p>
            </div>
          </div>
        )}

        <Textarea
          value={answer}
          onChange={event => updateState({ answer: event.target.value })}
          placeholder={`Answer ${agentName}…`}
          rows={3}
          disabled={isSubmitting || succeeded}
          className="rounded-2xl bg-foreground/[0.03] min-h-[88px]"
          onKeyDown={event => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault()
              void submit()
            }
          }}
        />

        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-foreground/75">Save for next time</span>
            <span className="text-xs text-foreground/40 leading-relaxed">
              {agentName} remembers this so it won&apos;t ask again.
            </span>
          </div>
          <Switch
            tone="amber"
            checked={saveToKb}
            onChange={saveToKb => updateState({ saveToKb })}
            disabled={isSubmitting || succeeded}
            className="mt-0.5"
            ariaLabel={saveToKb ? "Don't save this answer" : "Save this answer"}
          />
        </div>

        {error && (
          <p className="flex items-center gap-1.5 text-xs text-red-600">
            <AlertCircle aria-hidden className="size-3 shrink-0" />
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={isSubmitting || succeeded || !answer.trim()}
          className="inline-flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl text-base font-semibold bg-foreground text-background hover:bg-foreground/90 transition-colors disabled:opacity-40"
        >
          {isSubmitting && <Loader2 aria-hidden className="size-4 animate-spin" />}
          {succeeded ? "Sent" : isSubmitting ? "Sending" : "Send answer"}
        </button>
      </div>

      {toastMessage && (
        <FloatingToast
          message={toastMessage}
          onDismiss={() => updateState({ toastMessage: null })}
        />
      )}
    </>
  )
}
