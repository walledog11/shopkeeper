"use client"

import { useMemo } from "react"
import { BookOpen, FileText, Plus, ShoppingBag, Trash2 } from "lucide-react"
import type { KnowledgeBase } from "@/types"
import type { ArticleWithBase } from "./kb-page-utils"
import { MemoryStackDeck } from "./MemoryStackDeck"

interface MemoryStackBoardProps {
  articles: ArticleWithBase[]
  activeArticleId: string | null
  knowledgeBases: KnowledgeBase[]
  onCreateArticleInKb: (id: string) => void
  onCreateKb: () => void
  onDeleteKb: (id: string) => void
  onSelectArticle: (id: string) => void
  showEmptyUserFolders: boolean
}

interface MemoryStackGroup {
  id: string
  label: string
  source: KnowledgeBase["source"]
  articles: ArticleWithBase[]
}

function buildMemoryStackGroups(
  knowledgeBases: KnowledgeBase[],
  articles: ArticleWithBase[],
  showEmptyUserFolders: boolean,
): MemoryStackGroup[] {
  const articlesByBase = new Map<string, ArticleWithBase[]>()
  for (const article of articles) {
    const bucket = articlesByBase.get(article.knowledgeBaseId) ?? []
    bucket.push(article)
    articlesByBase.set(article.knowledgeBaseId, bucket)
  }

  return knowledgeBases.flatMap(kb => {
    const groupArticles = articlesByBase.get(kb.id) ?? []
    if (groupArticles.length === 0 && (kb.source !== "user" || !showEmptyUserFolders)) return []

    return [{
      id: kb.id,
      label: kb.source === "shopify" ? "Shopify" : kb.name,
      source: kb.source,
      articles: groupArticles,
    }]
  })
}

function MemoryStackColumn({
  group,
  activeArticleId,
  onCreateArticleInKb,
  onDeleteKb,
  onSelectArticle,
}: {
  group: MemoryStackGroup
  activeArticleId: string | null
  onCreateArticleInKb: (id: string) => void
  onDeleteKb: (id: string) => void
  onSelectArticle: (id: string) => void
}) {
  const Icon = group.source === "shopify" ? ShoppingBag : BookOpen

  return (
    <section className="flex min-w-0 flex-col">
      <div className="mb-3 flex items-center justify-between gap-2 px-1">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="size-3.5 shrink-0 text-faint" aria-hidden />
          <span className="truncate font-sans text-xs font-semibold uppercase tracking-wide text-strong">
            {group.label}
          </span>
          <span className="text-xs font-medium tabular-nums text-faint">{group.articles.length}</span>
        </div>
        {group.source === "user" && (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => onCreateArticleInKb(group.id)}
              aria-label={`New note in ${group.label}`}
              className="inline-flex size-7 items-center justify-center rounded-full border border-border text-faint transition-colors hover:bg-foreground/[0.04] hover:text-strong"
            >
              <Plus className="size-3" />
            </button>
            <button
              type="button"
              onClick={() => onDeleteKb(group.id)}
              aria-label={`Delete ${group.label}`}
              className="inline-flex size-7 items-center justify-center rounded-full border border-border text-faint transition-colors hover:bg-foreground/[0.04] hover:text-red-400"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        )}
      </div>

      <MemoryStackDeck
        articles={group.articles}
        activeArticleId={activeArticleId}
        onSelectArticle={onSelectArticle}
      />
      {group.articles.length === 0 && <EmptyFolderCard />}
    </section>
  )
}

function EmptyFolderCard() {
  return (
    <div className="flex h-72 flex-col items-center justify-center gap-3 rounded-3xl border border-border bg-card px-5 py-5 text-center shadow-sm">
      <span className="flex size-10 items-center justify-center rounded-xl border border-foreground/[0.10] bg-foreground/[0.04] text-faint">
        <FileText className="size-4" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-muted-foreground">No notes yet</p>
        <p className="max-w-[180px] text-xs leading-relaxed text-faint">
          Use the plus button above to add one.
        </p>
      </div>
    </div>
  )
}

function NewFolderStackCard({ onCreateKb }: { onCreateKb: () => void }) {
  return (
    <section className="flex min-w-0 flex-col">
      <div className="mb-3 h-7 px-1" aria-hidden />
      <div className="pt-2.5">
      <button
        type="button"
        onClick={onCreateKb}
        aria-label="New folder"
        className="group flex h-72 w-full flex-col rounded-3xl border border-dashed border-foreground/[0.12] bg-card/35 px-5 py-5 text-left shadow-sm transition-colors hover:border-foreground/[0.22] hover:bg-card/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/70"
      >
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-foreground/[0.10] bg-foreground/[0.04] text-faint transition-colors group-hover:text-muted-foreground">
            <Plus className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-muted-foreground transition-colors group-hover:text-strong">
              New Folder
            </p>
            <div className="h-2.5 w-16 rounded-full bg-foreground/[0.05]" />
          </div>
        </div>

        <div className="mt-8 flex flex-1 flex-col gap-2.5" aria-hidden>
          <div className="h-4 w-4/5 rounded-full bg-foreground/[0.07]" />
          <div className="h-4 w-2/3 rounded-full bg-foreground/[0.05]" />
          <div className="mt-2 h-3 w-full rounded-full bg-foreground/[0.04]" />
          <div className="h-3 w-11/12 rounded-full bg-foreground/[0.04]" />
          <div className="h-3 w-3/5 rounded-full bg-foreground/[0.04]" />
        </div>

        <div className="mt-1 flex min-h-6 items-center gap-1.5" aria-hidden>
          <span className="h-5 w-14 rounded-full border border-foreground/[0.06] bg-foreground/[0.03]" />
          <span className="h-5 w-10 rounded-full border border-foreground/[0.06] bg-foreground/[0.03]" />
        </div>
      </button>
      </div>
    </section>
  )
}

export function MemoryStackBoard({
  articles,
  activeArticleId,
  knowledgeBases,
  onCreateArticleInKb,
  onCreateKb,
  onDeleteKb,
  onSelectArticle,
  showEmptyUserFolders,
}: MemoryStackBoardProps) {
  const groups = useMemo(
    () => buildMemoryStackGroups(knowledgeBases, articles, showEmptyUserFolders),
    [articles, knowledgeBases, showEmptyUserFolders],
  )

  return (
    <div className="custom-scrollbar flex-1 overflow-y-auto px-4 py-6 sm:px-6">
      <div className="grid grid-cols-1 gap-x-6 gap-y-9 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {groups.map(group => (
          <MemoryStackColumn
            key={group.id}
            group={group}
            activeArticleId={activeArticleId}
            onCreateArticleInKb={onCreateArticleInKb}
            onDeleteKb={onDeleteKb}
            onSelectArticle={onSelectArticle}
          />
        ))}
        <NewFolderStackCard onCreateKb={onCreateKb} />
      </div>
    </div>
  )
}
