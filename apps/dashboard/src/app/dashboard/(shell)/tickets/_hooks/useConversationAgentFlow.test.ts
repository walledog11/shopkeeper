/**
 * @vitest-environment jsdom
 */

import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { AgentRequestResult } from "./conversation-agent-requests"

const requestMocks = vi.hoisted(() => ({
  dismissAgentPlan: vi.fn().mockResolvedValue(undefined),
  executeApprovedAgentPlan: vi.fn(),
  recoverAgentPlan: vi.fn().mockResolvedValue(null),
}))

vi.mock("./conversation-agent-requests", async (importOriginal) => ({
  ...await importOriginal<typeof import("./conversation-agent-requests")>(),
  dismissAgentPlan: requestMocks.dismissAgentPlan,
  executeApprovedAgentPlan: requestMocks.executeApprovedAgentPlan,
  recoverAgentPlan: requestMocks.recoverAgentPlan,
}))

import {
  getAgentCommandState,
  planRequiresApproval,
  resolvePendingPlan,
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

// Renders the hook in a bare component that each test re-renders with the
// ticket and server plan an SWR refresh would bring.
function mountFlow() {
  const callbacks = {
    onReplyChange: vi.fn(),
    onSend: vi.fn(),
    onAgentTurnAdd: vi.fn(),
    onAgentRunningChange: vi.fn(),
    onAgentComplete: vi.fn(),
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
      replyText: "",
      ...callbacks,
    })
    React.useEffect(() => onValue(value), [onValue, value])
    return null
  }
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
  const renderHarness = (ticket: Ticket, initialPlan: AgentPlan | null) => {
    act(() => {
      root?.render(React.createElement(Harness, { ticket, initialPlan, onValue: capture }))
    })
  }
  return { callbacks, current, renderHarness }
}

describe("getAgentCommandState", () => {
  it("detects agent mode from the @shopkeeper prefix", () => {
    expect(getAgentCommandState("@shopkeeper refund this order")).toEqual({
      agentInstruction: "refund this order",
      isAgentMode: true,
      triggerPrefix: "@shopkeeper",
    })

    expect(getAgentCommandState("refund this order")).toEqual({
      agentInstruction: "",
      isAgentMode: false,
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

  it("keeps a zero-step invalid proposal visible", () => {
    const plan: AgentPlan = {
      instruction: "original",
      rawToolCalls: [],
      steps: [],
      validation: {
        status: "invalid",
        issues: [{ code: "invalid_tool_input", message: "A tool input is invalid." }],
      },
    }

    expect(resolvePendingPlan(plan, "new instruction")).toMatchObject({
      instruction: "new instruction",
      validation: { status: "invalid" },
    })
    expect(planRequiresApproval(plan)).toBe(true)
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

    const { callbacks, current, renderHarness } = mountFlow()
    const firstTicket = { id: "ticket-1" } as Ticket
    const secondTicket = { id: "ticket-2" } as Ticket
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

    await act(async () => current.value?.handlePlanDismiss())
    expect(current.value?.pendingPlan).toBeNull()

    requestMocks.executeApprovedAgentPlan.mockResolvedValue({
      ok: true,
      executionId: "execution-2",
      outcome: "committed",
      replyNotSent: false,
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

    // The write committed but the reply did not go out: the card says so and
    // stays until the merchant dismisses it.
    const thirdTicket = { id: "ticket-3" } as Ticket
    const thirdPlan: AgentPlan = { ...plan, planId: "plan-3" }
    requestMocks.executeApprovedAgentPlan.mockResolvedValue({
      ok: true,
      executionId: "execution-3",
      outcome: "committed",
      replyNotSent: true,
      turn: {
        instruction: thirdPlan.instruction,
        actions: [
          { tool: "create_refund", result: "Refunded", status: "success" },
          { tool: "send_reply", result: "Error: skipped send_reply", status: "error" },
        ],
        summary: "Refunded; the reply was not sent.",
        error: null,
      },
    } satisfies AgentRequestResult)
    renderHarness(thirdTicket, thirdPlan)

    await act(async () => {
      await current.value?.handlePlanApprove(thirdPlan.rawToolCalls)
    })
    expect(current.value?.planExecutionOutcome).toBe("reply_not_sent")
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 550))
    })
    expect(current.value?.pendingPlan).toEqual(thirdPlan)
  })

  it("shows the next server plan after a card was restored, dismissed, sent or left partial", async () => {
    const draft = (planId: string): AgentPlan => ({
      planId,
      instruction: "reply",
      rawToolCalls: [{ id: "reply-1", name: "send_reply", input: {} }],
      steps: [{
        id: "reply-1",
        tool: "send_reply",
        label: "Reply to customer",
        description: "Reply to the customer",
        category: "communication",
        enabled: true,
      }],
    })
    const [first, second, third, fourth, fifth] = ["plan-1", "plan-2", "plan-3", "plan-4", "plan-5"].map(draft)
    const sent = {
      ok: true,
      executionId: "execution-sent",
      outcome: "committed",
      replyNotSent: false,
      turn: { instruction: "reply", actions: [], summary: "Sent", error: null },
    } satisfies AgentRequestResult
    const partial = {
      ok: false,
      executionId: "execution-partial",
      outcome: "partial",
      turn: { instruction: "reply", actions: [], summary: "Partially completed", error: "Some plan steps failed." },
    } satisfies AgentRequestResult
    const ticket = { id: "ticket-1" } as Ticket
    requestMocks.recoverAgentPlan.mockResolvedValueOnce(first)
    const { current, renderHarness } = mountFlow()
    const shownPlanId = () => current.value?.pendingPlan?.planId ?? null

    // Opening the ticket restores the merchant's waiting draft, then the
    // customer writes again and the next plan is cached.
    renderHarness(ticket, first)
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    renderHarness(ticket, second)
    expect(shownPlanId()).toBe("plan-2")

    await act(async () => current.value?.handlePlanDismiss())
    renderHarness(ticket, null)
    renderHarness(ticket, third)
    expect(shownPlanId()).toBe("plan-3")

    requestMocks.executeApprovedAgentPlan.mockResolvedValue(sent)
    await act(async () => current.value?.handlePlanApprove(third.rawToolCalls))
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 550))
    })
    renderHarness(ticket, null)
    expect(shownPlanId()).toBeNull()
    renderHarness(ticket, fourth)
    expect(shownPlanId()).toBe("plan-4")

    // A partial run stays up while its plan is out of the cache, gives way to
    // the next plan, and does not come back when that one clears.
    requestMocks.executeApprovedAgentPlan.mockResolvedValue(partial)
    await act(async () => current.value?.handlePlanApprove(fourth.rawToolCalls))
    renderHarness(ticket, null)
    expect(shownPlanId()).toBe("plan-4")
    expect(current.value?.planExecutionOutcome).toBe("partial")
    renderHarness(ticket, fifth)
    expect(shownPlanId()).toBe("plan-5")
    renderHarness(ticket, null)
    expect(shownPlanId()).toBeNull()
  })
})
