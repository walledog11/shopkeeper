import { describe, expect, it } from "vitest"
import {
  readAgentPlanCacheRecordShape,
  getCurrentPlanForThread,
  getPendingCustomerMessageId,
  isThreadAwaitingReply,
} from "./plan-cache-shape.js"
import { buildAgentPlanCacheRecord } from "./plan-cache.js"
import { isAgentPlanCacheHit } from "./plan-cache.js"
import { resolveAgentSettings } from "./settings.js"
import type { AgentPlan } from "./types.js"

const PLAN: AgentPlan = {
  instruction: "Handle address change",
  steps: [{
    id: "send_1",
    tool: "send_reply",
    label: "Reply",
    description: "Reply",
    category: "communication",
    enabled: true,
  }],
  rawToolCalls: [{ id: "send_1", name: "send_reply", input: { text: "All set." } }],
}

function threadWithPlan(customerMessageId: string) {
  const settings = resolveAgentSettings(null)
  return {
    cachedPlanMessageId: customerMessageId,
    cachedPlan: buildAgentPlanCacheRecord({
      instruction: "Handle address change",
      lastCustomerMessageId: customerMessageId,
      settings,
      plan: PLAN,
    }),
  }
}

describe("getPendingCustomerMessageId", () => {
  it("returns the customer message id when it is the latest non-note message", () => {
    expect(getPendingCustomerMessageId([
      { id: "cust_1", senderType: "customer" },
    ])).toBe("cust_1")
  })

  it("returns null once an outbound reply follows the customer message", () => {
    expect(getPendingCustomerMessageId([
      { id: "cust_1", senderType: "customer" },
      { id: "agent_1", senderType: "agent" },
    ])).toBeNull()
  })

  it("ignores internal notes when finding the latest conversation message", () => {
    expect(getPendingCustomerMessageId([
      { id: "cust_1", senderType: "customer" },
      { id: "agent_1", senderType: "agent" },
      { id: "note_1", senderType: "note" },
    ])).toBeNull()
  })
})

describe("isThreadAwaitingReply", () => {
  it("is true only while the latest non-note message is from the customer", () => {
    expect(isThreadAwaitingReply([{ id: "cust_1", senderType: "customer" }])).toBe(true)
    expect(isThreadAwaitingReply([
      { id: "cust_1", senderType: "customer" },
      { id: "agent_1", senderType: "agent" },
    ])).toBe(false)
  })
})

describe("getCurrentPlanForThread", () => {
  it("returns the cached plan while the thread is awaiting a reply", () => {
    const thread = threadWithPlan("cust_1")
    expect(getCurrentPlanForThread(
      thread,
      [{ id: "cust_1", senderType: "customer" }],
    )).toEqual({
      ...PLAN,
      planId: expect.any(String),
    })
  })

  it("returns null after the thread has been answered even if cache remains", () => {
    const thread = threadWithPlan("cust_1")
    expect(getCurrentPlanForThread(thread, [
      { id: "cust_1", senderType: "customer" },
      { id: "agent_1", senderType: "agent" },
    ])).toBeNull()
  })

  it("returns null when the cached plan targets an older customer message", () => {
    const thread = threadWithPlan("cust_1")
    expect(getCurrentPlanForThread(thread, [
      { id: "cust_1", senderType: "customer" },
      { id: "agent_1", senderType: "agent" },
      { id: "cust_2", senderType: "customer" },
    ])).toBeNull()
  })
})

describe("readAgentPlanCacheRecordShape", () => {
  it("reads current and previous stored agent plan cache versions", () => {
    const current = buildAgentPlanCacheRecord({
      instruction: "Handle address change",
      lastCustomerMessageId: "cust_1",
      settings: resolveAgentSettings(null),
      plan: PLAN,
    })
    const previous = { ...current, version: 1 }

    expect(readAgentPlanCacheRecordShape(current)?.plan).toEqual(PLAN)
    expect(readAgentPlanCacheRecordShape(previous)?.version).toBe(1)
    expect(readAgentPlanCacheRecordShape(previous)?.plan).toEqual(PLAN)
  })

  it("keeps dashboard approval records separate from agent plan cache records", () => {
    expect(readAgentPlanCacheRecordShape({
      kind: "dashboard_pending_approval",
      version: 1,
      instruction: "Create order",
      instructionHash: "hash",
      summary: "Approval summary",
      plan: PLAN,
      createdAt: "2026-06-01T12:00:00.000Z",
    })).toBeNull()
  })

  it("rejects invalid JSON shapes", () => {
    const current = buildAgentPlanCacheRecord({
      instruction: "Handle address change",
      lastCustomerMessageId: "cust_1",
      settings: resolveAgentSettings(null),
      plan: PLAN,
    })

    expect(readAgentPlanCacheRecordShape(null)).toBeNull()
    expect(readAgentPlanCacheRecordShape({ ...current, settingsFingerprint: 123 })).toBeNull()
    expect(readAgentPlanCacheRecordShape({
      ...current,
      plan: {
        ...PLAN,
        rawToolCalls: [{ id: "send_1", name: "send_reply" }],
      },
    })).toBeNull()
    expect(readAgentPlanCacheRecordShape({
      ...current,
      plan: {
        ...PLAN,
        steps: [{ ...PLAN.steps[0], category: "unknown" }],
      },
    })).toBeNull()
  })
})

describe("isAgentPlanCacheHit", () => {
  it("misses when the stored cache version is older than the current version", () => {
    const settings = resolveAgentSettings(null)
    const stale = {
      ...buildAgentPlanCacheRecord({
        instruction: "Handle address change",
        lastCustomerMessageId: "cust_1",
        settings,
        plan: PLAN,
      }),
      version: 2,
    }

    expect(isAgentPlanCacheHit({
      cache: stale,
      instruction: "Handle address change",
      lastCustomerMessageId: "cust_1",
      settings,
    })).toBe(false)
  })
})
