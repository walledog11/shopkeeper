import { describe, expect, it } from "vitest"
import type { ActionLogEntry } from "@/types"
import {
  REVIEW_FILTERS,
  primaryPreviewText,
  reviewItemChrome,
  reviewModeNote,
} from "./quality-panel-model"

type Action = ActionLogEntry["actions"][number]

function action(overrides: Partial<Action> = {}): Action {
  return {
    tool: "send_reply",
    result: "",
    status: "success",
    ...overrides,
  }
}

function entry(overrides: Partial<ActionLogEntry> = {}): ActionLogEntry {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    sentAt: "2026-06-20T12:00:00.000Z",
    threadId: "22222222-2222-4222-8222-222222222222",
    channelType: "email",
    threadTag: null,
    customerHandle: "alex@example.com",
    instruction: null,
    summary: "Handled the customer request.",
    actions: [action()],
    mode: "human_approved",
    approver: null,
    ...overrides,
  }
}

describe("quality panel review model", () => {
  it("drops the mode note when the status badge already says it", () => {
    expect(reviewModeNote(entry({
      actions: [action({ tool: "send_reply", input: { text: "Thanks!" } })],
      mode: "auto_executed",
    }))).toBeNull()

    expect(reviewModeNote(entry({
      actions: [action({ tool: "send_reply", input: { text: "Approved reply." } })],
      mode: "human_approved",
    }))).toBeNull()

    expect(reviewModeNote(entry({
      actions: [action({ tool: "get_shopify_orders", result: "Fetched orders." })],
      mode: "read_only",
    }))).toBeNull()
  })

  it("keeps the mode note when it adds something the badge does not", () => {
    // The board rendered "Policy block" beside a second "Approved" pill; the
    // authorisation is real information, it just is not a status.
    expect(reviewModeNote(entry({
      actions: [action({ status: "policy_block", result: "Refund exceeds limit." })],
      mode: "human_approved",
    }))).toBe("you approved")

    expect(reviewModeNote(entry({
      actions: [action({ tool: "issue_store_credit", result: "Issued $40." })],
      mode: "human_approved",
    }))).toBe("you approved")

    expect(reviewModeNote(entry({
      actions: [action({ tool: "flag_order", result: "Country mismatch." })],
      mode: "auto_executed",
    }))).toBe("sent automatically")
  })

  it("offers one filter set that queries the server, not the client", () => {
    expect(REVIEW_FILTERS.map(filter => filter.id)).toEqual([
      "all",
      "attention",
      "store",
      "auto",
      "approved",
    ])
    expect(REVIEW_FILTERS[0].query).toEqual({})
    expect(REVIEW_FILTERS.find(filter => filter.id === "attention")?.query.attention).toBe(true)
    expect(REVIEW_FILTERS.find(filter => filter.id === "store")?.query.tools).toContain("create_refund")
  })

  it("extracts the strongest preview text from outputs before summaries", () => {
    expect(primaryPreviewText(entry({
      summary: "Summary fallback.",
      actions: [action({ tool: "send_reply", input: { text: "Customer-facing reply." } })],
    }))).toBe("Customer-facing reply.")

    expect(primaryPreviewText(entry({
      summary: "Summary fallback.",
      actions: [action({ tool: "create_refund", result: "Refunded $12.00." })],
    }))).toBe("Refunded $12.00.")
  })

  it("previews the failure, not the output that never left", () => {
    expect(primaryPreviewText(entry({
      summary: "Postmark rejected the address.",
      actions: [action({
        tool: "send_email",
        status: "error",
        result: "Postmark rejected the address.",
        input: { subject: "Care guide", body: "Cool wash, line dry." },
      })],
    }))).toBe("Postmark rejected the address.")
  })

  it("derives human-readable audit labels", () => {
    expect(reviewItemChrome(entry({
      actions: [action({ status: "policy_block" })],
    })).label).toBe("Policy block")

    expect(reviewItemChrome(entry({
      actions: [action({ tool: "create_refund" })],
    })).label).toBe("Issued refund")
  })
})
