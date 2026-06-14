import { describe, expect, it } from "vitest"
import type { WalkthroughItem } from "@/lib/agent/panel"
import {
  WALKTHROUGH_CLOSING,
  buildWalkthroughContextPrefix,
  buildWalkthroughOpening,
  isWalkthroughComplete,
  resolveWalkthroughDecision,
} from "./WalkthroughBriefing"

function item(overrides: Partial<WalkthroughItem> = {}): WalkthroughItem {
  return {
    threadId: "thread-1",
    kind: "needs_review",
    customerName: "Alicia",
    customerMessage: "Can I return this?",
    channelName: "Email",
    timeAgo: "12m ago",
    headline: "Return request",
    proposalSummary: "Approve the return and send the label.",
    actionText: null,
    replyText: "I can help with that return.",
    orderRef: "#1042",
    tag: "Returns",
    isVip: true,
    ...overrides,
  }
}

describe("walkthrough briefing flow", () => {
  it("opens, advances approve/skip decisions, and detects completion", () => {
    const items = [
      item({ threadId: "thread-1", customerName: "Alicia" }),
      item({
        threadId: "thread-2",
        kind: "quick_reply",
        customerName: "Ben",
        tag: null,
        isVip: true,
      }),
    ]
    const messages = [buildWalkthroughOpening(items)]
    let index = 0

    const approved = resolveWalkthroughDecision({
      item: items[index],
      index,
      decision: "approved",
    })
    messages.push(approved.agentLine)
    index = approved.nextIndex

    expect(index).toBe(1)
    expect(isWalkthroughComplete(items, index)).toBe(false)

    const skipped = resolveWalkthroughDecision({
      item: items[index],
      index,
      decision: "skipped",
    })
    messages.push(skipped.agentLine)
    index = skipped.nextIndex

    if (isWalkthroughComplete(items, index)) {
      messages.push(WALKTHROUGH_CLOSING)
    }

    expect(messages[0]).toContain("You've got 2")
    expect(messages[0]).toContain("approve, skip")
    expect(messages[1]).toContain("sent to Alicia")
    expect(messages[2]).toBe("Skipped Ben for now.")
    expect(messages[3]).toBe(WALKTHROUGH_CLOSING)
  })

  it("builds ticket context for typed merchant questions", () => {
    const context = buildWalkthroughContextPrefix(item())

    expect(context).toContain("Advise on it in plain text")
    expect(context).toContain("Customer: Alicia (repeat customer)")
    expect(context).toContain("Channel: Email")
    expect(context).toContain("Order: #1042")
    expect(context).toContain("Tag: Returns")
    expect(context).toContain('Their message: "Can I return this?"')
    expect(context).toContain("My drafted response: I can help with that return.")
    expect(context.endsWith("The merchant asks:")).toBe(true)
  })
})
