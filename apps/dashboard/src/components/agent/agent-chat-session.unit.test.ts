import { describe, expect, it, vi } from "vitest"
import {
  sendAgentChatInstruction,
  sessionToChatMessages,
  SESSION_KEY,
} from "./agent-chat-session"

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), init)
}

describe("sendAgentChatInstruction", () => {
  it("retries without a stale session after a 404", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: "Session not found" }, { status: 404 }))
      .mockResolvedValueOnce(jsonResponse({ sessionId: "new-session", summary: "Done", actionsPerformed: [] }, { status: 200 }))
    const onStaleSession = vi.fn()
    const storage = { removeItem: vi.fn() }

    await expect(sendAgentChatInstruction({
      fetchImpl,
      instruction: "check this order",
      onStaleSession,
      sessionId: "old-session",
      storage,
    })).resolves.toEqual({
      ok: true,
      sessionId: "new-session",
      summary: "Done",
      actionsPerformed: [],
    })

    expect(onStaleSession).toHaveBeenCalledOnce()
    expect(storage.removeItem).toHaveBeenCalledWith(SESSION_KEY)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(JSON.parse((fetchImpl.mock.calls[0][1] as RequestInit).body as string)).toEqual({
      instruction: "check this order",
      sessionId: "old-session",
    })
    expect(JSON.parse((fetchImpl.mock.calls[1][1] as RequestInit).body as string)).toEqual({
      instruction: "check this order",
    })
  })

  it("returns API errors as failed chat results", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "Plan failed" }, { status: 500 }))

    await expect(sendAgentChatInstruction({
      fetchImpl,
      instruction: "refund",
      sessionId: null,
      storage: { removeItem: vi.fn() },
    })).resolves.toEqual({
      ok: false,
      error: "Plan failed",
    })
  })
})

describe("sessionToChatMessages", () => {
  it("maps restored session turns into chat messages", () => {
    const messages = sessionToChatMessages({
      id: "session-1",
      createdAt: "2026-06-05T12:00:00.000Z",
      messages: [
        { role: "user", text: "Hi" },
        { role: "agent", text: "Hello" },
      ],
    })

    expect(messages).toMatchObject([
      { role: "user", text: "Hi" },
      { role: "agent", summary: "Hello", actions: [] },
    ])
    expect(messages[0].role !== "thinking" && messages[0].timestamp).toEqual(new Date("2026-06-05T12:00:00.000Z"))
  })
})
