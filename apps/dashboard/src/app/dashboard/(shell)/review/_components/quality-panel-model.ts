import { TOOL_CATEGORIES, TOOL_LABELS } from "@shopkeeper/agent/tools"
import type { ActionLogQueryFilters } from "@/hooks/useActionLogEntries"
import type { ActionLogEntry } from "@/types"

export type Tone = "reply" | "escalate" | "money" | "error" | "note"
export type ReviewItemTone = "attention" | "auto" | "store" | "approved" | "error" | "note"
export type ReviewIconKey = "alert" | "check" | "message" | "note" | "store" | "tool"
export type ReviewFilterId = "all" | "attention" | "store" | "auto" | "approved"

export interface OutputBlock {
  key: string
  tool: string
  label: string
  text: string
  tone: Tone
}

export interface ReviewFilterConfig {
  id: ReviewFilterId
  label: string
  emptyTitle: string
  emptyBody: string
  query: ActionLogQueryFilters
}

export interface ReviewItemChrome {
  tone: ReviewItemTone
  icon: ReviewIconKey
  label: string
}

export const TONE_STYLES: Record<Tone, { container: string; label: string }> = {
  reply: { container: "border-emerald-200/40 bg-emerald-100/[0.12]", label: "text-emerald-700" },
  escalate: { container: "border-amber-200/40 bg-amber-100/[0.12]", label: "text-amber-700" },
  money: { container: "border-amber-200/40 bg-amber-100/[0.12]", label: "text-amber-700" },
  error: { container: "border-red-200/40 bg-red-100/[0.12]", label: "text-red-700" },
  note: { container: "border-foreground/[0.08] bg-foreground/[0.03]", label: "text-foreground/45" },
}

export const STORE_ACTION_TOOLS = [
  "create_refund",
  "cancel_order",
  "create_shopify_order",
  "edit_shopify_order",
  "create_exchange",
  "update_shopify_order_address",
  "issue_store_credit",
  "create_gift_card",
  "issue_discount",
  "flag_order",
] as const

// One list, filtered. Every label answers the same question — "show me what?"
// — so the chips read as one set instead of the four registers the board's
// column headings mixed.
export const REVIEW_FILTERS: ReviewFilterConfig[] = [
  {
    id: "all",
    label: "Everything",
    emptyTitle: "Nothing logged yet",
    emptyBody: "Every reply, lookup, and store action the agent takes is recorded here.",
    query: {},
  },
  {
    id: "attention",
    label: "Needs review",
    emptyTitle: "Nothing needs review",
    emptyBody: "Escalations, failed tools, policy blocks, and fraud flags land here.",
    query: { attention: true, excludeOperator: true },
  },
  {
    id: "store",
    label: "Store actions",
    emptyTitle: "No store actions",
    emptyBody: "Refunds, order edits, cancellations, and credits appear here.",
    query: { tools: [...STORE_ACTION_TOOLS] },
  },
  {
    id: "auto",
    label: "Sent automatically",
    emptyTitle: "Nothing sent automatically",
    emptyBody: "Work the agent completed without asking you appears here.",
    query: { modes: ["auto_executed"], excludeOperator: true },
  },
  {
    id: "approved",
    label: "You approved",
    emptyTitle: "Nothing approved yet",
    emptyBody: "Plans you approved before they ran appear here.",
    query: { modes: ["human_approved"] },
  },
]

const MONEY_TOOLS = new Set<string>(STORE_ACTION_TOOLS)

const EXTRA_TOOL_LABELS: Record<string, string> = {
  flag_order: "Flagged order",
  update_shopify_order_address: "Updated shipping address",
}

export function toolLabel(tool: string): string {
  return TOOL_LABELS[tool] ?? EXTRA_TOOL_LABELS[tool] ?? tool
}

function field(input: unknown, key: string): string | null {
  if (input && typeof input === "object" && key in input) {
    const value = (input as Record<string, unknown>)[key]
    if (typeof value === "string" && value.trim()) return value
  }
  return null
}

