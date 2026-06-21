"use client"

import { StackDeck } from "@/app/dashboard/_components/stack/StackDeck"
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
      singleItemClassName="pt-2.5"
      getId={(article) => article.id}
      activeId={activeArticleId}
      labels={{ previous: "Previous note", next: "Next note" }}
      controls="count"
      peekShellClassName="h-full w-full rounded-3xl border border-border bg-card shadow-sm box-border"
      renderCard={(article, context) => cardFor(article, context.isPeek)}
      renderPeekCard={(article) => cardFor(article, true)}
    />
  )
}
