import { describe, expect, it } from "vitest"
import { MUTATIVE_INTENT_NO_ACTION_WARNING } from "./planner-safety.js"
import { classifyHomePlan, isPlanWarningBlocking, planWarningTiers } from "./plan-preview.js"
import type { AgentPlan, OrgSettings, PlanStep, RawToolCall } from "./types.js"

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

const refundStep: PlanStep = {
  id: "refund_1",
  tool: "create_refund",
  label: "Issue refund",
  description: "Refund $20",
  category: "action",
  enabled: true,
}

const refundCall: RawToolCall = {
  id: "refund_1",
  name: "create_refund",
  input: { order_id: "9000", amount: "20.00", reason: "wrong size" },
}

function plan(overrides: Partial<AgentPlan> = {}): AgentPlan {
  return {
    instruction: "Handle this",
    steps: [sendReplyStep],
    rawToolCalls: [sendReplyCall],
    ...overrides,
  }
}

function refundPlan(refundOverrides: Partial<RawToolCall> = {}): AgentPlan {
  return {
    instruction: "Refund order",
    steps: [refundStep, sendReplyStep],
    rawToolCalls: [{ ...refundCall, ...refundOverrides }, sendReplyCall],
  }
}

function settings(overrides: Partial<OrgSettings>): Partial<OrgSettings> {
  return overrides
}

const hollowRefundReplyCall: RawToolCall = {
  id: "send_1",
  name: "send_reply",
  input: { text: "I've issued a refund for order #4003." },
}

function hollowRefundReplyPlan(overrides: Partial<AgentPlan> = {}): AgentPlan {
  return plan({
    instruction: "Refund order",
    rawToolCalls: [hollowRefundReplyCall],
    warnings: [MUTATIVE_INTENT_NO_ACTION_WARNING],
    ...overrides,
  })
}

const askOperatorCall: RawToolCall = {
  id: "ask_1",
  name: "ask_operator",
  input: { question: "Do we ship to Canada, and at what rate?" },
}

const askOperatorStep: PlanStep = {
  id: "ask_1",
  tool: "ask_operator",
  label: "Ask the merchant",
  description: "Do we ship to Canada, and at what rate?",
  category: "internal",
  enabled: true,
}

function askOperatorPlan(overrides: Partial<AgentPlan> = {}): AgentPlan {
  return {
    instruction: "Answer shipping question",
    steps: [askOperatorStep],
    rawToolCalls: [askOperatorCall],
    ...overrides,
  }
}

