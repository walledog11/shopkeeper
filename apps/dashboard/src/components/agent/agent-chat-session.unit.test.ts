import { describe, expect, it, vi } from "vitest"
import {
  fetchOperatorTranscript,
  sendAgentChatInstruction,
  transcriptToChatMessages,
} from "./agent-chat-session"

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), init)
}

describe("sendAgentChatInstruction", () => {
  it("posts only the instruction — the gateway owns the thread", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({
      summary: "Done",
      actionsPerformed: [],
    }, { status: 200 }))

    await expect(sendAgentChatInstruction({
      fetchImpl,
      instruction: "check this order",
    })).resolves.toEqual({
      ok: true,
      summary: "Done",
      actionsPerformed: [],
    })

    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(JSON.parse((fetchImpl.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      instruction: "check this order",
    })
  })

  it("returns awaiting approval responses from the chat API", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      summary: "Here's what I'll put together…",
      actionsPerformed: [],
      awaitingApproval: true,
    }, { status: 200 }))

    await expect(sendAgentChatInstruction({
      fetchImpl,
      instruction: "create an order",
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
    })).resolves.toEqual({
      ok: false,
      error: "Plan failed",
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
