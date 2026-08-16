import { describe, expect, it } from "vitest"
import { buildAgentPlanCacheRecord } from "@shopkeeper/agent/plan-cache"
import { AGENT_PLAN_CACHE_VERSION } from "@shopkeeper/agent/plan-cache-shape"
import type { AgentPlan } from "@/types"
import { cachedPlanInstruction, getResolvedCachedPlanForThread } from "./cached-thread-plan"

const customerMessageId = "msg-customer-1"

function quickReplyPlan(): AgentPlan {
  return {
    instruction: "ignored-on-plan-object",
    steps: [{
      id: "send_1",
      tool: "send_reply",
      label: "Reply",
      description: "Hi there",
      category: "communication",
      enabled: true,
    }],
    rawToolCalls: [{ id: "send_1", name: "send_reply", input: { text: "Hi there" } }],
  }
}

describe("cached-thread-plan", () => {
  it("reads the planning instruction from the cache record", () => {
    const cache = buildAgentPlanCacheRecord({
      instruction: "respond to the collab inquiry",
      lastCustomerMessageId: customerMessageId,
      settings: {},
      plan: quickReplyPlan(),
    })

    expect(cachedPlanInstruction(cache)).toBe("respond to the collab inquiry")
  })

  it("attaches the cache instruction when resolving the current plan", () => {
    const cache = buildAgentPlanCacheRecord({
      instruction: "draft a warmer reply",
      lastCustomerMessageId: customerMessageId,
      settings: {},
      plan: quickReplyPlan(),
    })

    const resolved = getResolvedCachedPlanForThread({
      cachedPlan: cache,
      cachedPlanMessageId: customerMessageId,
      messages: [{ id: customerMessageId, senderType: "customer" }],
    })

    expect(resolved?.instruction).toBe("draft a warmer reply")
    expect(resolved?.steps.length).toBe(1)
  })

  it("returns null when the cache is stale relative to the latest message", () => {
    const cache = buildAgentPlanCacheRecord({
      instruction: "draft a reply",
      lastCustomerMessageId: "old-message",
      settings: {},
      plan: quickReplyPlan(),
    })

    expect(getResolvedCachedPlanForThread({
      cachedPlan: cache,
      cachedPlanMessageId: "old-message",
      messages: [{ id: customerMessageId, senderType: "customer" }],
    })).toBeNull()
  })

  it("defaults missing cache instructions to draft a reply", () => {
    expect(cachedPlanInstruction({
      version: AGENT_PLAN_CACHE_VERSION,
      instruction: "",
      lastCustomerMessageId: customerMessageId,
      settingsFingerprint: "x",
      plan: quickReplyPlan(),
    })).toBe("draft a reply")
  })
})
