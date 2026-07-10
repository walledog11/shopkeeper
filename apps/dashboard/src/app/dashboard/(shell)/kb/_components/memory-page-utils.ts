import {
  classifyMemoryArticleSource,
  isMemoryTopicTag,
  memoryOverrideTargetId,
  type MemoryArticleSource,
} from "@shopkeeper/agent/kb-memory"
import type { ArticleWithBase } from "./kb-page-utils"

export type MemorySourceFilter = "all" | MemoryArticleSource
export type MemoryTopicFilter = "all" | string

export const MEMORY_SOURCE_FILTERS: { value: MemorySourceFilter; label: string }[] = [
  { value: "all", label: "Any source" },
  { value: "learned", label: "Learned" },
  { value: "shopify", label: "Shopify" },
  { value: "manual", label: "Your notes" },
]

const MEMORY_TOPIC_ORDER = ["shipping", "returns", "discounts", "wholesale", "other"] as const

export function memoryCardTitle(article: ArticleWithBase): string {
  if (articleMemorySource(article) !== "learned") return article.title
  for (const line of article.body.split("\n")) {
    const match = line.trim().match(/^Q:\s*(.+)$/i)
    if (match?.[1]?.trim()) return match[1].trim()
  }
  return article.title
}

export function memoryCardBodyPreview(article: ArticleWithBase): string {
  const body = article.body.trim()
  if (!body || articleMemorySource(article) !== "learned") return body
  const lines = body.split("\n")
  const answerLine = lines.find(line => /^A:\s*/i.test(line.trim()))
  if (answerLine) return answerLine.replace(/^A:\s*/i, "").trim()
  return lines.filter(line => !/^Q:\s*/i.test(line.trim())).join("\n").trim() || body
}

export function memoryCardBody(article: ArticleWithBase): string {
  return articleMemorySource(article) === "learned" ? memoryCardBodyPreview(article) : article.body
}

export function articleMemorySource(article: ArticleWithBase): MemoryArticleSource {
  return classifyMemoryArticleSource({ baseSource: article.baseSource, tags: article.tags ?? [] })
}

export function memorySourceLabel(source: MemoryArticleSource): string {
  if (source === "learned") return "Learned"
  if (source === "shopify") return "Shopify"
  return "Your notes"
}

export function isMemoryCorrection(article: ArticleWithBase): boolean {
  return Boolean(memoryOverrideTargetId(article.tags ?? []))
}

export function memoryArticleTopic(article: ArticleWithBase): string {
  return (article.tags ?? []).find(isMemoryTopicTag)?.toLowerCase() ?? "other"
}

export function groupMemoryArticlesByTopic(articles: ArticleWithBase[]) {
  const buckets = new Map<string, ArticleWithBase[]>()
  for (const article of articles) {
    const topic = memoryArticleTopic(article)
    buckets.set(topic, [...(buckets.get(topic) ?? []), article])
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => {
      const leftIndex = MEMORY_TOPIC_ORDER.indexOf(left as typeof MEMORY_TOPIC_ORDER[number])
      const rightIndex = MEMORY_TOPIC_ORDER.indexOf(right as typeof MEMORY_TOPIC_ORDER[number])
      return (leftIndex < 0 ? MEMORY_TOPIC_ORDER.length : leftIndex)
        - (rightIndex < 0 ? MEMORY_TOPIC_ORDER.length : rightIndex)
    })
    .map(([topic, topicArticles]) => ({ topic, articles: topicArticles }))
}

export function collectMemoryTopicFilters(articles: ArticleWithBase[]): string[] {
  const topics = new Set<string>()
  for (const article of articles) {
    for (const tag of article.tags ?? []) if (isMemoryTopicTag(tag)) topics.add(tag.toLowerCase())
  }
  return [...topics].sort()
}

export function filterMemoryArticles(
  articles: ArticleWithBase[],
  sourceFilter: MemorySourceFilter,
  topicFilter: MemoryTopicFilter,
  search = "",
): ArticleWithBase[] {
  const query = search.trim().toLowerCase()
  return articles.filter(article => {
    if (sourceFilter !== "all" && articleMemorySource(article) !== sourceFilter) return false
    if (topicFilter !== "all" && !(article.tags ?? []).some(tag => tag.toLowerCase() === topicFilter.toLowerCase())) return false
    if (!query) return true
    return memoryCardTitle(article).toLowerCase().includes(query)
      || memoryCardBody(article).toLowerCase().includes(query)
  })
}
