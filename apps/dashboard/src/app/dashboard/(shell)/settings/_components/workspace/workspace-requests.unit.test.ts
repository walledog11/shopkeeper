import { describe, expect, it, vi } from "vitest"
import {
  clearWorkspaceTicketsRequest,
  deleteWorkspaceRequest,
  exportFilenameFromDisposition,
  saveWorkspaceName,
} from "./workspace-requests"

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), init)
}

describe("saveWorkspaceName", () => {
  it("returns conflict data without throwing", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      current: { name: "Updated", version: "v2" },
    }, { status: 409 }))

    await expect(saveWorkspaceName({ name: "Old", version: "v1" }, fetchImpl)).resolves.toEqual({
      status: "conflict",
      current: { name: "Updated", version: "v2" },
    })
  })

  it("throws on failed saves", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "Nope" }, { status: 500 }))

    await expect(saveWorkspaceName({ name: "Store", version: "v1" }, fetchImpl)).rejects.toThrow("Failed")
  })
})

describe("exportFilenameFromDisposition", () => {
  it("uses the response filename or a dated fallback", () => {
    expect(exportFilenameFromDisposition('attachment; filename="backup.json"')).toBe("backup.json")
    expect(exportFilenameFromDisposition("", new Date("2026-06-05T12:00:00Z"))).toBe("shopkeeper-export-2026-06-05.json")
  })
})

describe("workspace destructive requests", () => {
  it("clears tickets through the destructive org data endpoint", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }, { status: 200 }))

    await expect(clearWorkspaceTicketsRequest(fetchImpl)).resolves.toBeUndefined()
    expect(fetchImpl).toHaveBeenCalledWith("/api/org/data?action=clear_tickets", { method: "DELETE" })
  })

  it("surfaces delete workspace API failures", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ message: "Create another workspace first." }, { status: 400 }))

    await expect(deleteWorkspaceRequest("Acme", fetchImpl)).rejects.toThrow("Create another workspace first.")
  })
})
