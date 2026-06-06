import { describe, expect, it, vi } from "vitest"
import { createArticle, deleteKnowledgeBase } from "./kb-page-requests"

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), init)
}

describe("kb-page-requests", () => {
  it("creates articles with parsed request input", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      article: {
        id: "article-1",
        organizationId: "org-1",
        knowledgeBaseId: "kb-1",
        title: "Shipping",
        body: "Body",
        tags: ["shipping"],
        createdAt: "2026-06-05T12:00:00.000Z",
        updatedAt: "2026-06-05T12:00:00.000Z",
      },
    }, { status: 200 }))
    vi.stubGlobal("fetch", fetchImpl)

    await expect(createArticle("kb-1", {
      title: "Shipping",
      body: "Body",
      tags: ["shipping"],
    })).resolves.toMatchObject({ article: { id: "article-1" } })
    expect(fetchImpl).toHaveBeenCalledWith("/api/kb/bases/kb-1/articles", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ title: "Shipping", body: "Body", tags: ["shipping"] }),
    }))

    vi.unstubAllGlobals()
  })

  it("surfaces failed destructive collection deletes", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "Collection is locked" }, { status: 409 }))
    vi.stubGlobal("fetch", fetchImpl)

    await expect(deleteKnowledgeBase("kb-1")).rejects.toThrow("Collection is locked")
    expect(fetchImpl).toHaveBeenCalledWith("/api/kb/bases/kb-1", expect.objectContaining({ method: "DELETE" }))

    vi.unstubAllGlobals()
  })
})
