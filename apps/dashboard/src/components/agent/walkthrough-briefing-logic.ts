import type { WalkthroughItem } from "@/lib/agent/panel"
import { canQuickApprove } from "@/lib/home/walkthrough"

function customerLabel(item: WalkthroughItem): string {
  return item.customerName ?? "this customer"
}

// Why this ticket is in front of the merchant, in the agent's voice. One owner
// for the reason so the on-screen briefing and the typed-question context agree.
function walkthroughReason(item: WalkthroughItem): string {
  if (item.kind === "invalid") return "My draft failed its checks, so it can't go out as written"
  if (item.kind === "needs_merchant_input") return "I need an answer from you before I can reply"
  if (item.isEscalationOnly) return "I can't handle this one myself"
  if (item.kind === "needs_review") {
    return item.tag === "Returns"
      ? "This touches a refund or return, so I'd like your sign-off"
      : "I'd rather you sign off before I act on this"
  }
  if (item.tag === "Returns") return "This is a return"
  if (item.isVip) return `${customerLabel(item)} is a repeat customer, so I flagged it for a personal eye`
  return "This is a routine reply, ready to send"
}

function draftedResponse(item: WalkthroughItem): string {
  return (
    item.replyText?.trim() ||
    item.actionText?.trim() ||
    item.proposalSummary
  )
}

// What the merchant should do next: the draft to approve, or why they need the ticket.
function nextStep(item: WalkthroughItem, draftLabel = "My recommendation"): string {
  if (canQuickApprove(item)) return `${draftLabel}: ${draftedResponse(item)}`
  if (item.kind === "invalid") {
    const issues = item.validationIssues?.join(" ") ?? ""
    return `Open the ticket to fix it.${issues ? ` ${issues}` : ""}`
  }
  if (item.kind === "needs_merchant_input") {
    return item.question ? `My question: ${item.question}` : "Open the ticket to answer."
  }
  return item.escalationReason ?? "Open the ticket to take it from here."
}

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ""
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
}

function countOf(items: WalkthroughItem[], predicate: (item: WalkthroughItem) => boolean): number {
  return items.filter(predicate).length
}

// Opening message in the agent's voice: a templated summary of the set.
export function buildWalkthroughOpening(items: WalkthroughItem[]): string {
  const total = items.length
  const reviewCount = countOf(items, item => item.kind === "needs_review")
  const questionCount = countOf(items, item => item.kind === "needs_merchant_input")
  const readyCount = countOf(items, item => item.kind === "quick_reply")
  const vipCount = countOf(items, item => item.isVip)

  const parts: string[] = []
  if (reviewCount > 0) parts.push(`${reviewCount} need${reviewCount === 1 ? "s" : ""} your sign-off`)
  if (questionCount > 0) parts.push(`${questionCount} ${questionCount === 1 ? "has a question" : "have questions"} for you`)
  if (readyCount > 0) parts.push(`${readyCount} ${readyCount === 1 ? "has a reply" : "have replies"} ready to send`)
  const vipNote = vipCount > 0 ? ` (${vipCount} from repeat customer${vipCount === 1 ? "" : "s"})` : ""
  const breakdown = parts.length > 0 ? `: ${joinList(parts)}${vipNote}` : vipNote

  const lead = total === 1 ? "One ticket needs you" : `You've got ${total} tickets waiting on you`
  return `${lead}${breakdown}. I'll take them one at a time \u2014 approve, skip, or ask me anything.`
}

// 1-2 sentence "why I flagged this + next step", templated from the item's
// signals so the spine never depends on the LLM.
export function buildWalkthroughBriefing(item: WalkthroughItem): string {
  const vipNote =
    item.isVip && item.kind === "needs_review" ? ` ${customerLabel(item)} is also a repeat customer.` : ""

  return `${walkthroughReason(item)}.${vipNote} ${nextStep(item)}`
}

// Context block prepended to a typed question while an item is on screen, so the
// agent can advise about this ticket in plain text. Advice only; acting stays
// the deterministic Approve button.
export function buildWalkthroughContextPrefix(item: WalkthroughItem): string {
  const lines = [
    "We're reviewing a support ticket together. Advise on it in plain text \u2014 don't take any action on this ticket yourself.",
    `Customer: ${customerLabel(item)}${item.isVip ? " (repeat customer)" : ""}`,
    `Channel: ${item.channelName}`,
  ]
  if (item.headline) lines.push(`Topic: ${item.headline}`)
  if (item.orderRef) lines.push(`Order: ${item.orderRef}`)
  if (item.tag) lines.push(`Tag: ${item.tag}`)
  lines.push(`Why it's here: ${walkthroughReason(item)}`)
  if (item.customerMessage) lines.push(`Their message: "${item.customerMessage}"`)
  lines.push(nextStep(item, "My drafted response"))
  lines.push("")
  lines.push("The merchant asks:")
  return lines.join("\n")
}

export const WALKTHROUGH_CLOSING =
  "That's everything that needed you. I'm here if you want to dig into anything else."

export type WalkthroughDecision = "approved" | "closed" | "skipped"

const DECISION_LINES: Record<WalkthroughDecision, (who: string) => string> = {
  approved: who => `Done \u2014 sent to ${who}.`,
  closed: who => `Closed ${who}'s ticket without a reply.`,
  skipped: who => `Skipped ${who} for now.`,
}

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
    agentLine: DECISION_LINES[decision](customerLabel(item)),
    nextIndex: index + 1,
  }
}

export function isWalkthroughComplete(items: WalkthroughItem[], index: number): boolean {
  return index >= items.length
}
