/**
 * @vitest-environment jsdom
 */

import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { AgentRequestResult } from "./conversation-agent-requests"

const requestMocks = vi.hoisted(() => ({
  executeApprovedAgentPlan: vi.fn(),
}))

vi.mock("./conversation-agent-requests", async (importOriginal) => ({
  ...await importOriginal<typeof import("./conversation-agent-requests")>(),
  executeApprovedAgentPlan: requestMocks.executeApprovedAgentPlan,
}))

import {
  getAgentCommandState,
  planRequiresApproval,
  resolvePendingPlan,
  shouldUsePrivateComposerAsk,
  useConversationAgentFlow,
} from "./useConversationAgentFlow"
import type { AgentPlan, Ticket } from "@/types"

let root: Root | null = null
let container: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  root = null
  container?.remove()
  container = null
  vi.clearAllMocks()
})

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

describe("useConversationAgentFlow execution state", () => {
  it("pins non-success recovery context and scopes it to the current ticket", async () => {
    const plan: AgentPlan = {
      planId: "plan-1",
      instruction: "refund and reply",
      rawToolCalls: [{ id: "refund-1", name: "create_refund", input: {} }],
      steps: [{
        id: "refund-1",
        tool: "create_refund",
        label: "Refund order",
        description: "Refund the order",
        category: "action",
        enabled: true,
      }],
    }
    const secondPlan: AgentPlan = {
      ...plan,
      planId: "plan-2",
      instruction: "reply only",
    }
    const partialResult = {
      ok: false,
      executionId: "execution-1",
      outcome: "partial",
      turn: {
        instruction: plan.instruction,
        actions: [{ tool: "create_refund", result: "Refunded", status: "success" }],
        summary: "Partially completed",
        error: "Some plan steps failed.",
      },
    } satisfies AgentRequestResult
    requestMocks.executeApprovedAgentPlan.mockResolvedValue(partialResult)

    const callbacks = {
      onReplyChange: vi.fn(),
      onSend: vi.fn(),
      onAgentTurnAdd: vi.fn(),
      onAgentRunningChange: vi.fn(),
      onAgentComplete: vi.fn(),
      onNoteModeReset: vi.fn(),
    }
    const current: { value: ReturnType<typeof useConversationAgentFlow> | null } = { value: null }
    const capture = (value: ReturnType<typeof useConversationAgentFlow>) => {
      current.value = value
    }
    function Harness({
      ticket,
      initialPlan,
      onValue,
    }: {
      ticket: Ticket
      initialPlan: AgentPlan | null
      onValue: (value: ReturnType<typeof useConversationAgentFlow>) => void
    }) {
      const value = useConversationAgentFlow({
        ticket,
        initialPlan,
        viewTab: "chat",
        replyText: "",
        agentName: "Shopkeeper",
        ...callbacks,
      })
      React.useEffect(() => onValue(value), [onValue, value])
      return null
    }
    const firstTicket = { id: "ticket-1" } as Ticket
    const secondTicket = { id: "ticket-2" } as Ticket
    const renderHarness = (ticket: Ticket, initialPlan: AgentPlan | null) => {
      act(() => {
        root?.render(React.createElement(Harness, { ticket, initialPlan, onValue: capture }))
      })
    }

    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    renderHarness(firstTicket, plan)

    await act(async () => {
      await current.value?.handlePlanApprove(plan.rawToolCalls)
    })

    expect(current.value?.planExecutionOutcome).toBe("partial")
    expect(current.value?.pendingPlan).toEqual(plan)
    expect(callbacks.onAgentTurnAdd).toHaveBeenCalledTimes(1)

    renderHarness(secondTicket, secondPlan)
    expect(current.value?.planExecutionOutcome).toBeNull()
    expect(current.value?.pendingPlan).toEqual(secondPlan)

    renderHarness(firstTicket, null)
    expect(current.value?.planExecutionOutcome).toBe("partial")
    expect(current.value?.pendingPlan).toEqual(plan)

    act(() => current.value?.handlePlanDismiss())
    expect(current.value?.pendingPlan).toBeNull()

    requestMocks.executeApprovedAgentPlan.mockResolvedValue({
      ok: true,
      executionId: "execution-2",
      outcome: "committed",
      turn: {
        instruction: secondPlan.instruction,
        actions: [{ tool: "create_refund", result: "Refunded", status: "success" }],
        summary: "Completed",
        error: null,
      },
    } satisfies AgentRequestResult)
    renderHarness(secondTicket, secondPlan)

    await act(async () => {
      await current.value?.handlePlanApprove(secondPlan.rawToolCalls)
    })
    expect(current.value?.planExecutionOutcome).toBe("committed")
    expect(current.value?.pendingPlan).toEqual(secondPlan)

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 550))
    })
    expect(current.value?.pendingPlan).toBeNull()
  })
})
