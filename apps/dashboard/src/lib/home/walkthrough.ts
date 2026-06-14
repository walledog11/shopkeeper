import type { HomeNeedsAttentionItem } from "@/lib/home/summary-contract"

// Higher = more urgent: money/needs_review first, then VIP, then routine.
export function walkthroughPriority(item: HomeNeedsAttentionItem): number {
  if (item.kind === "needs_review" || item.tag === "Returns") return 2
  if (item.isVip) return 1
  return 0
}

// Approximate "minutes ago" parsed from the display string for age tiebreaking.
function ageMinutes(timeAgo: string): number {
  const match = timeAgo.match(/^(\d+)([mhd])/)
  if (!match) return 0
  const value = Number(match[1])
  switch (match[2]) {
    case "h":
      return value * 60
    case "d":
      return value * 1440
    default:
      return value
  }
}

// The walkthrough set: only tickets that genuinely need a human call, in
// priority order (money/needs_review → VIP → oldest). Routine quick replies
// stay in the NeedsYou deck and are excluded here.
export function selectWalkthroughItems(
  items: HomeNeedsAttentionItem[],
): HomeNeedsAttentionItem[] {
  return items
    .filter(item => item.kind === "needs_review" || item.isVip || item.tag === "Returns")
    .sort((a, b) => {
      const priorityDelta = walkthroughPriority(b) - walkthroughPriority(a)
      if (priorityDelta !== 0) return priorityDelta
      return ageMinutes(b.timeAgo) - ageMinutes(a.timeAgo)
    })
}
