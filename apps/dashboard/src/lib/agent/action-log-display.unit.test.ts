import { describe, expect, it } from "vitest"
import {
  actionLogEntryHref,
  formatActionLogHeadline,
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
    feedback: null,
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
})
