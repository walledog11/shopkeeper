import { describe, expect, it, vi } from "vitest"
import { jsonResponse } from "@shopkeeper/agent/testing";
import {
  fetchOperatorTranscript,
  sendAgentChatInstruction,
  transcriptToChatMessages,
} from "./agent-chat-session"

describe("sendAgentChatInstruction", () => {
  it("submits a stable request identity and returns its durable response", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({
      requestId: "request-1",
      statusUrl: "/api/agent/requests/request-1",
      status: "completed",
      response: { summary: "Done", actionsPerformed: [], awaitingApproval: false },
    }, { status: 202 }))

    await expect(sendAgentChatInstruction({
      fetchImpl,
      instruction: "check this order",
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      pollIntervalMs: 0,
    })).resolves.toEqual({
      ok: true,
      summary: "Done",
      actionsPerformed: [],
    })

    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(JSON.parse((fetchImpl.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      instruction: "check this order",
    })
  })

  it("returns awaiting approval responses from the chat API", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      requestId: "request-1",
      status: "waiting_approval",
      response: {
        summary: "Here's what I'll put together…",
        actionsPerformed: [],
        awaitingApproval: true,
      },
    }, { status: 202 }))

    await expect(sendAgentChatInstruction({
      fetchImpl,
      instruction: "create an order",
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      pollIntervalMs: 0,
    })).resolves.toEqual({
      ok: true,
      summary: "Here's what I'll put together…",
      actionsPerformed: [],
      awaitingApproval: true,
    })
  })

  it("returns API errors as failed chat results", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "Plan failed" }, { status: 500 }))

    await expect(sendAgentChatInstruction({
      fetchImpl,
      instruction: "refund",
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      pollIntervalMs: 0,
    })).resolves.toEqual({
      ok: false,
      error: "Plan failed",
    })
  })

  it("reuses the same identity when the accepted response is lost", async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockResolvedValueOnce(jsonResponse({
        requestId: "request-1",
        status: "completed",
        response: { summary: "Recovered", actionsPerformed: [] },
      }, { status: 202 }))

    await expect(sendAgentChatInstruction({
      fetchImpl,
      instruction: "check this order",
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      pollIntervalMs: 0,
    })).resolves.toMatchObject({ ok: true, summary: "Recovered" })

    const bodies = fetchImpl.mock.calls.map((call) => JSON.parse((call[1] as RequestInit).body as string))
    expect(bodies[0].clientRequestId).toBe(bodies[1].clientRequestId)
  })

  it("retrieves a slow result through status polling after the POST ends", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        requestId: "request-1", statusUrl: "/api/agent/requests/request-1",
        status: "queued", response: null,
      }, { status: 202 }))
      .mockResolvedValueOnce(jsonResponse({ status: "running", response: null }))
      .mockResolvedValueOnce(jsonResponse({
        status: "completed",
        response: { summary: "Eventually done", actionsPerformed: [] },
      }))

    await expect(sendAgentChatInstruction({
      fetchImpl,
      instruction: "slow provider call",
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      pollIntervalMs: 0,
    })).resolves.toMatchObject({ ok: true, summary: "Eventually done" })
    expect(fetchImpl.mock.calls.map(call => call[0])).toEqual([
      "/api/agent/chat",
      "/api/agent/requests/request-1",
      "/api/agent/requests/request-1",
    ])
  })

  it("does not present a stale persisted response as success when the task needs reconciliation", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      requestId: "request-1",
      status: "reconciling",
      response: { summary: "This may have completed", actionsPerformed: [] },
    }, { status: 202 }))

    await expect(sendAgentChatInstruction({
      fetchImpl,
      instruction: "refund this order",
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      pollIntervalMs: 0,
    })).resolves.toEqual({
      ok: false,
      error: "This request needs review before it can continue.",
    })
  })
})

describe("fetchOperatorTranscript", () => {
  it("reports unavailable rather than throwing when the panel can't restore", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "nope" }, { status: 500 }))

    await expect(fetchOperatorTranscript(fetchImpl)).resolves.toEqual({ status: "unavailable" })
  })
})

describe("transcriptToChatMessages", () => {
  it("maps the operator thread's turns into chat messages", () => {
    const messages = transcriptToChatMessages({
      messages: [
        { role: "user", text: "Hi" },
        { role: "agent", text: "Hello" },
      ],
    })

    expect(messages).toMatchObject([
      { role: "user", text: "Hi" },
      { role: "agent", summary: "Hello", actions: [] },
    ])
  })
})
