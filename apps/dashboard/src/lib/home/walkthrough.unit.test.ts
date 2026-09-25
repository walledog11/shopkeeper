import { describe, expect, it } from "vitest"
import type { HomeNeedsAttentionItem } from "@/lib/home/summary-contract"
import { canQuickApprove, orderWalkthroughItems, walkthroughPriority } from "@/lib/home/walkthrough"

function item(overrides: Partial<HomeNeedsAttentionItem> = {}): HomeNeedsAttentionItem {
  return {
    threadId: "t",
    kind: "quick_reply",
    customerName: "Sam",
    customerMessage: "hi",
    channelName: "Email",
    timeAgo: "5m ago",
    lastMessageAt: "2026-06-14T11:55:00.000Z",
    headline: "headline",
    contextLine: "context",
    proposalSummary: "proposal",
    actionText: null,
    actionDisplay: null,
    replyText: "reply",
    question: null,
    orderRef: null,
    tag: null,
    isVip: false,
    isEscalationOnly: false,
    escalationReason: null,
    ...overrides,
  }
}

describe("orderWalkthroughItems", () => {
  it("keeps every ticket, including routine quick replies", () => {
    const routine = item({ threadId: "routine", kind: "quick_reply", tag: "Shipping" })
    const question = item({ threadId: "question", kind: "needs_merchant_input" })
    expect(orderWalkthroughItems([routine, question]).map(i => i.threadId)).toEqual(["routine", "question"])
  })

  it("orders needs_review and Returns ahead of VIP ahead of routine, then oldest first", () => {
    const items = [
      item({ threadId: "vip", isVip: true, lastMessageAt: "2026-06-14T10:00:00.000Z" }),
      item({ threadId: "review-new", kind: "needs_review", lastMessageAt: "2026-06-14T11:57:00.000Z" }),
      item({ threadId: "routine", tag: "Shipping" }),
      item({ threadId: "returns-old", tag: "Returns", lastMessageAt: "2026-06-13T12:00:00.000Z" }),
    ]

    const ordered = orderWalkthroughItems(items)

    expect(ordered.map(i => i.threadId)).toEqual(["returns-old", "review-new", "vip", "routine"])
  })

  it("does not mutate the input array", () => {
    const items = [
      item({ threadId: "vip", isVip: true }),
      item({ threadId: "review", kind: "needs_review" }),
    ]
    orderWalkthroughItems(items)
    expect(items.map(i => i.threadId)).toEqual(["vip", "review"])
  })
})

describe("canQuickApprove", () => {
  it("allows drafted replies and reviewed actions", () => {
    expect(canQuickApprove(item({ kind: "quick_reply" }))).toBe(true)
    expect(canQuickApprove(item({ kind: "needs_review" }))).toBe(true)
  })

  it("refuses questions, invalid drafts, and reply-less escalations", () => {
    expect(canQuickApprove(item({ kind: "needs_merchant_input" }))).toBe(false)
    expect(canQuickApprove(item({ kind: "invalid" }))).toBe(false)
    expect(canQuickApprove(item({ kind: "needs_review", isEscalationOnly: true }))).toBe(false)
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
