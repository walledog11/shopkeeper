import { describe, expect, it } from "vitest"
import {
  canShowTicketRowReviewAction,
  canShowTicketRowSendAction,
  hasTicketRowListAction,
} from "./ticket-row-action-visibility"
import type { TicketListPresentation } from "../../_lib/ticket-list-presentation"

function presentation(overrides: Partial<TicketListPresentation> = {}): TicketListPresentation {
  return {
    tier: "ready",
    headline: "Shipping question",
    subline: "How long does shipping take?",
    customerLabel: "Alex Rivera",
    channelName: "Email",
    timeAgo: "30m ago",
    primaryStatus: { label: "Ready to send", tone: "send" },
    action: {
      id: "send-reply",
      label: "Send reply",
      shortLabel: "Send",
      variant: "send",
      handler: "quick-approve",
    },
    showSubject: false,
    ...overrides,
  }
}

describe("TicketRowActions helpers", () => {
  it("shows send only for ready tier with quick-approve handler", () => {
    expect(canShowTicketRowSendAction(presentation())).toBe(true)
    expect(canShowTicketRowSendAction(presentation({
      tier: "review",
      action: { id: "review", label: "Review draft", shortLabel: "Review", variant: "caution", handler: "focus-plan" },
    }))).toBe(false)
    expect(canShowTicketRowSendAction(presentation({
      action: { id: "review", label: "Review draft", shortLabel: "Review", variant: "caution", handler: "focus-plan" },
    }))).toBe(false)
  })

  it("shows review only for review tier with focus-plan handler", () => {
    expect(canShowTicketRowReviewAction(presentation({
      tier: "review",
      action: { id: "review", label: "Review draft", shortLabel: "Review", variant: "caution", handler: "focus-plan" },
    }))).toBe(true)
    expect(canShowTicketRowReviewAction(presentation())).toBe(false)
  })

  it("never treats questionable downgraded actions as send", () => {
    const questionable = presentation({
      tier: "review",
      primaryStatus: { label: "Review sender", tone: "caution" },
      action: { id: "review", label: "Review draft", shortLabel: "Review", variant: "caution", handler: "focus-plan" },
    })

    expect(hasTicketRowListAction(questionable)).toBe(true)
    expect(canShowTicketRowSendAction(questionable)).toBe(false)
    expect(canShowTicketRowReviewAction(questionable)).toBe(true)
  })
})
