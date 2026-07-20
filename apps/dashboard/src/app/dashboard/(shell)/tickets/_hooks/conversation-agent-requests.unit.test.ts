import { afterEach, describe, expect, it, vi } from "vitest"
import {
  askAgentPrivately,
  executeApprovedAgentPlan,
  fetchAgentPlan,
  planRequestErrorTurn,
  regenerateAgentPlan,
} from "./conversation-agent-requests"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("conversation agent requests", () => {
  it("maps successful agent execution responses into turn fields", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        summary: "Done",
        actionsPerformed: [{ tool: "send_reply", result: "Sent reply" }],
        execution: { id: "execution-1", status: "committed" },
      }), { status: 200 }),
    ))

    const result = await executeApprovedAgentPlan("thread-1", "reply to customer", [])

    expect(result).toEqual({
      ok: true,
      executionId: "execution-1",
      outcome: "committed",
      turn: {
        instruction: "reply to customer",
        actions: [{ tool: "send_reply", result: "Sent reply" }],
        summary: "Done",
        error: null,
      },
    })
  })

  it("preserves partial and unknown execution truth for recovery", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        summary: "Partially completed",
        actionsPerformed: [
          { tool: "create_refund", result: "Refunded", status: "success" },
          { tool: "send_reply", result: "Send failed", status: "error" },
        ],
        execution: { id: "execution-partial", status: "partial" },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: "Agent failed.",
        execution: { id: "execution-unknown", status: "unknown" },
      }), { status: 502 }))
    vi.stubGlobal("fetch", fetchMock)

    const partial = await executeApprovedAgentPlan("thread-1", "refund and reply", [])
    const unknown = await executeApprovedAgentPlan("thread-1", "send reply", [])

    expect(partial).toMatchObject({
      ok: false,
      executionId: "execution-partial",
      outcome: "partial",
      turn: { error: expect.stringContaining("Some plan steps completed") },
    })
    expect(unknown).toMatchObject({
      ok: false,
      executionId: "execution-unknown",
      outcome: "unknown",
      turn: { error: "Agent failed." },
    })
  })

  it("treats an interrupted request as unknown instead of sent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("connection lost")))

    const result = await executeApprovedAgentPlan("thread-1", "reply to customer", [])

    expect(result).toMatchObject({
      ok: false,
      executionId: null,
      outcome: "unknown",
      turn: { error: "Network error — please try again." },
    })
  })

  it("maps API failures into agent turns with payload details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        error: "Agent failed.",
        actionsPerformed: [{ tool: "send_reply", result: "Sent reply" }],
      }), { status: 500 }),
    ))

    const result = await askAgentPrivately("thread-1", "what should I say?")

    expect(result.ok).toBe(false)
    expect(result.turn).toMatchObject({
      instruction: "what should I say?",
      error: "Agent failed.",
      actions: [{ tool: "send_reply", result: "Sent reply" }],
    })
  })

  it("requests agent plans with optional force regeneration", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        instruction: "refund order",
        rawToolCalls: [],
        steps: [],
      }), { status: 200 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    await fetchAgentPlan("thread-1", "refund order")
    await regenerateAgentPlan("thread-1", "refund order")

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/agent/plan", expect.objectContaining({
      body: JSON.stringify({ threadId: "thread-1", instruction: "refund order", force: false }),
    }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/agent/plan", expect.objectContaining({
      body: JSON.stringify({ threadId: "thread-1", instruction: "refund order", force: true }),
    }))
  })

  it("formats plan request failures for composer turns", () => {
    expect(planRequestErrorTurn("refund order", new Error("Plan request failed"))).toMatchObject({
      instruction: "refund order",
      error: "Plan request failed",
      actions: [],
      summary: null,
    })
  })
})
