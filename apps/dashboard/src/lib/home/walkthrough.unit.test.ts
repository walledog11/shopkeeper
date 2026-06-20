import { describe, expect, it } from "vitest"
import type { HomeNeedsAttentionItem } from "@/lib/home/summary-contract"
import { selectWalkthroughItems, walkthroughPriority } from "@/lib/home/walkthrough"

function item(overrides: Partial<HomeNeedsAttentionItem> = {}): HomeNeedsAttentionItem {
  return {
    threadId: "t",
    kind: "quick_reply",
    customerName: "Sam",
    customerMessage: "hi",
    channelName: "Email",
    timeAgo: "5m ago",
    headline: "headline",
    contextLine: "context",
    proposalSummary: "proposal",
    actionText: null,
    replyText: "reply",
    question: null,
    orderRef: null,
    tag: null,
    isVip: false,
    ...overrides,
  }
}

describe("selectWalkthroughItems", () => {
  it("excludes routine quick replies", () => {
    const routine = item({ threadId: "routine", kind: "quick_reply", tag: "Shipping" })
    expect(selectWalkthroughItems([routine])).toEqual([])
  })

  it("includes a VIP even when the reply is routine", () => {
    const vip = item({ threadId: "vip", kind: "quick_reply", isVip: true })
    const selected = selectWalkthroughItems([vip])
    expect(selected.map(i => i.threadId)).toEqual(["vip"])
  })

  it("includes Returns tickets", () => {
    const ret = item({ threadId: "ret", kind: "quick_reply", tag: "Returns" })
    const selected = selectWalkthroughItems([ret])
    expect(selected.map(i => i.threadId)).toEqual(["ret"])
  })

  it("orders needs_review and Returns ahead of VIP, then by age", () => {
    const items = [
      item({ threadId: "vip", kind: "quick_reply", isVip: true, timeAgo: "2h ago" }),
      item({ threadId: "review-new", kind: "needs_review", timeAgo: "3m ago" }),
      item({ threadId: "routine", kind: "quick_reply", tag: "Shipping" }),
      item({ threadId: "returns-old", kind: "quick_reply", tag: "Returns", timeAgo: "1d ago" }),
    ]

    const selected = selectWalkthroughItems(items)

    expect(selected.map(i => i.threadId)).toEqual(["returns-old", "review-new", "vip"])
  })

  it("does not mutate the input array", () => {
    const items = [
      item({ threadId: "vip", isVip: true }),
      item({ threadId: "review", kind: "needs_review" }),
    ]
    selectWalkthroughItems(items)
    expect(items.map(i => i.threadId)).toEqual(["vip", "review"])
  })
})

describe("walkthroughPriority", () => {
  it("ranks money/needs_review above VIP above routine", () => {
    expect(walkthroughPriority(item({ kind: "needs_review" }))).toBe(2)
    expect(walkthroughPriority(item({ tag: "Returns" }))).toBe(2)
    expect(walkthroughPriority(item({ isVip: true }))).toBe(1)
    expect(walkthroughPriority(item())).toBe(0)
  })
})
