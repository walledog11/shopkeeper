import { afterEach, describe, expect, it, vi } from "vitest"
import {
  askAgentPrivately,
  executeApprovedAgentPlan,
  fetchAgentPlan,
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
      replyNotSent: false,
      turn: {
        instruction: "reply to customer",
        actions: [{ tool: "send_reply", result: "Sent reply" }],
        summary: "Done",
        error: null,
      },
    })
  })

  it("reports a committed plan whose reply did not go out", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        summary: "Refunded; the reply was not sent.",
        actionsPerformed: [
          { tool: "create_refund", result: "Refunded", status: "success" },
          { tool: "send_reply", result: "Error: skipped send_reply", status: "error" },
        ],
        execution: { id: "execution-1", status: "committed" },
      }), { status: 200 }),
    ))

    expect(await executeApprovedAgentPlan("thread-1", "refund and reply", [])).toMatchObject({
      ok: true,
      outcome: "committed",
      replyNotSent: true,
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
      turn: { error: expect.stringContaining("could not be confirmed") },
    })
  })

  it("treats an interrupted request as unknown instead of sent", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("connection lost")))

    const result = await executeApprovedAgentPlan("thread-1", "reply to customer", [])

    expect(result).toMatchObject({
      ok: false,
      executionId: null,
      outcome: "unknown",
      turn: { error: expect.stringContaining("could not be confirmed") },
    })
  })

  it("hands ask failures back for the caller to explain", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        error: "Agent failed.",
        actionsPerformed: [{ tool: "send_reply", result: "Sent reply" }],
      }), { status: 500 }),
    ))

    const result = await askAgentPrivately("thread-1", "what should I say?", { planHandoff: true })

    expect(result).toMatchObject({ ok: false, error: expect.objectContaining({ status: 500 }) })
  })

  it("requests agent plans without forcing regeneration by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        requestId: "request-1", status: "waiting_approval",
        plan: { instruction: "refund order", rawToolCalls: [], steps: [] },
      }), { status: 202 }),
    )
    vi.stubGlobal("fetch", fetchMock)

    await fetchAgentPlan("thread-1", "refund order")

    expect(fetchMock).toHaveBeenCalledWith("/api/agent/plan", expect.objectContaining({
      body: expect.any(String),
    }))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      threadId: "thread-1", instruction: "refund order", force: false, clientRequestId: expect.any(String),
    })
  })
})
