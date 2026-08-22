import { describe, expect, it } from "vitest"
import { buildHomeActionDisplay, buildPlanPreview, classifyHomePlan, isEscalationOnlyPlan, planEscalationReason } from "./plan-preview.js"
import { buildPlanSignals, planSignalTiers } from "./plan-signals.js"
import type { AgentPlan, OrgSettings, PlanStep, ProducedPlanSignalCode, RawToolCall } from "./types.js"

// Signals as the planner builds them: severity resolved against the plan's own
// tool calls, never hand-written by the test.
function signalsFor(codes: ProducedPlanSignalCode[], rawToolCalls: RawToolCall[] = []) {
  return buildPlanSignals(codes, rawToolCalls)
}

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

// Emitted by the planner whenever search_kb returns nothing (common for KB-light
// stores). It is a reply-grounding note, not an action-risk signal.

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
    signals: signalsFor(["mutative_intent_no_action"]),
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

  it("requires review when a blocking signal is present", () => {
    expect(classifyHomePlan(plan({ signals: signalsFor(["shopify_lookup_failed"]) })).kind).toBe("needs_review")
  })

  it("requires review for a warning cached before signals existed", () => {
    expect(classifyHomePlan(plan({ warnings: ["Policy conflict"] })).kind).toBe("needs_review")
  })

  it("requires merchant input when KB search found nothing and the plan only drafts a reply", () => {
    const result = classifyHomePlan(plan({ signals: signalsFor(["kb_no_match"]) }))
    expect(result.kind).toBe("needs_merchant_input")
    expect(result.question).toBeNull()
  })

  it("allows a missing Shopify customer when the reply does not depend on customer or order context", () => {
    expect(classifyHomePlan(plan({
      signals: signalsFor(["shopify_customer_unresolved"]),
    })).kind).toBe("quick_reply")
  })

  it("requires review for a missing Shopify customer when the plan used customer or order context", () => {
    const rawToolCalls: RawToolCall[] = [
      { id: "read_1", name: "get_shopify_orders", input: { customer_id: "123" } },
      sendReplyCall,
    ]
    expect(classifyHomePlan(plan({
      rawToolCalls,
      signals: signalsFor(["shopify_customer_unresolved"], rawToolCalls),
    })).kind).toBe("needs_review")
  })

  it("requires review for missing order, tracking, and pre-fetch signals", () => {
    for (const code of ["order_not_found", "order_tracking_not_found", "recent_orders_fetch_failed"] as const) {
      expect(classifyHomePlan(plan({ signals: signalsFor([code]) })).kind).toBe("needs_review")
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

describe("classifyHomePlan — Phase 3 routing", () => {
  it("surfaces a routing question as needs_merchant_input without an ask_operator call", () => {
    const result = classifyHomePlan(plan({
      steps: [],
      rawToolCalls: [],
      routing: {
        decision: "needs_review",
        signals: ["policy_question"],
        question: 'What should I tell the customer about: "Do you ship to Canada?"?',
      },
    }))
    expect(result.kind).toBe("needs_merchant_input")
    expect(result.question).toContain("Do you ship to Canada")
  })

  it("classifies an escalation plan as needs_review", () => {
    const escalateStep: PlanStep = {
      id: "esc_1",
      tool: "escalate_to_human",
      label: "Escalate to merchant",
      description: "Wholesale inquiry — out of scope.",
      category: "internal",
      enabled: true,
    }
    const result = classifyHomePlan(plan({
      steps: [escalateStep],
      rawToolCalls: [{ id: "esc_1", name: "escalate_to_human", input: { reason: "Wholesale — out of scope." } }],
      routing: { decision: "escalate", signals: ["out_of_scope_commercial"] },
    }))
    expect(result.kind).toBe("needs_review")
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

    it("holds a reply when communication is explicitly disabled", () => {
      expect(classifyHomePlan(plan(), settings({
        autonomyTier: "guarded",
        toolsEnabled: { action: true, communication: false, internal: true, read: true },
      })).kind).toBe("needs_review")
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

    it("keeps a refund under cap as auto_execute despite a benign missing-KB signal", () => {
      const result = classifyHomePlan(
        { ...refundPlan({ input: { order_id: "9000", amount: "20.00", reason: "x" } }), signals: signalsFor(["kb_no_match"]) },
        settings({ autonomyTier: "trusted", maxRefundAmount: 100 }),
      )
      expect(result.kind).toBe("auto_execute")
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
          signals: signalsFor(["mutative_intent_no_action"]),
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

    it("downgrades to needs_review when a blocking signal is present", () => {
      const result = classifyHomePlan(
        {
          ...refundPlan({ input: { order_id: "9000", amount: "5.00" } }),
          signals: signalsFor(["order_not_found"]),
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

describe("planSignalTiers", () => {
  it("treats a missing Shopify customer as advisory for reply-only plans", () => {
    const tiers = planSignalTiers(plan({ signals: signalsFor(["shopify_customer_unresolved"]) }))
    expect(tiers.blocking).toEqual([])
    expect(tiers.advisory.map(signal => signal.code)).toEqual(["shopify_customer_unresolved"])
  })

  it("treats a missing Shopify customer as blocking when order context was used", () => {
    const rawToolCalls: RawToolCall[] = [
      { id: "read_1", name: "get_shopify_orders", input: { customer_id: "123" } },
      sendReplyCall,
    ]
    const tiers = planSignalTiers(plan({
      rawToolCalls,
      signals: signalsFor(["shopify_customer_unresolved"], rawToolCalls),
    }))
    expect(tiers.blocking.map(signal => signal.code)).toEqual(["shopify_customer_unresolved"])
    expect(tiers.advisory).toEqual([])
  })

  it("treats a KB miss as advisory", () => {
    const tiers = planSignalTiers(plan({ signals: signalsFor(["kb_no_match"]) }))
    expect(tiers.blocking).toEqual([])
    expect(tiers.advisory.map(signal => signal.code)).toEqual(["kb_no_match"])
  })

  it("treats every other signal as blocking", () => {
    const tiers = planSignalTiers(plan({ signals: signalsFor(["shopify_lookup_failed", "order_not_found"]) }))
    expect(tiers.blocking.map(signal => signal.code)).toEqual(["shopify_lookup_failed", "order_not_found"])
    expect(tiers.advisory).toEqual([])
  })

  it("treats mutative-intent guard signals as blocking", () => {
    const tiers = planSignalTiers(hollowRefundReplyPlan())
    expect(tiers.blocking.map(signal => signal.code)).toEqual(["mutative_intent_no_action"])
    expect(tiers.advisory).toEqual([])
  })

  it("treats a warning cached before signals existed as blocking, uncoded", () => {
    const tiers = planSignalTiers(plan({ warnings: ["Policy conflict"] }))
    expect(tiers.blocking).toEqual([
      { code: "legacy_warning", severity: "blocking", message: "Policy conflict" },
    ])
    expect(tiers.advisory).toEqual([])
  })

  it("collapses a condition raised twice into one signal", () => {
    expect(signalsFor(["order_not_found", "order_not_found"]).map(signal => signal.code))
      .toEqual(["order_not_found"])
  })
})

const trackingStep: PlanStep = {
  id: "track_1",
  tool: "get_order_tracking",
  label: "Fetch order tracking",
  description: "Check the carrier scan history for order #1042",
  category: "read",
  enabled: true,
}

describe("buildHomeActionDisplay", () => {
  it("structures an address update with chip, order ref, and address lines", () => {
    const display = buildHomeActionDisplay(plan({
      steps: [{
        id: "addr_1",
        tool: "update_shopify_order_address",
        label: "Update address",
        description: "Change the shipping address before fulfillment",
        category: "action",
        enabled: true,
      }],
      rawToolCalls: [{
        id: "addr_1",
        name: "update_shopify_order_address",
        input: {
          order_number: "#1062",
          address1: "742 Evergreen Terrace",
          city: "Springfield",
          province: "IL",
          zip: "62704",
          country: "US",
        },
      }],
    }))

    expect(display).toEqual({
      chipLabel: "Update address",
      orderRef: "#1062",
      detailLines: ["742 Evergreen Terrace", "Springfield, IL, 62704"],
    })
  })

  it("structures a refund with amount chip and reason detail", () => {
    const display = buildHomeActionDisplay(refundPlan({
      input: { order_id: "9000", amount: "28.00", reason: "cracked Ceramic Mug" },
    }))

    expect(display).toEqual({
      chipLabel: "Issue $28.00 refund",
      orderRef: null,
      detailLines: ["cracked Ceramic Mug"],
    })
  })

  it("reads order_number from action tools when building plan orderRef", () => {
    const preview = buildPlanPreview(plan({
      steps: [{
        id: "addr_1",
        tool: "update_shopify_order_address",
        label: "Update address",
        description: "Update address",
        category: "action",
        enabled: true,
      }],
      rawToolCalls: [{
        id: "addr_1",
        name: "update_shopify_order_address",
        input: { order_number: "#1062", address1: "1 Main", city: "LA", province: "CA", zip: "90001", country: "US" },
      }],
    }), null, "Change my address")

    expect(preview.orderRef).toBe("#1062")
  })
})

describe("buildPlanPreview — merchant-facing copy", () => {
  it("falls through to the customer's message when there is no plan", () => {
    const preview = buildPlanPreview(null, null, "Where is my order?")

    expect(preview.proposal).toBe("")
    expect(preview.headline).toBe("Where is my order?")
  })

  it("leaves the proposal empty when the plan has nothing beyond its headline step", () => {
    const preview = buildPlanPreview(
      plan({ steps: [refundStep], rawToolCalls: [refundCall] }),
      null,
      "Please refund me.",
    )

    expect(preview.proposal).toBe("")
  })

  it("never emits the internal no-plan status string", () => {
    for (const preview of [
      buildPlanPreview(null, null, "Where is my order?"),
      buildPlanPreview(null, "Customer asks about shipping", null),
      buildPlanPreview(plan(), null, null),
    ]) {
      expect(preview.proposal).not.toContain("No plan generated")
    }
  })

  it("reads action chains as prose, not as a joined step list", () => {
    const preview = buildPlanPreview(
      plan({
        steps: [trackingStep, sendReplyStep],
        rawToolCalls: [{ id: "track_1", name: "get_order_tracking", input: { order_id: "1042" } }, sendReplyCall],
      }),
      null,
      "Where is my order?",
    )

    expect(preview.proposal).toBe("Fetch order tracking, then reply")
    expect(preview.proposal).not.toContain(" + ")
  })

  it("uses the registry label for read steps instead of the planner's narration", () => {
    const preview = buildPlanPreview(
      plan({
        steps: [trackingStep, refundStep, sendReplyStep],
        rawToolCalls: [refundCall, sendReplyCall],
      }),
      null,
      "Where is my order?",
    )

    expect(preview.proposal).not.toContain("carrier scan history")
  })

  it("keeps the description on non-read steps, where it carries the specifics", () => {
    const preview = buildPlanPreview(askOperatorPlan(), null, "Do you ship to Canada?")

    expect(preview.proposal).toBe("Do we ship to Canada, and at what rate?")
  })
})

// The case the storefront plan is written about: a shopper proves they own an
// order, asks where it is, and the answer is "not shipped yet". There is no
// decision in that for a merchant to make — identity is proved and no mutation is
// reachable — so it must classify as a quick reply, which is the lane that sends
// itself and raises no card. Shipping that behind "Good to send?" is what stopped
// this channel reaching a second store.
describe("classifyHomePlan — a verified shopper's own order", () => {
  const orderReadCall: RawToolCall = {
    id: "read_1",
    name: "get_order_by_name",
    input: { order_name: "#1024" },
  }

  function verifiedOrderQuestion(overrides: Partial<AgentPlan> = {}): AgentPlan {
    return plan({
      instruction: "Answer where the order is",
      rawToolCalls: [orderReadCall, sendReplyCall],
      ...overrides,
    })
  }

  it("is a quick reply on the default tier with auto-execute off", () => {
    const result = classifyHomePlan(
      verifiedOrderQuestion(),
      settings({ autonomyTier: "guarded", autoExecuteMode: "off" }),
    )

    expect(result.kind).toBe("quick_reply")
  })

  it("stays a quick reply when tracking is read alongside the order", () => {
    const result = classifyHomePlan(
      verifiedOrderQuestion({
        rawToolCalls: [
          orderReadCall,
          { id: "read_2", name: "get_order_tracking", input: { order_id: "1024" } },
          sendReplyCall,
        ],
      }),
      settings({ autonomyTier: "guarded" }),
    )

    expect(result.kind).toBe("quick_reply")
  })

  it("still holds it for review when the sender looks questionable", () => {
    const result = classifyHomePlan(
      verifiedOrderQuestion(),
      settings({ autonomyTier: "guarded" }),
      { filterStatus: "questionable" },
    )

    expect(result.kind).toBe("needs_review")
  })

  it("still holds it for review on the draft-only tier", () => {
    const result = classifyHomePlan(
      verifiedOrderQuestion(),
      settings({ autonomyTier: "watch" }),
    )

    expect(result.kind).toBe("needs_review")
  })

  it("does not extend to a mutation the shopper asks for on the same order", () => {
    const result = classifyHomePlan(
      verifiedOrderQuestion({
        steps: [refundStep, sendReplyStep],
        rawToolCalls: [orderReadCall, refundCall, sendReplyCall],
      }),
      settings({ autonomyTier: "guarded", autoExecuteMode: "off" }),
    )

    expect(result.kind).not.toBe("quick_reply")
  })
})

describe("escalation plan helpers", () => {
  it("detects escalation-only plans without a customer reply", () => {
    const escalateOnly: AgentPlan = {
      instruction: "handle",
      steps: [{
        id: "esc_1",
        tool: "escalate_to_human",
        label: "Escalate",
        description: "",
        category: "internal",
        enabled: true,
      }],
      rawToolCalls: [{
        id: "esc_1",
        name: "escalate_to_human",
        input: { reason: "Partnership inquiry — needs marketing." },
      }],
      routing: { decision: "escalate", signals: ["out_of_scope_commercial"] },
    }

    expect(isEscalationOnlyPlan(escalateOnly)).toBe(true)
    expect(planEscalationReason(escalateOnly)).toBe("Partnership inquiry — needs marketing.")
  })

  it("does not treat a reply plus escalation as escalation-only", () => {
    const planWithReply: AgentPlan = {
      instruction: "handle",
      steps: [sendReplyStep],
      rawToolCalls: [
        sendReplyCall,
        { id: "esc_1", name: "escalate_to_human", input: { reason: "Also flag for review." } },
      ],
    }

    expect(isEscalationOnlyPlan(planWithReply)).toBe(false)
    expect(planEscalationReason(planWithReply)).toBe("Also flag for review.")
  })
})