describe("classifyHomePlan — info-only plans (existing behavior, default tier)", () => {
  it("classifies a send_reply-only plan as quick reply", () => {
    const result = classifyHomePlan(plan())

    expect(result.kind).toBe("quick_reply")
    expect(result.replyText).toBe("Yes, we ship to the UK.")
    expect(result.sendReplyToolCall).toEqual(sendReplyCall)
  })

  it("classifies an order-status fast-path plan as needs_review", () => {
    const result = classifyHomePlan(plan({ orderStatusFastPath: true }))

    expect(result.kind).toBe("needs_review")
    expect(result.replyText).toBe("Yes, we ship to the UK.")
    expect(result.sendReplyToolCall?.name).toBe("send_reply")
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

describe("classifyHomePlan — ask_operator plans", () => {
  it("classifies an ask_operator plan as needs_merchant_input and surfaces the question", () => {
    const result = classifyHomePlan(askOperatorPlan())

    expect(result.kind).toBe("needs_merchant_input")
    expect(result.question).toBe("Do we ship to Canada, and at what rate?")
    expect(result.replyText).toBeNull()
    expect(result.sendReplyToolCall).toBeNull()
  })

  it("classifies ask_operator preceded by read tools as needs_merchant_input", () => {
    const result = classifyHomePlan(askOperatorPlan({
      rawToolCalls: [
        { id: "read_1", name: "search_kb", input: { query: "international shipping" } },
        askOperatorCall,
      ],
    }))

    expect(result.kind).toBe("needs_merchant_input")
  })

  it("keeps needs_merchant_input for a questionable sender — the ask is not a customer-facing send", () => {
    const result = classifyHomePlan(askOperatorPlan(), null, { filterStatus: "questionable" })

    expect(result.kind).toBe("needs_merchant_input")
  })
})

describe("classifyHomePlan — tier × action matrix", () => {
  describe("watch tier", () => {
    it("downgrades a clean info-only plan to needs_review", () => {
      expect(classifyHomePlan(plan(), settings({ autonomyTier: "watch" })).kind).toBe("needs_review")
    })

    it("never auto-executes a mutative plan even under cap", () => {
      expect(classifyHomePlan(refundPlan(), settings({ autonomyTier: "watch" })).kind).toBe("needs_review")
    })
  })

  describe("guarded tier", () => {
    it("classifies an info-only plan as quick_reply", () => {
      expect(classifyHomePlan(plan(), settings({ autonomyTier: "guarded" })).kind).toBe("quick_reply")
    })

    it("classifies a reply-only refund plan as needs_review, not quick_reply", () => {
      const result = classifyHomePlan(
        hollowRefundReplyPlan(),
        settings({ autonomyTier: "guarded", maxRefundAmount: 100 }),
      )
      expect(result.kind).toBe("needs_review")
      expect(result.replyText).toBeNull()
      expect(result.sendReplyToolCall).toBeNull()
    })

    it("classifies a mutative plan as needs_review even when under cap", () => {
      const result = classifyHomePlan(refundPlan(), settings({ autonomyTier: "guarded", maxRefundAmount: 100 }))
      expect(result.kind).toBe("needs_review")
    })
  })

  describe("trusted tier", () => {
    it("classifies an info-only plan as quick_reply", () => {
      expect(classifyHomePlan(plan(), settings({ autonomyTier: "trusted" })).kind).toBe("quick_reply")
    })

    it("classifies a refund under the per-call cap as auto_execute", () => {
      const result = classifyHomePlan(
        refundPlan({ input: { order_id: "9000", amount: "20.00", reason: "x" } }),
        settings({ autonomyTier: "trusted", maxRefundAmount: 100 }),
      )
      expect(result.kind).toBe("auto_execute")
      expect(result.replyText).toBe("Yes, we ship to the UK.")
      expect(result.sendReplyToolCall).toEqual(sendReplyCall)
    })

    it("classifies a reply-only refund plan as needs_review, not auto_execute", () => {
      const result = classifyHomePlan(
        hollowRefundReplyPlan(),
        settings({ autonomyTier: "trusted", maxRefundAmount: 100 }),
      )
      expect(result.kind).toBe("needs_review")
      expect(result.kind).not.toBe("auto_execute")
      expect(result.replyText).toBeNull()
      expect(result.sendReplyToolCall).toBeNull()
    })

    it("classifies a stripped hollow-refund plan with only the guard warning as needs_review", () => {
      const result = classifyHomePlan(
        {
          instruction: "Refund order",
          steps: [],
          rawToolCalls: [],
          warnings: [MUTATIVE_INTENT_NO_ACTION_WARNING],
        },
        settings({ autonomyTier: "trusted", maxRefundAmount: 100 }),
      )
      expect(result.kind).toBe("needs_review")
    })

    it("downgrades a refund over the per-call cap to needs_review", () => {
      const result = classifyHomePlan(
        refundPlan({ input: { order_id: "9000", amount: "200.00", reason: "x" } }),
        settings({ autonomyTier: "trusted", maxRefundAmount: 100 }),
      )
      expect(result.kind).toBe("needs_review")
    })

    it("downgrades a cancellation to needs_review when blockCancellations is set", () => {
      const cancelCall: RawToolCall = {
        id: "cancel_1",
        name: "cancel_order",
        input: { order_id: "9000", reason: "customer" },
      }
      const cancelStep: PlanStep = {
        id: "cancel_1",
        tool: "cancel_order",
        label: "Cancel order",
        description: "Cancel",
        category: "action",
        enabled: true,
      }
      const result = classifyHomePlan(
        {
          instruction: "Cancel order",
          steps: [cancelStep, sendReplyStep],
          rawToolCalls: [cancelCall, sendReplyCall],
        },
        settings({ autonomyTier: "trusted", blockCancellations: true }),
      )
      expect(result.kind).toBe("needs_review")
    })

    it("downgrades to needs_review when the action category is disabled", () => {
      const result = classifyHomePlan(
        refundPlan({ input: { order_id: "9000", amount: "5.00" } }),
        settings({
          autonomyTier: "trusted",
          toolsEnabled: { action: false, communication: true, internal: true, read: true },
        }),
      )
      expect(result.kind).toBe("needs_review")
    })

    it("downgrades to needs_review when a blocking warning is present", () => {
      const result = classifyHomePlan(
        {
          ...refundPlan({ input: { order_id: "9000", amount: "5.00" } }),
          warnings: ["No matching order found - confirm the order number with the customer before proceeding."],
        },
        settings({ autonomyTier: "trusted", maxRefundAmount: 100 }),
      )
      expect(result.kind).toBe("needs_review")
    })

    it("routes a mutative-only plan with no send_reply to needs_review", () => {
      const result = classifyHomePlan(
        {
          instruction: "Refund order",
          steps: [refundStep],
          rawToolCalls: [refundCall],
        },
        settings({ autonomyTier: "trusted", maxRefundAmount: 100 }),
      )
      expect(result.kind).toBe("needs_review")
      expect(result.replyText).toBeNull()
      expect(result.sendReplyToolCall).toBeNull()
    })
  })

  describe("broad and full tiers (V1: route as trusted)", () => {
    it("auto-executes a refund under cap on broad", () => {
      expect(classifyHomePlan(refundPlan(), settings({ autonomyTier: "broad", maxRefundAmount: 250 })).kind)
        .toBe("auto_execute")
    })

    it("auto-executes a refund under cap on full", () => {
      expect(classifyHomePlan(refundPlan(), settings({ autonomyTier: "full", maxRefundAmount: 1000 })).kind)
        .toBe("auto_execute")
    })
  })
})

describe("classifyHomePlan — questionable sender policy", () => {
  it("downgrades quick_reply to needs_review for questionable senders", () => {
    expect(classifyHomePlan(plan(), null, { filterStatus: "questionable" }).kind).toBe("needs_review")
  })

  it("downgrades auto_execute to needs_review for questionable senders", () => {
    expect(
      classifyHomePlan(refundPlan(), settings({ autonomyTier: "guarded", maxRefundAmount: 100 }), {
        filterStatus: "questionable",
      }).kind,
    ).toBe("needs_review")
  })
})

describe("planWarningTiers", () => {
  const shopifyWarning = "Couldn't find a Shopify customer - verify the correct account is linked before approving."

  it("treats a missing Shopify customer warning as informational for reply-only plans", () => {
    const tiers = planWarningTiers(plan({ warnings: [shopifyWarning] }))
    expect(tiers.blocking).toEqual([])
    expect(tiers.informational).toEqual([shopifyWarning])
    expect(isPlanWarningBlocking(shopifyWarning, plan({ warnings: [shopifyWarning] }))).toBe(false)
  })

  it("treats a missing Shopify customer warning as blocking when order context was used", () => {
    const warnedPlan = plan({
      rawToolCalls: [
        { id: "read_1", name: "get_shopify_orders", input: { customer_id: "123" } },
        sendReplyCall,
      ],
      warnings: [shopifyWarning],
    })
    const tiers = planWarningTiers(warnedPlan)
    expect(tiers.blocking).toEqual([shopifyWarning])
    expect(tiers.informational).toEqual([])
    expect(isPlanWarningBlocking(shopifyWarning, warnedPlan)).toBe(true)
  })

  it("treats policy warnings as blocking", () => {
    expect(isPlanWarningBlocking("Policy conflict", plan({ warnings: ["Policy conflict"] }))).toBe(true)
  })

  it("treats mutative-intent guard warnings as blocking", () => {
    const warnedPlan = hollowRefundReplyPlan()
    const tiers = planWarningTiers(warnedPlan)
    expect(tiers.blocking).toEqual([MUTATIVE_INTENT_NO_ACTION_WARNING])
    expect(tiers.informational).toEqual([])
    expect(isPlanWarningBlocking(MUTATIVE_INTENT_NO_ACTION_WARNING, warnedPlan)).toBe(true)
  })
})
