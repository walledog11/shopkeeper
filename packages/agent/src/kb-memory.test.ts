import { describe, expect, it } from "vitest"
import { classifyMemoryArticleSource, memoryOverrideTargetId, resolveEffectiveMemoryArticles } from "./kb-memory.js"

describe("KB memory", () => {
  it("classifies synced, learned, and manual context", () => {
    expect(classifyMemoryArticleSource({ baseSource: "shopify", tags: [] })).toBe("shopify")
    expect(classifyMemoryArticleSource({ baseSource: "user", tags: ["agent-learned"] })).toBe("learned")
    expect(classifyMemoryArticleSource({ baseSource: "user", tags: [] })).toBe("manual")
  })

  it("uses merchant corrections instead of their original article", () => {
    const articles = [
      { id: "original", tags: ["agent-learned"] },
      { id: "correction", tags: ["merchant-override", "overrides:original"] },
    ]
    expect(memoryOverrideTargetId(articles[1].tags)).toBe("original")
    expect(resolveEffectiveMemoryArticles(articles).map(article => article.id)).toEqual(["correction"])
  })
})
