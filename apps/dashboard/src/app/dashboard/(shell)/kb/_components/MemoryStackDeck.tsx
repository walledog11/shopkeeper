"use client"

import { StackDeck } from "@/app/dashboard/_components/stack/StackDeck"
import { STACKED_BELOW_PEEK } from "@/app/dashboard/_components/home/needs-you-motion"
import type { ArticleWithBase } from "./kb-page-utils"
import { MemoryStackCard } from "./MemoryStackCard"

interface MemoryStackDeckProps {
  articles: ArticleWithBase[]
  activeArticleId: string | null
  onSelectArticle: (id: string) => void
}

export function MemoryStackDeck({
  articles,
  activeArticleId,
  onSelectArticle,
}: MemoryStackDeckProps) {
  const cardFor = (article: ArticleWithBase, isPeek: boolean) => (
    <MemoryStackCard
      article={article}
      isActive={!isPeek && activeArticleId === article.id}
      onOpen={() => onSelectArticle(article.id)}
    />
  )

  return (
    <StackDeck
      items={articles}
      className="flex flex-col gap-2.5 pt-2.5"
      getId={(article) => article.id}
      activeId={activeArticleId}
      stackSingleItem
      labels={{ previous: "Previous note", next: "Next note" }}
      controls="count"
      peek={STACKED_BELOW_PEEK}
      peekShellClassName="h-full w-full rounded-3xl border border-border bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)] box-border"
      peekCardClassName="pointer-events-none box-border overflow-hidden rounded-3xl shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.06)]"
      renderCard={(article, context) => cardFor(article, context.isPeek)}
      renderPeekCard={(article) => cardFor(article, true)}
    />
  )
}
