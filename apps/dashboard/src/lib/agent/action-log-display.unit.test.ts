import { describe, expect, it } from "vitest"
import {
  actionLogEntryHref,
  formatActionLogHeadline,
  formatPlanVerdictLabel,
  formatRequestOutcomeDisplay,
  formatRequestOutcomeSummary,
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
  it("humanizes order-risk headlines and links from the recorded identity", () => {
    const row = entry({
      instruction: "order-risk-review:7317445509440",
      summary: "Flagged order #PG1013 for review: account age",
      actions: [{
        tool: "flag_order",
        result: "account age",
        status: "escalated",
        input: { reason: "account age", orderId: "7317445509440", orderName: "#PG1013" },
      }],
    })

    expect(formatActionLogHeadline(row)).toBe("#PG1013 flagged for review")
    expect(actionLogEntryHref(row)).toBe("/dashboard/orders?q=%23PG1013")
  })

  // Rows written before runOrderOps recorded the identity carry it only in the
  // summary sentence. They still have to render.
  it("falls back to the summary sentence for rows with no recorded identity", () => {
    const row = entry({
      instruction: "order-risk-review:7317445509440",
      summary: "Flagged order #PG1013 for review: account age",
      actions: [{ tool: "flag_order", result: "account age", status: "escalated" }],
    })

    expect(formatActionLogHeadline(row)).toBe("#PG1013 flagged for review")
    expect(actionLogEntryHref(row)).toBe("/dashboard/orders?q=%23PG1013")
  })

  // The old headline regex was /\border\s+(#[\w-]+)/i, which needed the name to
  // start with "#". Shopify order names are merchant-configurable and often do
  // not; those entries rendered a bare "Order flagged for review".
  it("renders an order name the old summary regex could not match", () => {
    const row = entry({
      instruction: "order-risk-review:7317445509440",
      summary: "Flagged order PG-1013 for review: account age",
      actions: [{
        tool: "flag_order",
        result: "account age",
        status: "escalated",
        input: { reason: "account age", orderId: "7317445509440", orderName: "PG-1013" },
      }],
    })

    expect(formatActionLogHeadline(row)).toBe("PG-1013 flagged for review")
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