export function toOutputBlock(action: ActionLogEntry["actions"][number], idx: number): OutputBlock | null {
  const key = `${action.tool}-${idx}`
  switch (action.tool) {
    case "send_reply": {
      const text = field(action.input, "text")
      return text ? { key, tool: action.tool, label: "Reply to customer", text, tone: "reply" } : null
    }
    case "send_email": {
      const body = field(action.input, "body")
      if (!body) return null
      const subject = field(action.input, "subject")
      return {
        key,
        tool: action.tool,
        label: subject ? `Email \u00b7 ${subject}` : "Email",
        text: body,
        tone: "reply",
      }
    }
    case "escalate_to_human": {
      const reason = field(action.input, "reason")
      return reason
        ? { key, tool: action.tool, label: "Escalated to merchant", text: reason, tone: "escalate" }
        : null
    }
    case "add_internal_note": {
      const text = field(action.input, "text")
      return text ? { key, tool: action.tool, label: "Internal note", text, tone: "note" } : null
    }
    default:
      return null
  }
}

export function outcomeActions(entry: ActionLogEntry): ActionLogEntry["actions"] {
  return entry.actions.filter((action) => {
    if ((TOOL_CATEGORIES[action.tool] ?? "internal") === "read") return false
    return (
      action.tool !== "send_reply"
      && action.tool !== "send_email"
      && action.tool !== "escalate_to_human"
      && action.tool !== "add_internal_note"
    )
  })
}

export function isErrorStatus(status: string | undefined): boolean {
  return status === "error" || status === "policy_block" || status === "unknown"
}

export function outcomeTone(action: ActionLogEntry["actions"][number]): Tone {
  if (isErrorStatus(action.status)) return "error"
  if (MONEY_TOOLS.has(action.tool) || action.tool === "flag_order") return "money"
  return "note"
}

export function isAttentionEntry(entry: ActionLogEntry): boolean {
  return entry.actions.some(
    (action) =>
      action.tool === "escalate_to_human"
      || action.tool === "flag_order"
      || isErrorStatus(action.status),
  )
}

export function reviewItemChrome(entry: ActionLogEntry): ReviewItemChrome {
  const errored = entry.actions.find((action) => isErrorStatus(action.status))
  if (errored) {
    return {
      tone: "error",
      icon: "alert",
      label: errored.status === "policy_block"
        ? "Policy block"
        : errored.status === "unknown"
          ? "Outcome unknown"
          : "Tool error",
    }
  }

  const escalation = entry.actions.find((action) => action.tool === "escalate_to_human" || action.status === "escalated")
  if (escalation) return { tone: "attention", icon: "alert", label: "Escalated" }

  const flag = entry.actions.find((action) => action.tool === "flag_order")
  if (flag) return { tone: "attention", icon: "alert", label: "Flagged order" }

  const storeAction = entry.actions.find((action) => MONEY_TOOLS.has(action.tool))
  if (storeAction) return { tone: "store", icon: "store", label: toolLabel(storeAction.tool) }

  const reply = entry.actions.find((action) => action.tool === "send_reply" || action.tool === "send_email")
  if (entry.mode === "auto_executed") {
    return {
      tone: "auto",
      icon: reply ? "message" : "tool",
      label: reply ? "Auto reply" : "Auto action",
    }
  }

  if (entry.mode === "read_only") return { tone: "note", icon: "note", label: "Read only" }
  return { tone: "approved", icon: "check", label: "Approved" }
}

// Who authorised the turn, but only when the status badge does not already say
// so. The board rendered both unconditionally, which produced pairs like
// "Auto reply" + "Auto-sent" and, at worst, "Approved" twice on one card.
export function reviewModeNote(entry: ActionLogEntry): string | null {
  if (!entry.mode) return null
  const label = reviewItemChrome(entry).label

  if (entry.mode === "auto_executed") {
    return label.startsWith("Auto") ? null : "sent automatically"
  }
  if (entry.mode === "read_only") {
    return label === "Read only" ? null : "read-only lookup"
  }
  return label === "Approved" ? null : "you approved"
}

export function primaryPreviewText(entry: ActionLogEntry): string {
  // On a failure the failure is the story. Preferring the output block here
  // previewed the body of an email that never sent.
  const failed = entry.actions.find((action) => isErrorStatus(action.status))
  if (failed) return failed.result.trim() || entry.summary.trim() || "No output recorded."

  const output = entry.actions.map(toOutputBlock).find((block): block is OutputBlock => block !== null)
  if (output?.text.trim()) return output.text.trim()

  const outcome = outcomeActions(entry).find((action) => action.result.trim())
  if (outcome?.result.trim()) return outcome.result.trim()

  if (entry.summary.trim()) return entry.summary.trim()
  return entry.instruction?.trim() || "No output recorded."
}
