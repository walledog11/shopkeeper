import { describe, expect, it } from "vitest"
import { decideAutonomy } from "./autonomy.js"
import type { AgentPlan, PlanStep, RawToolCall } from "./types.js"
import {
  hollowRefundReplyPlan,
  plan,
  refundCall,
  refundPlan,
  refundStep,
  sendReplyCall,
  sendReplyStep,
  settings,
  signalsFor,
} from "./test-fixtures/plan-preview.js"

describe("decideAutonomy — tier × action matrix", () => {
  describe("watch tier", () => {
    it("downgrades a clean info-only plan to needs_review", () => {
      expect(decideAutonomy(plan(), settings({ autonomyTier: "watch" })).kind).toBe("needs_review")
    })

    it("never auto-executes a mutative plan even under cap", () => {
      expect(decideAutonomy(refundPlan(), settings({ autonomyTier: "watch" })).kind).toBe("needs_review")
    })
  })

  describe("guarded tier", () => {
    it("classifies an info-only plan as quick_reply", () => {
      expect(decideAutonomy(plan(), settings({ autonomyTier: "guarded" })).kind).toBe("quick_reply")
    })

    it("holds a reply when communication is explicitly disabled", () => {
      expect(decideAutonomy(plan(), settings({
        autonomyTier: "guarded",
        toolsEnabled: { action: true, communication: false, internal: true, read: true },
      })).kind).toBe("needs_review")
    })

    it("classifies a reply-only refund plan as needs_review, not quick_reply", () => {
      const result = decideAutonomy(
        hollowRefundReplyPlan(),
        settings({ autonomyTier: "guarded", maxRefundAmount: 100 }),
      )
      expect(result.kind).toBe("needs_review")
    })

    it("classifies a mutative plan as needs_review even when under cap", () => {
      const result = decideAutonomy(refundPlan(), settings({ autonomyTier: "guarded", maxRefundAmount: 100 }))
      expect(result.kind).toBe("needs_review")
    })
  })

  describe("trusted tier", () => {
    it("classifies an info-only plan as quick_reply", () => {
      expect(decideAutonomy(plan(), settings({ autonomyTier: "trusted" })).kind).toBe("quick_reply")
    })

    it("classifies a refund under the per-call cap as auto_execute", () => {
      const result = decideAutonomy(
        refundPlan({ input: { order_id: "9000", amount: "20.00", reason: "x" } }),
        settings({ autonomyTier: "trusted", maxRefundAmount: 100 }),
      )
      expect(result.kind).toBe("auto_execute")
      expect(result.replyText).toBe("Yes, we ship to the UK.")
      expect(result.sendReplyToolCall).toEqual(sendReplyCall)
    })

    it("keeps a refund under cap as auto_execute despite a benign missing-KB signal", () => {
      const result = decideAutonomy(
        { ...refundPlan({ input: { order_id: "9000", amount: "20.00", reason: "x" } }), signals: signalsFor(["kb_no_match"]) },
        settings({ autonomyTier: "trusted", maxRefundAmount: 100 }),
      )
      expect(result.kind).toBe("auto_execute")
    })

    it("classifies a reply-only refund plan as needs_review, not auto_execute", () => {
      const result = decideAutonomy(
        hollowRefundReplyPlan(),
        settings({ autonomyTier: "trusted", maxRefundAmount: 100 }),
      )
      expect(result.kind).toBe("needs_review")
      expect(result.kind).not.toBe("auto_execute")
    })

    it("classifies a stripped hollow-refund plan with only the guard warning as needs_review", () => {
      const result = decideAutonomy(
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
      const result = decideAutonomy(
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
      const result = decideAutonomy(
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
      const result = decideAutonomy(
        refundPlan({ input: { order_id: "9000", amount: "5.00" } }),
        settings({
          autonomyTier: "trusted",
          toolsEnabled: { action: false, communication: true, internal: true, read: true },
        }),
      )
      expect(result.kind).toBe("needs_review")
    })

    it("downgrades to needs_review when a blocking signal is present", () => {
      const result = decideAutonomy(
        {
          ...refundPlan({ input: { order_id: "9000", amount: "5.00" } }),
          signals: signalsFor(["order_not_found"]),
        },
        settings({ autonomyTier: "trusted", maxRefundAmount: 100 }),
      )
      expect(result.kind).toBe("needs_review")
    })

    it("routes a mutative-only plan with no send_reply to needs_review", () => {
      const result = decideAutonomy(
        {
          instruction: "Refund order",
          steps: [refundStep],
          rawToolCalls: [refundCall],
        },
        settings({ autonomyTier: "trusted", maxRefundAmount: 100 }),
      )
      expect(result.kind).toBe("needs_review")
    })
  })
})

// The case the storefront plan is written about: a shopper proves they own an
// order, asks where it is, and the answer is "not shipped yet". There is no
// decision in that for a merchant to make — identity is proved and no mutation is
// reachable — so it must classify as a quick reply, which is the lane that sends
// itself and raises no card. Shipping that behind "Good to send?" is what stopped
// this channel reaching a second store.
describe("decideAutonomy — a verified shopper's own order", () => {
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
    const result = decideAutonomy(
      verifiedOrderQuestion(),
      settings({ autonomyTier: "guarded", autoExecuteMode: "off" }),
    )

    expect(result.kind).toBe("quick_reply")
  })

  it("stays a quick reply when tracking is read alongside the order", () => {
    const result = decideAutonomy(
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
    const result = decideAutonomy(
      verifiedOrderQuestion(),
      settings({ autonomyTier: "guarded" }),
      { filterStatus: "questionable" },
    )

    expect(result.kind).toBe("needs_review")
  })

  it("still holds it for review on the draft-only tier", () => {
    const result = decideAutonomy(
      verifiedOrderQuestion(),
      settings({ autonomyTier: "watch" }),
    )

    expect(result.kind).toBe("needs_review")
  })

  it("does not extend to a mutation the shopper asks for on the same order", () => {
    const result = decideAutonomy(
      verifiedOrderQuestion({
        steps: [refundStep, sendReplyStep],
        rawToolCalls: [orderReadCall, refundCall, sendReplyCall],
      }),
      settings({ autonomyTier: "guarded", autoExecuteMode: "off" }),
    )

    expect(result.kind).not.toBe("quick_reply")
  })
})
