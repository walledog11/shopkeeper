import { describe, expect, it } from "vitest"
import type { KnowledgeBase } from "@/types"
import type { ArticleWithBase } from "./kb-page-utils"
import { buildMemoryBooks, filterMemoryBooks } from "./memory-books"

const base = (input: Partial<KnowledgeBase> & Pick<KnowledgeBase, "id" | "name" | "source">): KnowledgeBase => ({
  organizationId: "org-1",
  createdAt: "2026-01-01T00:00:00.000Z",
  articles: [],
  ...input,
})

const article = (input: Partial<ArticleWithBase> & Pick<ArticleWithBase, "id" | "knowledgeBaseId" | "baseName" | "baseSource">): ArticleWithBase => ({
  organizationId: "org-1",
  title: "Policy",
  body: "Policy body",
  tags: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...input,
})

describe("buildMemoryBooks", () => {
  it("projects settings and sources into distinct books", () => {
    const bases = [
      base({ id: "learned-base", name: "Shipping", source: "user" }),
      base({ id: "notes-base", name: "Notes", source: "user" }),
      base({ id: "shopify-base", name: "Shopify", source: "shopify" }),
    ]
    const books = buildMemoryBooks(bases, [
      article({ id: "learned", knowledgeBaseId: "learned-base", baseName: "Shipping", baseSource: "user", tags: ["agent-learned", "shipping"] }),
      article({ id: "note", knowledgeBaseId: "notes-base", baseName: "Notes", baseSource: "user", title: "VIP customers" }),
      article({ id: "shopify", knowledgeBaseId: "shopify-base", baseName: "Shopify", baseSource: "shopify", title: "Returns" }),
    ], {
      name: "Acme",
      aiContext: "We sell hiking boots.",
      brandVoice: "Warm and direct.",
      sampleReplies: [{ id: "sample-1", body: "Happy to help!", context: "General" }],
    })

    expect(books.map(book => book.title)).toEqual([
      "Store profile",
      "Tone & voice",
      "Agent learned",
      "Shopify",
      "Your notes",
    ])
    expect(books.find(book => book.id === "agent-learned")?.pages.map(page => page.id)).toEqual(["article:learned"])
    expect(books.find(book => book.title === "Shipping")).toBeUndefined()
    expect(books.find(book => book.id === "tone-and-voice")?.pages).toHaveLength(2)
  })

  it("keeps empty foundational books visible", () => {
    const books = buildMemoryBooks([], [], { name: "Acme", aiContext: "", brandVoice: "", sampleReplies: [] })
    expect(books.map(book => book.id)).toEqual(["store-profile", "tone-and-voice", "agent-learned", "your-notes"])
  })
})

describe("filterMemoryBooks", () => {
  it("returns matching pages grouped under their book", () => {
    const books = buildMemoryBooks([
      base({ id: "notes-base", name: "Notes", source: "user" }),
    ], [
      article({ id: "shipping", knowledgeBaseId: "notes-base", baseName: "Notes", baseSource: "user", title: "International shipping", body: "Ships to Canada" }),
      article({ id: "returns", knowledgeBaseId: "notes-base", baseName: "Notes", baseSource: "user", title: "Returns", body: "Thirty days" }),
    ], { name: "Acme", aiContext: "", brandVoice: "", sampleReplies: [] })

    const filtered = filterMemoryBooks(books, "Canada")
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.title).toBe("Your notes")
    expect(filtered[0]?.pages.map(page => page.title)).toEqual(["International shipping"])
  })
})
