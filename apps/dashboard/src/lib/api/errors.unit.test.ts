import { describe, expect, it } from "vitest"
import { handleApiError } from "./errors"

describe("handleApiError", () => {
  it("surfaces Anthropic authentication failures instead of a generic 500", async () => {
    const response = handleApiError({
      name: "APIError",
      status: 401,
      message: "401 invalid x-api-key",
      error: { type: "authentication_error", message: "invalid x-api-key" },
    }, "Agent plan POST", "Failed to generate plan")

    expect(response.status).toBe(503)
    const body = await response.json() as { error: string; code: string }
    expect(body.code).toBe("ai_provider_auth")
    expect(body.error).toContain("Anthropic API key")
  })

  it("surfaces exhausted Anthropic credits", async () => {
    const response = handleApiError({
      name: "APIError",
      status: 400,
      message: "credit balance too low",
      error: { type: "invalid_request_error", message: "Your credit balance is too low" },
    }, "Agent plan POST", "Failed to generate plan")

    expect(response.status).toBe(503)
    const body = await response.json() as { error: string; code: string }
    expect(body.code).toBe("ai_provider_credits")
    expect(body.error).toContain("credits are exhausted")
  })
})
