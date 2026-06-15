import { describe, expect, it } from "vitest"
import {
  formatPlanStepSentence,
  getPlanApproveLabel,
  getPlanCollapsedPreview,
} from "./plan-step-display"
import type { AgentPlan, PlanStep } from "@/types"

const sendReplyStep: PlanStep = {
  id: "send_1",
  tool: "send_reply",
  label: "Notify customer",
  description: '"Your order is out for delivery"',
  category: "communication",
  enabled: true,
}

const lookupStep: PlanStep = {
  id: "lookup_1",
  tool: "get_order_by_name",
  label: "Look up order",
  description: "Look up order #2961",
  category: "read",
  enabled: true,
}

const closeStep: PlanStep = {
  id: "close_1",
  tool: "update_thread_status",
  label: "Updated thread status",
  description: "Set status to closed",
  category: "internal",
  enabled: true,
}

describe("formatPlanStepSentence", () => {
  it("formats send_reply with customer first name", () => {
    expect(formatPlanStepSentence(sendReplyStep, "Morgan Lee")).toBe(
      'Reply to Morgan: "Your order is out for delivery"',
    )
  })

  it("formats order lookup from description", () => {
    expect(formatPlanStepSentence(lookupStep)).toBe("Look up order #2961")
  })

  it("maps close status to plain English", () => {
    expect(formatPlanStepSentence(closeStep)).toBe("Close the ticket")
  })
})

describe("getPlanApproveLabel", () => {
  it("uses Send reply for reply-only plans", () => {
    expect(getPlanApproveLabel([{ ...sendReplyStep, enabled: true }])).toBe("Send reply")
  })

  it("uses Do this when multiple steps are enabled", () => {
    expect(
      getPlanApproveLabel([
        { ...lookupStep, enabled: true },
        { ...sendReplyStep, enabled: true },
        { ...closeStep, enabled: true },
      ]),
    ).toBe("Do this")
  })
})

describe("getPlanCollapsedPreview", () => {
  it("shows the proposed reply text when present", () => {
    const plan: AgentPlan = {
      instruction: "Handle delivery question",
      steps: [lookupStep, sendReplyStep],
      rawToolCalls: [],
    }

    expect(getPlanCollapsedPreview(plan)).toBe("Your order is out for delivery")
  })
})
