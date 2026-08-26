import { describe, expect, it } from "vitest"
import {
  actionLogEntryHref,
  formatActionLogHeadline,
  formatPlanVerdictLabel,
  formatRequestOutcomeDisplay,
  formatRequestOutcomeSummary,
  orderNameFromSummary,
  parseOrderRiskInstruction,
} from "./action-log-display"
import type { ActionLogEntry } from "@/types"

function entry(overrides: Partial<ActionLogEntry> = {}): ActionLogEntry {
  return {
    id: "turn-1",
    sentAt: "2026-04-21T12:00:00.000Z",
    threadId: null,
    channelType: null,
    threadTag: null,
    customerHandle: null,
    instruction: null,
    summary: "",
    actions: [],
    mode: "auto_executed",
    approver: null,
    ...overrides,
  }
}

describe("action log display", () => {
  it("parses order-risk instructions", () => {
    expect(parseOrderRiskInstruction("order-risk-review:7317445509440")).toEqual({
      orderId: "7317445509440",
    })
    expect(parseOrderRiskInstruction("other:123")).toBeNull()
  })

  it("extracts order names from summaries", () => {
    expect(orderNameFromSummary("Flagged order #PG1013 for review: high value")).toBe("#PG1013")
    expect(orderNameFromSummary("No order here")).toBeNull()
  })

  it("humanizes order-risk headlines and links", () => {
    const row = entry({
      instruction: "order-risk-review:7317445509440",
      summary: "Flagged order #PG1013 for review: account age",
    })

    expect(formatActionLogHeadline(row)).toBe("#PG1013 flagged for review")
    expect(actionLogEntryHref(row)).toBe("/dashboard/orders?q=%23PG1013")
  })

  it("keeps ticket headlines for support threads", () => {
    const row = entry({
      threadId: "thread-1",
      channelType: "email",
      customerHandle: "alex@example.com",
    })

    expect(formatActionLogHeadline(row)).toBe("alex@example.com")
    expect(actionLogEntryHref(row)).toBe("/dashboard/tickets?thread=thread-1")
  })

  it("links operator desk chat sessions back to the panel", () => {
    const row = entry({
      threadId: "session-9",
      channelType: "dashboard_agent",
      instruction: "How many orders shipped today?",
    })

    expect(actionLogEntryHref(row)).toBe("/dashboard?openAgent=1&session=session-9")
  })

  it("formats request outcome labels for review surfaces", () => {
    const approved = formatRequestOutcomeDisplay({
      planId: "plan-1",
      sourceMessageId: "message-1",
      planVerdict: "needs_review",
      terminalResolution: "merchant_approved",
      replyProvenance: "agent_approved",
      requestTag: "Returns",
      merchantInputAnsweredAt: null,
    })
    expect(approved.label).toBe("You approved")
    expect(approved.description).toContain("Returns")
    expect(formatPlanVerdictLabel("needs_review")).toBe("Needed approval")
    expect(formatRequestOutcomeSummary({
      planId: "plan-1",
      sourceMessageId: "message-1",
      planVerdict: "quick_reply",
      terminalResolution: "auto_resolved",
      replyProvenance: "agent_automatic",
      requestTag: "Order Status",
      merchantInputAnsweredAt: null,
    })).toBe("Order Status · Auto-resolved")
  })

  it("distinguishes manual merchant replies from approved agent sends", () => {
    const manual = formatRequestOutcomeDisplay({
      planId: "plan-2",
      sourceMessageId: "message-2",
      planVerdict: "manual",
      terminalResolution: "merchant_approved",
      replyProvenance: "manual",
      requestTag: "Support",
      merchantInputAnsweredAt: null,
    })
    expect(manual.label).toBe("You replied manually")
    expect(formatRequestOutcomeSummary({
      planId: "plan-2",
      sourceMessageId: "message-2",
      planVerdict: "manual",
      terminalResolution: "merchant_approved",
      replyProvenance: "manual",
      requestTag: "Support",
      merchantInputAnsweredAt: null,
    })).toBe("Support · You replied manually")
  })
})
