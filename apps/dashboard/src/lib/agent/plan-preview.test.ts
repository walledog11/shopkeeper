import { describe, expect, it } from "vitest"
import { classifyHomePlan } from "@/lib/agent/plan-preview"
import type { AgentPlan, PlanStep, RawToolCall } from "@/types"

const sendReplyCall: RawToolCall = {
  id: "send_1",
  name: "send_reply",
  input: { text: "Yes, we ship to the UK." },
}

const sendReplyStep: PlanStep = {
  id: "send_1",
  tool: "send_reply",
  label: "Notify customer",
  description: "Yes, we ship to the UK.",
  category: "communication",
  enabled: true,
}

function plan(overrides: Partial<AgentPlan> = {}): AgentPlan {
  return {
    instruction: "Handle this",
    steps: [sendReplyStep],
    rawToolCalls: [sendReplyCall],
    ...overrides,
  }
}

describe("classifyHomePlan", () => {
  it("classifies a send_reply-only plan as quick reply", () => {
    const result = classifyHomePlan(plan())

    expect(result.kind).toBe("quick_reply")
    expect(result.replyText).toBe("Yes, we ship to the UK.")
    expect(result.sendReplyToolCall).toEqual(sendReplyCall)
  })

  it("allows read tools before send_reply", () => {
    const result = classifyHomePlan(plan({
      rawToolCalls: [
        { id: "read_1", name: "search_kb", input: { query: "shipping countries" } },
        sendReplyCall,
      ],
    }))

    expect(result.kind).toBe("quick_reply")
  })

  it("requires review when an internal state update is present", () => {
    const result = classifyHomePlan(plan({
      steps: [
        sendReplyStep,
        {
          id: "status_1",
          tool: "update_thread_status",
          label: "Close ticket",
          description: "Close ticket",
          category: "internal",
          enabled: true,
        },
      ],
      rawToolCalls: [
        sendReplyCall,
        { id: "status_1", name: "update_thread_status", input: { status: "closed" } },
      ],
    }))

    expect(result.kind).toBe("needs_review")
  })

  it("requires review when blocking warnings are present", () => {
    expect(classifyHomePlan(plan({ warnings: ["Policy conflict"] })).kind).toBe("needs_review")
  })

  it("allows a missing Shopify customer warning when the reply does not depend on customer or order context", () => {
    expect(classifyHomePlan(plan({
      warnings: ["Couldn't find a Shopify customer - verify the correct account is linked before approving."],
    })).kind).toBe("quick_reply")
  })

  it("requires review for a missing Shopify customer warning when the plan used customer or order context", () => {
    expect(classifyHomePlan(plan({
      rawToolCalls: [
        { id: "read_1", name: "get_shopify_orders", input: { customer_id: "123" } },
        sendReplyCall,
      ],
      warnings: ["Couldn't find a Shopify customer - verify the correct account is linked before approving."],
    })).kind).toBe("needs_review")
  })

  it("requires review for missing order or tracking warnings", () => {
    for (const warning of [
      "No matching order found - confirm the order number with the customer before proceeding.",
      "No tracking information found - the order may not have been fulfilled yet.",
    ]) {
      expect(classifyHomePlan(plan({ warnings: [warning] })).kind).toBe("needs_review")
    }
  })

  it("requires review for refund, cancel, or order edit actions", () => {
    for (const tool of ["create_refund", "cancel_order", "edit_shopify_order"]) {
      expect(classifyHomePlan(plan({
        steps: [
          {
            id: `${tool}_1`,
            tool,
            label: tool,
            description: tool,
            category: "action",
            enabled: true,
          },
        ],
        rawToolCalls: [{ id: `${tool}_1`, name: tool, input: {} }],
      })).kind).toBe("needs_review")
    }
  })

  it("requires review when a non-reply tool reuses the reply id", () => {
    expect(classifyHomePlan(plan({
      rawToolCalls: [
        sendReplyCall,
        { id: "send_1", name: "create_refund", input: { order_id: "gid://shopify/Order/1" } },
      ],
    })).kind).toBe("needs_review")
  })

  it("requires review when reply text is missing", () => {
    expect(classifyHomePlan(plan({
      rawToolCalls: [{ id: "send_1", name: "send_reply", input: {} }],
    })).kind).toBe("needs_review")
  })
})
