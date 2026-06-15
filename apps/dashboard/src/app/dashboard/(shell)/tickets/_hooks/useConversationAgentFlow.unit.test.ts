import { describe, expect, it } from "vitest"
import {
  getAgentCommandState,
  planRequiresApproval,
  resolvePendingPlan,
  shouldUsePrivateComposerAsk,
} from "./useConversationAgentFlow"
import type { AgentPlan } from "@/types"

describe("getAgentCommandState", () => {
  it("detects agent mode in chat and notes", () => {
    expect(getAgentCommandState("@shopkeeper refund this order", "Shopkeeper", "notes")).toEqual({
      agentInstruction: "refund this order",
      isAgentMode: true,
      triggerPrefix: "@shopkeeper",
    })

    expect(getAgentCommandState("@shopkeeper refund this order", "Shopkeeper", "chat")).toEqual({
      agentInstruction: "refund this order",
      isAgentMode: true,
      triggerPrefix: "@shopkeeper",
    })
  })
})

describe("resolvePendingPlan", () => {
  it("returns a plan with the requested instruction when visible steps exist", () => {
    const plan: AgentPlan = {
      instruction: "original",
      rawToolCalls: [{ id: "tool-1", name: "send_reply", input: {} }],
      steps: [{
        id: "tool-1",
        tool: "send_reply",
        label: "Reply to customer",
        description: "Draft and send a reply",
        category: "communication",
        enabled: true,
      }],
    }

    expect(resolvePendingPlan(plan, "new instruction")).toMatchObject({
      instruction: "new instruction",
      steps: plan.steps,
    })
  })

  it("returns null when there are no visible steps", () => {
    const plan: AgentPlan = {
      instruction: "original",
      rawToolCalls: [],
      steps: [],
    }

    expect(resolvePendingPlan(plan, "new instruction")).toBeNull()
  })
})

describe("shouldUsePrivateComposerAsk", () => {
  it("routes private questions and draft requests away from execution", () => {
    expect(shouldUsePrivateComposerAsk("What should I say to this customer?")).toBe(true)
    expect(shouldUsePrivateComposerAsk("Summarize this request")).toBe(true)
    expect(shouldUsePrivateComposerAsk("draft a reply")).toBe(true)
  })

  it("does not treat explicit action instructions as private asks", () => {
    expect(shouldUsePrivateComposerAsk("change the order to size medium")).toBe(false)
    expect(shouldUsePrivateComposerAsk("can you refund this order?")).toBe(false)
    expect(shouldUsePrivateComposerAsk("send the customer an email")).toBe(false)
  })

  it("keeps action-related questions private when they are phrased as questions", () => {
    expect(shouldUsePrivateComposerAsk("The customer wants to update their address. What should I do?")).toBe(true)
    expect(shouldUsePrivateComposerAsk("What should I say about changing the size?")).toBe(true)
  })
})

describe("planRequiresApproval", () => {
  it("requires approval for communication-only plans", () => {
    const plan: AgentPlan = {
      instruction: "reply",
      rawToolCalls: [{ id: "tool-1", name: "send_reply", input: { text: "Hi" } }],
      steps: [{
        id: "tool-1",
        tool: "send_reply",
        label: "Notify customer",
        description: "\"Hi\"",
        category: "communication",
        enabled: true,
      }],
    }

    expect(planRequiresApproval(plan)).toBe(true)
  })

  it("does not require approval when no visible side-effect steps exist", () => {
    const plan: AgentPlan = {
      instruction: "look up context",
      rawToolCalls: [{ id: "tool-1", name: "get_shopify_orders", input: { customer_id: "123" } }],
      steps: [],
    }

    expect(planRequiresApproval(plan)).toBe(false)
  })
})
