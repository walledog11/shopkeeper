import type { HomeNeedsAttentionItem } from "@/lib/home/summary-contract"

type WalkthroughCandidate = Pick<
  HomeNeedsAttentionItem,
  "kind" | "tag" | "isVip" | "isEscalationOnly" | "lastMessageAt"
>

// Higher = more urgent: money/needs_review first, then VIP, then routine.
export function walkthroughPriority(item: WalkthroughCandidate): number {
  if (item.kind === "needs_review" || item.tag === "Returns") return 2
  if (item.isVip) return 1
  return 0
}

// True when the card's primary action is sending the cached plan as-is.
// Questions, invalid drafts, and escalations without a reply need the ticket.
export function canQuickApprove(item: WalkthroughCandidate): boolean {
  return (item.kind === "quick_reply" || item.kind === "needs_review") && !item.isEscalationOnly
}

// The walkthrough covers every ticket in the NeedsYou deck, so its count always
// matches the briefing and the deck. Order: money/needs_review → VIP → oldest.
export function orderWalkthroughItems<T extends WalkthroughCandidate>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const priorityDelta = walkthroughPriority(b) - walkthroughPriority(a)
    if (priorityDelta !== 0) return priorityDelta
    return Date.parse(a.lastMessageAt) - Date.parse(b.lastMessageAt)
  })
}
