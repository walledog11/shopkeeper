import { TOOL_CATEGORIES, TOOL_LABELS } from "@shopkeeper/agent/tools"
import type { ActionLogQueryFilters } from "@/hooks/useActionLogEntries"
import type { ActionLogEntry } from "@/types"

export type Focus = "attention" | "auto" | "all"
export type Tone = "reply" | "escalate" | "money" | "error" | "note"

export interface OutputBlock {
  key: string
  tool: string
  label: string
  text: string
  tone: Tone
}

export interface DayGroup {
  key: string
  label: string
  entries: ActionLogEntry[]
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

export const TONE_STYLES: Record<Tone, { container: string; label: string }> = {
  reply: { container: "border-emerald-800/40 bg-emerald-900/[0.12]", label: "text-emerald-300" },
  escalate: { container: "border-amber-800/40 bg-amber-900/[0.12]", label: "text-amber-300" },
  money: { container: "border-amber-800/40 bg-amber-900/[0.12]", label: "text-amber-300" },
  error: { container: "border-red-800/40 bg-red-900/[0.12]", label: "text-red-300" },
  note: { container: "border-white/[0.08] bg-white/[0.03]", label: "text-white/45" },
}

export const MODE_LABELS: Record<NonNullable<ActionLogEntry["mode"]>, string> = {
  auto_executed: "Auto-sent",
  human_approved: "Approved",
  read_only: "Read only",
}

const MONEY_TOOLS = new Set([
  "create_refund",
  "cancel_order",
  "create_shopify_order",
  "edit_shopify_order",
])

const EXTRA_TOOL_LABELS: Record<string, string> = {
  flag_order: "Flagged order",
}

export function toolLabel(tool: string): string {
  return TOOL_LABELS[tool] ?? EXTRA_TOOL_LABELS[tool] ?? tool
}

export function resolveFocus(value: string | null): Focus {
  if (value === "attention" || value === "auto" || value === "all") return value
  if (value === "escalations") return "attention"
  return "attention"
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

function isRiskEntry(entry: ActionLogEntry): boolean {
  return entry.actions.some(
    (action) =>
      MONEY_TOOLS.has(action.tool)
      || action.tool === "flag_order"
      || isErrorStatus(action.status),
  )
}

function localDayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function dayLabel(iso: string): string {
  const now = new Date()
  const key = localDayKey(iso)
  if (key === localDayKey(now.toISOString())) return "Today"
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (key === localDayKey(yesterday.toISOString())) return "Yesterday"
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  })
}

export function groupByDay(entries: ActionLogEntry[]): DayGroup[] {
  const groups: DayGroup[] = []
  for (const entry of entries) {
    const key = localDayKey(entry.sentAt)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.entries.push(entry)
    else groups.push({ key, label: dayLabel(entry.sentAt), entries: [entry] })
  }
  for (const group of groups) {
    group.entries = [
      ...group.entries.filter(isRiskEntry),
      ...group.entries.filter((entry) => !isRiskEntry(entry)),
    ]
  }
  return groups
}

export function emptyStates(agentName: string): Record<Focus, { title: string; body: string }> {
  return {
    attention: {
      title: "Nothing needs your attention",
      body: "Escalations, failed actions, and flagged orders will land here.",
    },
    auto: {
      title: "Nothing auto-sent yet",
      body: `When ${agentName} replies or acts on its own, it shows up here for a quick spot-check.`,
    },
    all: {
      title: "Nothing to review yet",
      body: `Once ${agentName} starts handling tickets, every output appears here for you to spot-check.`,
    },
  }
}
