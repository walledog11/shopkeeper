import { describe, expect, it } from "vitest"
import { ApiRequestError } from "@/lib/api/fetcher"
import { requestFailureMessage } from "./client-error-message"

describe("requestFailureMessage", () => {
  it("explains a lapsed session instead of echoing the status text", () => {
    const failure = requestFailureMessage(new ApiRequestError("Unauthorized", 401, { error: "Unauthorized" }))

    expect(failure.recovery).toBe("reload")
    expect(failure.detail).not.toContain("Unauthorized")
  })

  it("keeps the server's own explanation for a coded failure", () => {
    const message = "AI spend cap reached for today. Increase the daily limit in Settings or wait until midnight UTC."
    const failure = requestFailureMessage(new ApiRequestError(message, 429, { error: message, code: "spend_cap_reached" }))

    expect(failure).toEqual({ detail: message, recovery: null })
  })
})
