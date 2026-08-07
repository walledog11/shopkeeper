import type { ProductHelpArticle, ProductHelpCategory } from "./types.js"
import { ALL_CATEGORIES } from "./content/index.js"

export type {
  ProductHelpArticle,
  ProductHelpCategory,
  ProductHelpSection,
} from "./types.js"

export {
  ALL_CATEGORIES,
  withAgentName,
  gettingStarted,
  tickets,
  aiFeatures,
  integrations,
  settings,
  troubleshooting,
  reference,
  tips,
} from "./content/index.js"

export type { Article, Category, Section } from "./content/index.js"

const FLAT_ARTICLES: ProductHelpArticle[] = ALL_CATEGORIES.flatMap(category => category.articles)

function articleSearchText(article: ProductHelpArticle): string {
  return [
    article.title,
    article.summary ?? "",
    ...article.body.flatMap(section => [
      section.heading ?? "",
      section.text ?? "",
      section.callout ?? "",
      section.warning ?? "",
      ...(section.steps ?? []),
      ...(section.tips ?? []),
    ]),
  ].join("\n").toLowerCase()
}

export interface ProductHelpSearchResult {
  id: string
  title: string
  categoryId: string
  categoryTitle: string
  excerpt: string
  body: string
}

function renderArticleBody(article: ProductHelpArticle): string {
  return article.body.map((section) => {
    const chunks: string[] = []
    if (section.heading) chunks.push(`### ${section.heading}`)
    if (section.text) chunks.push(section.text)
    if (section.steps?.length) chunks.push(section.steps.map((step, index) => `${index + 1}. ${step}`).join("\n"))
    if (section.tips?.length) chunks.push(section.tips.map(tip => `- ${tip}`).join("\n"))
    if (section.callout) chunks.push(`Note: ${section.callout}`)
    if (section.warning) chunks.push(`Warning: ${section.warning}`)
    return chunks.join("\n\n")
  }).join("\n\n")
}

function excerptFor(article: ProductHelpArticle, queryWords: string[]): string {
  const haystack = articleSearchText(article)
  for (const word of queryWords) {
    const index = haystack.indexOf(word)
    if (index < 0) continue
    const start = Math.max(0, index - 60)
    const end = Math.min(haystack.length, index + word.length + 120)
    return `${start > 0 ? "…" : ""}${haystack.slice(start, end).trim()}${end < haystack.length ? "…" : ""}`
  }
  const first = article.body.find(section => section.text)?.text ?? article.summary ?? article.title
  return first.length > 180 ? `${first.slice(0, 177)}…` : first
}

export function searchProductHelp(query: string, limit = 5): ProductHelpSearchResult[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(word => word.length >= 2)
  if (words.length === 0) return []

  const scored = FLAT_ARTICLES.flatMap((article) => {
    const category = ALL_CATEGORIES.find(entry => entry.articles.some(item => item.id === article.id))
    if (!category) return []
    const haystack = articleSearchText(article)
    const score = words.reduce((total, word) => total + (haystack.includes(word) ? 1 : 0), 0)
    if (score === 0) return []
    return [{
      score,
      result: {
        id: article.id,
        title: article.title,
        categoryId: category.id,
        categoryTitle: category.title,
        excerpt: excerptFor(article, words),
        body: renderArticleBody(article),
      } satisfies ProductHelpSearchResult,
    }]
  })

  return scored
    .sort((left, right) => right.score - left.score || left.result.title.localeCompare(right.result.title))
    .slice(0, limit)
    .map(entry => entry.result)
}

export function getProductHelpCategories(): ProductHelpCategory[] {
  return ALL_CATEGORIES
}
