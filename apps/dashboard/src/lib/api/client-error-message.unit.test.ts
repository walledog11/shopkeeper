import { describe, expect, it } from "vitest"
import { ApiRequestError } from "@/lib/api/fetcher"
import {
  conversationLoadErrorMessage,
  inboxListErrorMessage,
} from "./client-error-message"

describe("client error messages", () => {
  it("maps conversation 404 to archived copy", () => {
    const copy = conversationLoadErrorMessage(new ApiRequestError("missing", 404, null))
    expect(copy.title).toBe("Conversation not found")
  })

  it("maps inbox 403 to access copy", () => {
    const copy = inboxListErrorMessage(new ApiRequestError("forbidden", 403, null))
    expect(copy.detail).toMatch(/workspace/i)
  })

  it("uses server message for other API failures", () => {
    const copy = conversationLoadErrorMessage(new ApiRequestError("Rate limited", 400, null))
    expect(copy.detail).toBe("Rate limited")
  })
})
