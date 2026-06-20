import type { WalkthroughItem } from "@/lib/agent/panel"

function customerLabel(item: WalkthroughItem): string {
  return item.customerName ?? "this customer"
}

function recommendation(item: WalkthroughItem): string {
  return (
    item.replyText?.trim() ||
    item.actionText?.trim() ||
    item.proposalSummary
  )
}

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ""
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
}

// Opening message in the agent's voice: a templated summary of the set.
export function buildWalkthroughOpening(items: WalkthroughItem[]): string {
  const total = items.length
  const reviewCount = items.filter(item => item.kind === "needs_review").length
  const returnsCount = items.filter(item => item.tag === "Returns").length
  const vipCount = items.filter(item => item.isVip).length

  const parts: string[] = []
  if (reviewCount > 0) parts.push(`${reviewCount} I want your sign-off on`)
  if (returnsCount > 0) parts.push(`${returnsCount} return${returnsCount === 1 ? "" : "s"}`)
  if (vipCount > 0) parts.push(`${vipCount} from repeat customer${vipCount === 1 ? "" : "s"}`)
  const breakdown = parts.length > 0 ? ` \u2014 ${joinList(parts)}` : ""

  const lead = total === 1 ? "One ticket needs your call" : `You've got ${total} that need your call`
  return `${lead}${breakdown}. I'll take them one at a time \u2014 approve, skip, or ask me anything.`
}

// 1-2 sentence "why I flagged this + recommendation", templated from the item's
// signals so the spine never depends on the LLM.
export function buildWalkthroughBriefing(item: WalkthroughItem): string {
  const who = customerLabel(item)
  const reason =
    item.kind === "needs_review" && item.tag === "Returns"
      ? "This touches a refund or return, so I'd like your sign-off"
      : item.kind === "needs_review"
        ? "I'd rather you sign off before I act on this"
        : item.tag === "Returns"
          ? "This is a return"
          : item.isVip
            ? `${who} is a repeat customer, so I flagged it for a personal eye`
            : "This needs a human eye"

  const vipNote =
    item.isVip && item.kind === "needs_review" ? ` ${who} is also a repeat customer.` : ""

  return `${reason}.${vipNote} My recommendation: ${recommendation(item)}`
}

// Context block prepended to a typed question while an item is on screen, so the
// agent can advise about this ticket in plain text. Advice only; acting stays
// the deterministic Approve button.
export function buildWalkthroughContextPrefix(item: WalkthroughItem): string {
  const reason =
    item.kind === "needs_review" && item.tag === "Returns"
      ? "it touches a refund or return and I want your sign-off"
      : item.kind === "needs_review"
        ? "I'd rather sign off with you before acting"
        : item.tag === "Returns"
          ? "it's a return (money-touching)"
          : item.isVip
            ? "it's from a repeat customer"
            : "it needs a human eye"

  const lines = [
    "We're reviewing a support ticket together. Advise on it in plain text \u2014 don't take any action on this ticket yourself.",
    `Customer: ${customerLabel(item)}${item.isVip ? " (repeat customer)" : ""}`,
    `Channel: ${item.channelName}`,
  ]
  if (item.orderRef) lines.push(`Order: ${item.orderRef}`)
  if (item.tag) lines.push(`Tag: ${item.tag}`)
  lines.push(`Why I flagged it: ${reason}`)
  if (item.customerMessage) lines.push(`Their message: "${item.customerMessage}"`)
  lines.push(`My drafted response: ${recommendation(item)}`)
  lines.push("")
  lines.push("The merchant asks:")
  return lines.join("\n")
}

export const WALKTHROUGH_CLOSING =
  "That's everything that needed you. I'm here if you want to dig into anything else."

export function walkthroughApprovedLine(item: WalkthroughItem): string {
  return `Done \u2014 sent to ${customerLabel(item)}.`
}

export function walkthroughSkippedLine(item: WalkthroughItem): string {
  return `Skipped ${customerLabel(item)} for now.`
}

export type WalkthroughDecision = "approved" | "skipped"

export function resolveWalkthroughDecision({
  item,
  index,
  decision,
}: {
  item: WalkthroughItem
  index: number
  decision: WalkthroughDecision
}): { agentLine: string; nextIndex: number } {
  return {
    agentLine: decision === "approved" ? walkthroughApprovedLine(item) : walkthroughSkippedLine(item),
    nextIndex: index + 1,
  }
}

export function isWalkthroughComplete(items: WalkthroughItem[], index: number): boolean {
  return index >= items.length
}
