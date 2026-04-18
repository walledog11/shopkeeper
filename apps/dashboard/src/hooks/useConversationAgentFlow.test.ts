import { describe, expect, it } from "vitest"
import {
  getClerkCommandState,
  resolvePendingPlan,
  shouldHydratePlanOnOpen,
} from "./useConversationAgentFlow"
import type { AgentPlan } from "@/types"

describe("getClerkCommandState", () => {
  it("detects clerk mode only in the notes tab", () => {
    expect(getClerkCommandState("@clerk refund this order", "Clerk", "notes")).toEqual({
      clerkInstruction: "refund this order",
      isClerkMode: true,
      triggerPrefix: "@clerk",
    })

    expect(getClerkCommandState("@clerk refund this order", "Clerk", "chat").isClerkMode).toBe(false)
  })
})

describe("shouldHydratePlanOnOpen", () => {
  it("hydrates only when the ticket is open, revision is known, plan is unknown, and the last chat message is from the customer", () => {
    expect(shouldHydratePlanOnOpen({
      activeTab: "open",
      hasPlanRevisionKey: true,
      initialPlan: undefined,
      lastChatMessageSender: "customer",
    })).toBe(true)

    expect(shouldHydratePlanOnOpen({
      activeTab: "closed",
      hasPlanRevisionKey: true,
      initialPlan: undefined,
      lastChatMessageSender: "customer",
    })).toBe(false)

    expect(shouldHydratePlanOnOpen({
      activeTab: "open",
      hasPlanRevisionKey: true,
      initialPlan: null,
      lastChatMessageSender: "customer",
    })).toBe(false)
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
