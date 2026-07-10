export const MEMORY_OVERRIDE_TAG = "merchant-override" as const
export const MEMORY_OVERRIDE_PREFIX = "overrides:" as const

export type MemoryArticleSource = "learned" | "shopify" | "manual"

const MEMORY_TOPICS = new Set(["shipping", "returns", "discounts", "wholesale", "other"])

export function classifyMemoryArticleSource(input: {
  baseSource: string
  tags: readonly string[]
}): MemoryArticleSource {
  if (input.baseSource === "shopify") return "shopify"
  if (input.tags.some(tag => tag.toLowerCase() === "agent-learned")) return "learned"
  return "manual"
}

export function isMemoryTopicTag(tag: string): boolean {
  return MEMORY_TOPICS.has(tag.trim().toLowerCase())
}

export function memoryTopicLabel(topic: string): string {
  const normalized = topic.trim().toLowerCase()
  if (normalized === "shipping") return "Shipping"
  if (normalized === "returns") return "Returns"
  if (normalized === "discounts") return "Discounts"
  if (normalized === "wholesale") return "Wholesale"
  return "Other"
}

export function memoryOverrideTargetId(tags: readonly string[]): string | null {
  const tag = tags.find(value => value.toLowerCase().startsWith(MEMORY_OVERRIDE_PREFIX))
  return tag?.slice(MEMORY_OVERRIDE_PREFIX.length).trim() || null
}

export function resolveEffectiveMemoryArticles<T extends { id: string; tags: readonly string[] }>(
  articles: readonly T[],
): T[] {
  const overriddenIds = new Set(
    articles.flatMap(article => {
      if (!article.tags.some(tag => tag.toLowerCase() === MEMORY_OVERRIDE_TAG)) return []
      const targetId = memoryOverrideTargetId(article.tags)
      return targetId ? [targetId] : []
    }),
  )
  return articles.filter(article => !overriddenIds.has(article.id))
}
