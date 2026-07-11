import { isAgentLearnedKbArticle } from "@shopkeeper/agent/kb-learned"
import type { KnowledgeBase, SampleReply } from "@/types"
import type { ArticleWithBase } from "./kb-page-utils"
import { memoryCardBody, memoryCardTitle } from "./memory-page-utils"

export type MemoryBookKind = "store" | "tone" | "learned" | "shopify" | "notes" | "custom"

export interface MemoryBookPage {
  id: string
  title: string
  body: string
  articleId: string | null
  updatedAt: string | null
}

export interface MemoryBook {
  id: string
  kind: MemoryBookKind
  title: string
  description: string
  pages: MemoryBookPage[]
  knowledgeBaseId: string | null
  canAddNote: boolean
}

interface StoreProfile {
  name: string
  aiContext: string
  brandVoice: string
  sampleReplies: SampleReply[]
}

const INTERNAL_LEARNED_BOOK_NAMES = new Set([
  "learned",
  "shipping",
  "returns",
  "discounts",
  "wholesale",
])

function articlePage(article: ArticleWithBase): MemoryBookPage {
  return {
    id: `article:${article.id}`,
    title: memoryCardTitle(article),
    body: memoryCardBody(article),
    articleId: article.id,
    updatedAt: article.updatedAt,
  }
}

function recentFirst(pages: MemoryBookPage[]): MemoryBookPage[] {
  return [...pages].sort((left, right) => {
    if (!left.updatedAt && !right.updatedAt) return left.title.localeCompare(right.title)
    if (!left.updatedAt) return 1
    if (!right.updatedAt) return -1
    return +new Date(right.updatedAt) - +new Date(left.updatedAt)
  })
}

function sampleReplyPage(sample: SampleReply, index: number): MemoryBookPage {
  const context = sample.context?.trim()
  return {
    id: `tone:sample:${sample.id}`,
    title: context || `Sample reply ${index + 1}`,
    body: sample.body,
    articleId: null,
    updatedAt: null,
  }
}

export function buildMemoryBooks(
  knowledgeBases: KnowledgeBase[],
  articles: ArticleWithBase[],
  storeProfile: StoreProfile,
): MemoryBook[] {
  const learned = articles.filter(article => isAgentLearnedKbArticle(article.tags ?? []))
  const shopify = articles.filter(article => article.baseSource === "shopify")
  const manual = articles.filter(article => (
    article.baseSource === "user" && !isAgentLearnedKbArticle(article.tags ?? [])
  ))

  const books: MemoryBook[] = [
    {
      id: "store-profile",
      kind: "store",
      title: "Store profile",
      description: "The durable facts the agent knows about your business.",
      pages: storeProfile.aiContext.trim() ? [{
        id: "store-profile:about",
        title: "About the store",
        body: storeProfile.aiContext.trim(),
        articleId: null,
        updatedAt: null,
      }] : [],
      knowledgeBaseId: null,
      canAddNote: false,
    },
    {
      id: "tone-and-voice",
      kind: "tone",
      title: "Tone & voice",
      description: "How the agent should sound when it speaks for you.",
      pages: [
        ...(storeProfile.brandVoice.trim() ? [{
          id: "tone:brief",
          title: "Voice brief",
          body: storeProfile.brandVoice.trim(),
          articleId: null,
          updatedAt: null,
        }] : []),
        ...storeProfile.sampleReplies.filter(reply => reply.body.trim()).map(sampleReplyPage),
      ],
      knowledgeBaseId: null,
      canAddNote: false,
    },
    {
      id: "agent-learned",
      kind: "learned",
      title: "Agent learned",
      description: "Answers and policies learned from your team over time.",
      pages: recentFirst(learned.map(articlePage)),
      knowledgeBaseId: null,
      canAddNote: false,
    },
  ]

  const shopifyBases = knowledgeBases.filter(base => base.source === "shopify")
  if (shopifyBases.length > 0) {
    books.push({
      id: "shopify",
      kind: "shopify",
      title: "Shopify",
      description: "Synced store policies, products, and help content.",
      pages: recentFirst(shopify.map(articlePage)),
      knowledgeBaseId: shopifyBases[0]?.id ?? null,
      canAddNote: false,
    })
  }

  const manualByBase = new Map<string, ArticleWithBase[]>()
  for (const article of manual) {
    const bucket = manualByBase.get(article.knowledgeBaseId) ?? []
    bucket.push(article)
    manualByBase.set(article.knowledgeBaseId, bucket)
  }

  const userBases = knowledgeBases.filter(base => base.source === "user")
  const noteBase = userBases.find(base => base.name.trim().toLowerCase() === "notes")
  const visibleUserBases = userBases.filter(base => {
    const pageCount = manualByBase.get(base.id)?.length ?? 0
    return pageCount > 0 || !INTERNAL_LEARNED_BOOK_NAMES.has(base.name.trim().toLowerCase())
  })

  if (!noteBase) {
    books.push({
      id: "your-notes",
      kind: "notes",
      title: "Your notes",
      description: "Facts, policies, and instructions added by your team.",
      pages: [],
      knowledgeBaseId: null,
      canAddNote: true,
    })
  }

  for (const base of visibleUserBases) {
    const isNotes = base.name.trim().toLowerCase() === "notes"
    books.push({
      id: `knowledge-base:${base.id}`,
      kind: isNotes ? "notes" : "custom",
      title: isNotes ? "Your notes" : base.name,
      description: isNotes
        ? "Facts, policies, and instructions added by your team."
        : "A collection of notes maintained by your team.",
      pages: recentFirst((manualByBase.get(base.id) ?? []).map(articlePage)),
      knowledgeBaseId: base.id,
      canAddNote: isNotes,
    })
  }

  return books
}

export function filterMemoryBooks(books: MemoryBook[], query: string): MemoryBook[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return books

  return books.flatMap(book => {
    const bookMatches = `${book.title} ${book.description}`.toLowerCase().includes(normalized)
    const pages = bookMatches
      ? book.pages
      : book.pages.filter(page => `${page.title} ${page.body}`.toLowerCase().includes(normalized))
    return bookMatches || pages.length > 0 ? [{ ...book, pages }] : []
  })
}
