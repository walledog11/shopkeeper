import { describe, expect, it } from "vitest"
import { requireOkResponse } from "./useTicketActions"

describe("requireOkResponse", () => {
  it("returns for successful responses", async () => {
    await expect(requireOkResponse(new Response("{}", { status: 200 }), "Failed")).resolves.toBeUndefined()
  })

  it("uses API error messages when available", async () => {
    const response = new Response(JSON.stringify({ error: "Nope" }), { status: 400 })

    await expect(requireOkResponse(response, "Fallback")).rejects.toThrow("Nope")
  })

  it("falls back to status when the body is not JSON", async () => {
    const response = new Response("not json", { status: 502 })

    await expect(requireOkResponse(response, "Fallback")).rejects.toThrow("Fallback (502)")
  })
})
