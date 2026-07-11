"use client"

import { BookOpenText, ChevronRight } from "lucide-react"
import { formatDate } from "@/lib/format/date"
import type { ArticleWithBase } from "./kb-page-utils"
import { articleMemorySource, isMemoryCorrection, memoryCardBodyPreview, memoryCardTitle, memorySourceLabel } from "./memory-page-utils"

interface Props {
  articles: ArticleWithBase[]
  hasActiveFilters: boolean
  hasShopifyConnection: boolean
  onOpenArticle: (id: string) => void
}

function MemoryRow({ article, onOpen }: { article: ArticleWithBase; onOpen: () => void }) {
  const source = articleMemorySource(article)
  return (
    <button type="button" onClick={onOpen} className="group grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-4 rounded-2xl border border-border bg-card px-4 py-4 text-left shadow-sm transition-colors hover:border-foreground/[0.16] hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 sm:px-5">
      <span className="min-w-0">
        <span className="block break-words text-sm font-semibold leading-snug text-strong">{memoryCardTitle(article)}</span>
        <span className="mt-1.5 block max-h-10 overflow-hidden break-words text-sm leading-5 text-muted-foreground line-clamp-2">{memoryCardBodyPreview(article)}</span>
        <span className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-faint">
          <span className="font-medium text-muted-foreground">{isMemoryCorrection(article) ? "Correction" : memorySourceLabel(source)}</span>
          <span>·</span><span>Updated {formatDate(article.updatedAt)}</span>
        </span>
      </span>
      <ChevronRight className="mt-2 size-4 text-faint group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
    </button>
  )
}

export function MemoryKnowledgeList({ articles, hasActiveFilters, hasShopifyConnection, onOpenArticle }: Props) {
  return (
    <section aria-label="Saved memory" className="min-w-0">
      {articles.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-foreground/[0.10] bg-card/35 px-5 py-10 text-center">
          <span className="flex size-10 items-center justify-center rounded-xl border border-foreground/[0.10] bg-foreground/[0.04] text-faint"><BookOpenText className="size-4" /></span>
          <p className="mt-3 text-sm font-semibold text-muted-foreground">{hasActiveFilters ? "No matching memory" : "Nothing saved yet"}</p>
          <p className="mt-1 max-w-sm text-xs leading-relaxed text-faint">{hasActiveFilters ? "Try a different search or filter." : hasShopifyConnection ? "Add a note while Shopify policies finish syncing." : "Add facts, policies, and customer-care guidance for your agent."}</p>
        </div>
      ) : (
        <div className="space-y-2.5">{articles.map(article => <MemoryRow key={article.id} article={article} onOpen={() => onOpenArticle(article.id)} />)}</div>
      )}
    </section>
  )
}
