import { describe, expect, it } from "vitest"
import { buildHomeActionDisplay } from "./plan-preview.js"
import { decideAutonomy } from "./autonomy.js"
import { planSignalTiers } from "./plan-signals.js"
import type { PlanStep, RawToolCall } from "./types.js"
import {
  askOperatorCall,
  askOperatorPlan,
  hollowRefundReplyPlan,
  plan,
  refundPlan,
  sendReplyCall,
  sendReplyStep,
  settings,
  signalsFor,
} from "./test-fixtures/plan-preview.js"

describe("decideAutonomy — info-only plans (existing behavior, default tier)", () => {
  it("classifies explicit invalidity before every approvable kind", () => {
    expect(decideAutonomy(plan({
      validation: {
        status: "invalid",
        issues: [{
          code: "ungrounded_customer_reply",
          message: "The reply is ungrounded.",
          toolCallId: "send_1",
          tool: "send_reply",
        }],
      },
    })).kind).toBe("invalid")
  })

  it("classifies a send_reply-only plan as quick reply", () => {
    const result = decideAutonomy(plan())

    expect(result.kind).toBe("quick_reply")
    expect(result.replyText).toBe("Yes, we ship to the UK.")
    expect(result.sendReplyToolCall).toEqual(sendReplyCall)
  })

  it("allows read tools before send_reply", () => {
    const result = decideAutonomy(plan({
      rawToolCalls: [
        { id: "read_1", name: "search_kb", input: { query: "shipping countries" } },
        sendReplyCall,
      ],
    }))

    expect(result.kind).toBe("quick_reply")
  })

  it("requires review when an internal state update is present", () => {
    const result = decideAutonomy(plan({
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
    expect(decideAutonomy(plan({ signals: signalsFor(["shopify_lookup_failed"]) })).kind).toBe("needs_review")
  })

  it("requires review for a warning cached before signals existed", () => {
    expect(decideAutonomy(plan({ warnings: ["Policy conflict"] })).kind).toBe("needs_review")
  })

  it("requires merchant input when KB search found nothing and the plan only drafts a reply", () => {
    const result = decideAutonomy(plan({ signals: signalsFor(["kb_no_match"]) }))
    expect(result).toMatchObject({
      kind: "needs_merchant_input",
      question: "I don't have the information to answer this, so I haven't replied. What should I tell the customer?",
    })
  })

  it("allows a missing Shopify customer when the reply does not depend on customer or order context", () => {
    expect(decideAutonomy(plan({
      signals: signalsFor(["shopify_customer_unresolved"]),
    })).kind).toBe("quick_reply")
  })

  it("requires review for a missing Shopify customer when the plan used customer or order context", () => {
    const rawToolCalls: RawToolCall[] = [
      { id: "read_1", name: "get_shopify_orders", input: { customer_id: "123" } },
      sendReplyCall,
    ]
    expect(decideAutonomy(plan({
      rawToolCalls,
      signals: signalsFor(["shopify_customer_unresolved"], rawToolCalls),
    })).kind).toBe("needs_review")
  })

  it("requires review for missing order, tracking, and pre-fetch signals", () => {
    for (const code of ["order_not_found", "order_tracking_not_found", "recent_orders_fetch_failed"] as const) {
      expect(decideAutonomy(plan({ signals: signalsFor([code]) })).kind).toBe("needs_review")
    }
  })

  it("requires review when a non-reply tool reuses the reply id", () => {
    expect(decideAutonomy(plan({
      rawToolCalls: [
        sendReplyCall,
        { id: "send_1", name: "create_refund", input: { order_id: "gid://shopify/Order/1" } },
      ],
    })).kind).toBe("needs_review")
  })

  it("requires review when reply text is missing", () => {
    expect(decideAutonomy(plan({
      rawToolCalls: [{ id: "send_1", name: "send_reply", input: {} }],
    })).kind).toBe("needs_review")
  })
})

describe("decideAutonomy — ask_operator plans", () => {
  it("classifies an ask_operator plan as needs_merchant_input and surfaces the question", () => {
    const result = decideAutonomy(askOperatorPlan())

    expect(result.kind).toBe("needs_merchant_input")
    expect(result.question).toBe("Do we ship to Canada, and at what rate?")
  })

  it("classifies ask_operator preceded by read tools as needs_merchant_input", () => {
    const result = decideAutonomy(askOperatorPlan({
      rawToolCalls: [
        { id: "read_1", name: "search_kb", input: { query: "international shipping" } },
        askOperatorCall,
      ],
    }))

    expect(result.kind).toBe("needs_merchant_input")
  })

  it("keeps needs_merchant_input for a questionable sender — the ask is not a customer-facing send", () => {
    const result = decideAutonomy(askOperatorPlan(), null, { filterStatus: "questionable" })

    expect(result.kind).toBe("needs_merchant_input")
  })
})

describe("decideAutonomy — Phase 3 routing", () => {
  it("surfaces a routing question as needs_merchant_input without an ask_operator call", () => {
    const result = decideAutonomy(plan({
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

  it("never parks a ticket on a blank question", () => {
    const result = decideAutonomy(plan({
      steps: [],
      rawToolCalls: [],
      routingEvidence: { classifierState: "aligned", codes: ["policy_gap"] },
    }))
    expect(result).toMatchObject({
      kind: "needs_merchant_input",
      question: "I don't have the information to answer this, so I haven't replied. What should I tell the customer?",
    })
  })

  it("classifies an escalation plan explicitly", () => {
    const escalateStep: PlanStep = {
      id: "esc_1",
      tool: "escalate_to_human",
      label: "Escalate to merchant",
      description: "Wholesale inquiry — out of scope.",
      category: "internal",
      enabled: true,
    }
    const result = decideAutonomy(plan({
      steps: [escalateStep],
      rawToolCalls: [{ id: "esc_1", name: "escalate_to_human", input: { reason: "Wholesale — out of scope." } }],
      routing: { decision: "escalate", signals: ["out_of_scope_commercial"] },
    }))
    expect(result.kind).toBe("escalate")
  })
})

describe("decideAutonomy — questionable sender policy", () => {
  it("downgrades quick_reply to needs_review for questionable senders", () => {
    expect(decideAutonomy(plan(), null, { filterStatus: "questionable" }).kind).toBe("needs_review")
  })

  it("downgrades auto_execute to needs_review for questionable senders", () => {
    expect(
      decideAutonomy(refundPlan(), settings({ autonomyTier: "guarded", maxRefundAmount: 100 }), {
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

describe("buildHomeActionDisplay", () => {
  it("shows the provider-bound amount on a partial-refund approval", () => {
    const display = buildHomeActionDisplay(plan({
      steps: [{
        id: "partial_1",
        tool: "create_partial_refund",
        label: "Issue partial refund",
        description: "Refund the damaged napkin",
        category: "action",
        enabled: true,
      }],
      rawToolCalls: [{
        id: "partial_1",
        name: "create_partial_refund",
        input: {
          order_id: "9000",
          items: [{ line_item_id: "11", quantity: 1 }],
          reason: "One napkin arrived torn",
          approval_amount: "8.50",
          approval_currency: "USD",
        },
      }],
    }))

    expect(display).toEqual({
      chipLabel: "Issue $8.50 partial refund",
      orderRef: null,
      detailLines: ["One napkin arrived torn"],
    })
  })
})
