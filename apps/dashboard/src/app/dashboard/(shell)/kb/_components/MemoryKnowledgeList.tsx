"use client"

import { BookOpenText, ChevronRight, MessageCircleQuestion, NotebookPen, ShoppingBag } from "lucide-react"
import { memoryTopicLabel, type MemoryArticleSource } from "@shopkeeper/agent/kb-memory"
import { formatDate } from "@/lib/format/date"
import type { ArticleWithBase } from "./kb-page-utils"
import { articleMemorySource, groupMemoryArticlesByTopic, isMemoryCorrection, memoryCardBodyPreview, memoryCardTitle, memorySourceLabel } from "./memory-page-utils"

interface Props {
  articles: ArticleWithBase[]
  hasActiveFilters: boolean
  hasShopifyConnection: boolean
  onOpenArticle: (id: string) => void
}

const SOURCE_STYLE: Record<MemoryArticleSource, { icon: typeof ShoppingBag; className: string }> = {
  learned: { icon: MessageCircleQuestion, className: "border-amber-500/20 bg-amber-500/[0.08] text-amber-700 dark:text-amber-300" },
  shopify: { icon: ShoppingBag, className: "border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-700 dark:text-emerald-300" },
  manual: { icon: NotebookPen, className: "border-sky-500/20 bg-sky-500/[0.08] text-sky-700 dark:text-sky-300" },
}

function KnowledgeRow({ article, onOpen }: { article: ArticleWithBase; onOpen: () => void }) {
  const source = articleMemorySource(article)
  const style = SOURCE_STYLE[source]
  const Icon = style.icon
  const weekly = article.citationCountWeek ?? 0
  const total = article.citationCount ?? 0
  const used = weekly > 0 ? `Used ${weekly} time${weekly === 1 ? "" : "s"} this week` : total > 0 ? `Used ${total} time${total === 1 ? "" : "s"}` : null
  return (
    <button type="button" onClick={onOpen} className="group grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-[border-color,background-color,transform] hover:-translate-y-0.5 hover:border-foreground/[0.16] hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30">
      <span className={`inline-flex size-9 items-center justify-center rounded-lg border ${style.className}`}><Icon className="size-4" /></span>
      <span className="min-w-0">
        <span className="block break-words text-sm font-semibold leading-snug text-strong">{memoryCardTitle(article)}</span>
        <span className="mt-1.5 block text-sm leading-relaxed text-muted-foreground line-clamp-2">{memoryCardBodyPreview(article)}</span>
        <span className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-faint">
          <span className="font-medium text-muted-foreground">{isMemoryCorrection(article) ? "Correction" : memorySourceLabel(source)}</span>
          <span>·</span><span>Updated {formatDate(article.updatedAt)}</span>{used && <><span>·</span><span>{used}</span></>}
        </span>
      </span>
      <ChevronRight className="mt-2 size-4 text-faint group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
    </button>
  )
}

export function MemoryKnowledgeList({ articles, hasActiveFilters, hasShopifyConnection, onOpenArticle }: Props) {
  const groups = groupMemoryArticlesByTopic(articles)
  return (
    <section aria-labelledby="memory-knowledge-heading" className="min-w-0">
      <div className="mb-4">
        <h2 id="memory-knowledge-heading" className="text-base font-semibold text-foreground">Knowledge</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{articles.length} {articles.length === 1 ? "memory" : "memories"} from your store, notes, and agent.</p>
      </div>
      {groups.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-foreground/[0.10] bg-card/35 px-5 py-10 text-center">
          <span className="flex size-10 items-center justify-center rounded-xl border border-foreground/[0.10] bg-foreground/[0.04] text-faint"><BookOpenText className="size-4" /></span>
          <p className="mt-3 text-sm font-semibold text-muted-foreground">{hasActiveFilters ? "No matching context" : "No knowledge added yet"}</p>
          <p className="mt-1 max-w-sm text-xs leading-relaxed text-faint">{hasActiveFilters ? "Try a different search, topic, or source." : hasShopifyConnection ? "Add store context while Shopify policies finish syncing." : "Add store facts, policies, and customer-care guidance here."}</p>
        </div>
      ) : (
        <div className="space-y-7">
          {groups.map(group => (
            <section key={group.topic}>
              <div className="mb-3 flex items-center gap-2 px-1">
                <h3 className="text-xs font-semibold uppercase text-muted-foreground">{memoryTopicLabel(group.topic)}</h3>
                <span className="rounded-full bg-foreground/[0.05] px-1.5 py-0.5 text-[10px] font-semibold text-faint">{group.articles.length}</span>
              </div>
              <div className="space-y-2.5">{group.articles.map(article => <KnowledgeRow key={article.id} article={article} onOpen={() => onOpenArticle(article.id)} />)}</div>
            </section>
          ))}
        </div>
      )}
    </section>
  )
}
