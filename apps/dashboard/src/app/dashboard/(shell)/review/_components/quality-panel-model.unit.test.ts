import { describe, expect, it } from "vitest"
import type { ActionLogEntry } from "@/types"
import {
  classifyReviewItem,
  primaryPreviewText,
  reviewItemChrome,
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
    feedback: null,
    ...overrides,
  }
}

describe("quality panel review board model", () => {
  it("sends errors and policy blocks to Needs your eyes", () => {
    expect(classifyReviewItem(entry({
      actions: [action({ status: "error", result: "Shopify timed out." })],
      mode: "auto_executed",
    }))).toBe("attention")

    expect(classifyReviewItem(entry({
      actions: [action({ status: "policy_block", result: "Refund exceeds limit." })],
      mode: "auto_executed",
    }))).toBe("attention")
  })

  it("sends flagged orders and escalations to Needs your eyes", () => {
    expect(classifyReviewItem(entry({
      actions: [action({ tool: "flag_order", result: "Billing country mismatch." })],
      instruction: "order-risk-review:998877",
      mode: "auto_executed",
    }))).toBe("attention")

    expect(classifyReviewItem(entry({
      actions: [action({ tool: "escalate_to_human", result: "Needs merchant judgment." })],
      mode: "auto_executed",
    }))).toBe("attention")
  })

  it("sends order mutations to Store actions", () => {
    for (const tool of [
      "create_refund",
      "cancel_order",
      "create_shopify_order",
      "edit_shopify_order",
      "update_shopify_order_address",
    ]) {
      expect(classifyReviewItem(entry({
        actions: [action({ tool, result: `${tool} completed.` })],
        mode: "human_approved",
      }))).toBe("store")
    }
  })

  it("sends plain auto-executed work to Auto-sent", () => {
    expect(classifyReviewItem(entry({
      actions: [action({ tool: "send_reply", input: { text: "Thanks for reaching out." } })],
      mode: "auto_executed",
    }))).toBe("auto")
  })

  it("falls back to Approved / read-only for human-approved and read-only work", () => {
    expect(classifyReviewItem(entry({
      actions: [action({ tool: "send_reply", input: { text: "Approved reply." } })],
      mode: "human_approved",
    }))).toBe("approved")

    expect(classifyReviewItem(entry({
      actions: [action({ tool: "get_shopify_orders", result: "Fetched orders." })],
      mode: "read_only",
    }))).toBe("approved")
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

  it("derives human-readable audit labels", () => {
    expect(reviewItemChrome(entry({
      actions: [action({ status: "policy_block" })],
    })).label).toBe("Policy block")

    expect(reviewItemChrome(entry({
      actions: [action({ tool: "create_refund" })],
    })).label).toBe("Issued refund")
  })
})
