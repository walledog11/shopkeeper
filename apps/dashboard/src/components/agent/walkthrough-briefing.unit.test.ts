import { describe, expect, it } from "vitest"
import type { WalkthroughItem } from "@/lib/agent/panel"
import {
  WALKTHROUGH_CLOSING,
  buildWalkthroughBriefing,
  buildWalkthroughContextPrefix,
  buildWalkthroughOpening,
  isWalkthroughComplete,
  resolveWalkthroughDecision,
} from "./walkthrough-briefing-logic"

function item(overrides: Partial<WalkthroughItem> = {}): WalkthroughItem {
  return {
    threadId: "thread-1",
    kind: "needs_review",
    customerName: "Alicia",
    customerMessage: "Can I return this?",
    channelName: "Email",
    timeAgo: "12m ago",
    lastMessageAt: "2026-06-14T11:55:00.000Z",
    headline: "Return request",
    proposalSummary: "Approve the return and send the label.",
    actionText: null,
    actionDisplay: null,
    replyText: "I can help with that return.",
    question: null,
    orderRef: "#1042",
    tag: "Returns",
    isVip: true,
    isEscalationOnly: false,
    escalationReason: null,
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

  it("records a close without reply as its own decision", () => {
    const closed = resolveWalkthroughDecision({ item: item(), index: 0, decision: "closed" })
    expect(closed).toEqual({ agentLine: "Closed Alicia's ticket without a reply.", nextIndex: 1 })
  })

  it("counts routine replies and questions in the opening", () => {
    const opening = buildWalkthroughOpening([
      item({ kind: "quick_reply", tag: null, isVip: false }),
      item({ kind: "needs_merchant_input", tag: null, isVip: false }),
    ])
    expect(opening).toContain("You've got 2 tickets waiting on you")
    expect(opening).toContain("1 has a question for you")
    expect(opening).toContain("1 has a reply ready to send")
  })

  it("never offers a draft for items that cannot be approved", () => {
    const question = buildWalkthroughBriefing(item({ kind: "needs_merchant_input", question: "Do you ship to Canada?" }))
    expect(question).toContain("I need an answer from you")
    expect(question).toContain("My question: Do you ship to Canada?")
    expect(question).not.toContain("My recommendation")

    const escalation = buildWalkthroughBriefing(item({ isEscalationOnly: true, escalationReason: "Chargeback threat." }))
    expect(escalation).toContain("I can't handle this one myself")
    expect(escalation).toContain("Chargeback threat.")

    const invalid = buildWalkthroughBriefing(item({ kind: "invalid", validationIssues: ["Reply is empty."] }))
    expect(invalid).toContain("Open the ticket to fix it. Reply is empty.")
  })

  it("builds ticket context for typed merchant questions", () => {
    const context = buildWalkthroughContextPrefix(item())

    expect(context).toContain("Advise on it in plain text")
    expect(context).toContain("Customer: Alicia (repeat customer)")
    expect(context).toContain("Channel: Email")
    expect(context).toContain("Topic: Return request")
    expect(context).toContain("Order: #1042")
    expect(context).toContain("Tag: Returns")
    expect(context).toContain('Their message: "Can I return this?"')
    expect(context).toContain("My drafted response: I can help with that return.")
    expect(context.endsWith("The merchant asks:")).toBe(true)
  })
})
