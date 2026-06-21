import { TOOL_CATEGORIES, TOOL_LABELS } from "@shopkeeper/agent/tools"
import type { ActionLogQueryFilters } from "@/hooks/useActionLogEntries"
import type { ActionLogEntry } from "@/types"

export type Focus = "attention" | "auto" | "all"
export type Tone = "reply" | "escalate" | "money" | "error" | "note"
export type ReviewColumnId = "attention" | "auto" | "store" | "approved"
export type ReviewItemTone = "attention" | "auto" | "store" | "approved" | "error" | "note"
export type ReviewIconKey = "alert" | "check" | "message" | "note" | "store" | "tool"

export interface OutputBlock {
  key: string
  tool: string
  label: string
  text: string
  tone: Tone
}

export interface ReviewColumnConfig {
  id: ReviewColumnId
  label: string
  shortLabel: string
  description: string
  emptyTitle: string
  emptyBody: string
}

export interface ReviewItemChrome {
  tone: ReviewItemTone
  icon: ReviewIconKey
  label: string
}

export const FOCUS_OPTIONS: {
  id: Focus
  label: string
  filters: ActionLogQueryFilters
}[] = [
  { id: "attention", label: "Needs your eyes", filters: { attention: true, excludeOperator: true } },
  { id: "auto", label: "Auto-sent", filters: { modes: ["auto_executed"], excludeOperator: true } },
  { id: "all", label: "Everything", filters: {} },
]

export const REVIEW_BOARD_COLUMNS: ReviewColumnConfig[] = [
  {
    id: "attention",
    label: "Needs your eyes",
    shortLabel: "Needs eyes",
    description: "Escalations, flags, errors, and policy blocks.",
    emptyTitle: "Nothing needs review",
    emptyBody: "Escalations, failed tools, and fraud flags will land here.",
  },
  {
    id: "auto",
    label: "Auto-sent",
    shortLabel: "Auto-sent",
    description: "Replies and routine actions sent without approval.",
    emptyTitle: "Nothing auto-sent",
    emptyBody: "Autonomous replies and actions will appear here for spot checks.",
  },
  {
    id: "store",
    label: "Store actions",
    shortLabel: "Store",
    description: "Refunds, cancellations, order edits, and order creation.",
    emptyTitle: "No store actions",
    emptyBody: "Refunds, order edits, cancellations, and created orders will appear here.",
  },
  {
    id: "approved",
    label: "Approved / read-only",
    shortLabel: "Approved",
    description: "Human-approved work and read-only agent lookups.",
    emptyTitle: "Nothing approved yet",
    emptyBody: "Approved turns and read-only checks will appear here.",
  },
]

export const TONE_STYLES: Record<Tone, { container: string; label: string }> = {
  reply: { container: "border-emerald-800/40 bg-emerald-900/[0.12]", label: "text-emerald-300" },
  escalate: { container: "border-amber-800/40 bg-amber-900/[0.12]", label: "text-amber-300" },
  money: { container: "border-amber-800/40 bg-amber-900/[0.12]", label: "text-amber-300" },
  error: { container: "border-red-800/40 bg-red-900/[0.12]", label: "text-red-300" },
  note: { container: "border-foreground/[0.08] bg-foreground/[0.03]", label: "text-foreground/45" },
}

export const MODE_LABELS: Record<NonNullable<ActionLogEntry["mode"]>, string> = {
  auto_executed: "Auto-sent",
  human_approved: "Approved",
  read_only: "Read only",
}

export const STORE_ACTION_TOOLS = [
  "create_refund",
  "cancel_order",
  "create_shopify_order",
  "edit_shopify_order",
  "update_shopify_order_address",
  "flag_order",
] as const

const MONEY_TOOLS = new Set<string>(STORE_ACTION_TOOLS)

const EXTRA_TOOL_LABELS: Record<string, string> = {
  flag_order: "Flagged order",
  update_shopify_order_address: "Updated shipping address",
}

export function toolLabel(tool: string): string {
  return TOOL_LABELS[tool] ?? EXTRA_TOOL_LABELS[tool] ?? tool
}

export function resolveFocus(value: string | null): Focus {
  if (value === "attention" || value === "auto" || value === "all") return value
  if (value === "escalations") return "attention"
  return "all"
}

export function parseFromParam(value: string | null): string | null {
  if (!value) return null
  if (value === "24h") return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString()
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
  return status === "error" || status === "policy_block"
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

export function isStoreActionEntry(entry: ActionLogEntry): boolean {
  return entry.actions.some((action) => MONEY_TOOLS.has(action.tool))
}

export function classifyReviewItem(entry: ActionLogEntry): ReviewColumnId {
  if (isAttentionEntry(entry)) return "attention"
  if (isStoreActionEntry(entry)) return "store"
  if (entry.mode === "auto_executed") return "auto"
  return "approved"
}

export function columnsForFocus(focus: Focus): ReviewColumnId[] {
  if (focus === "attention") return ["attention"]
  if (focus === "auto") return ["auto"]
  return REVIEW_BOARD_COLUMNS.map((column) => column.id)
}

export function reviewItemChrome(entry: ActionLogEntry): ReviewItemChrome {
  const errored = entry.actions.find((action) => isErrorStatus(action.status))
  if (errored) {
    return {
      tone: "error",
      icon: "alert",
      label: errored.status === "policy_block" ? "Policy block" : "Tool error",
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

export function primaryPreviewText(entry: ActionLogEntry): string {
  const output = entry.actions.map(toOutputBlock).find((block): block is OutputBlock => block !== null)
  if (output?.text.trim()) return output.text.trim()

  const outcome = outcomeActions(entry).find((action) => action.result.trim())
  if (outcome?.result.trim()) return outcome.result.trim()

  if (entry.summary.trim()) return entry.summary.trim()
  return entry.instruction?.trim() || "No output recorded."
}
