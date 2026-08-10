import { afterEach, describe, expect, it, vi } from "vitest"
import { connectForwardingEmail, updateIntegrationEmail } from "./requests"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("integration requests", () => {
  it("preserves structured API error messages for mutation toasts", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ error: "That support address is already connected." }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    )))

    await expect(connectForwardingEmail("email", "support@example.test"))
      .rejects.toThrow("That support address is already connected.")
  })

  it("keeps the existing update endpoint and request body", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal("fetch", fetch)

    await updateIntegrationEmail("integration-id", "support@example.test")

    expect(fetch).toHaveBeenCalledWith("/api/integrations/integration-id", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromEmail: "support@example.test" }),
    })
  })
})
