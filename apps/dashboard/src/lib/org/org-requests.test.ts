import { describe, expect, it, vi } from "vitest"
import { patchSpamFilterEnabled } from "./org-requests"

describe("patchSpamFilterEnabled", () => {
  it("patches spamFilterEnabled with the current org version", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ version: "v2", settings: { spamFilterEnabled: false } }),
    })

    await expect(patchSpamFilterEnabled(false, "v1", fetchImpl)).resolves.toMatchObject({
      version: "v2",
    })
    expect(fetchImpl).toHaveBeenCalledWith("/api/org", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { spamFilterEnabled: false }, version: "v1" }),
    })
  })

  it("throws conflict on 409", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({}) })
    await expect(patchSpamFilterEnabled(true, "v1", fetchImpl)).rejects.toThrow("conflict")
  })
})
