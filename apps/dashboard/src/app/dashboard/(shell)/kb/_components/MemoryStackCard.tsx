"use client"

import { BookOpen, ShoppingBag } from "lucide-react"
import { formatDate } from "@/lib/format/date"
import type { ArticleWithBase } from "./kb-page-utils"

interface MemoryStackCardProps {
  article: ArticleWithBase
  isActive: boolean
  onOpen: () => void
}

export function MemoryStackCard({
  article,
  isActive,
  onOpen,
}: MemoryStackCardProps) {
  const tags = article.tags ?? []
  const visibleTags = tags.slice(0, 3)
  const hiddenTagCount = Math.max(0, tags.length - visibleTags.length)
  const isShopify = article.baseSource === "shopify"
  const SourceIcon = isShopify ? ShoppingBag : BookOpen

  return (
    <div
      className={`flex h-72 flex-col gap-3 rounded-3xl border bg-card px-5 py-5 shadow-sm transition-colors ${
        isActive ? "border-foreground/30" : "border-border"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`flex size-9 shrink-0 items-center justify-center rounded-xl border ${
          isShopify
            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
            : "border-foreground/[0.10] bg-foreground/[0.06] text-foreground/65"
        }`}>
          <SourceIcon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold text-foreground/90">{article.baseName}</span>
            <span className="shrink-0 text-xs tabular-nums text-foreground/35">
              {formatDate(article.updatedAt)}
            </span>
          </div>
          <span className="block text-xs text-foreground/40">
            {isShopify ? "Shopify memory" : "Team memory"}
          </span>
        </div>
      </div>

      <button
        type="button"
        aria-label={`Open ${article.title}`}
        onClick={onOpen}
        className="flex min-w-0 flex-1 flex-col gap-2 border-0 bg-transparent p-0 text-left [font-family:inherit] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/70"
      >
        <h3 className="font-sans text-lg font-semibold leading-snug tracking-tight text-foreground line-clamp-2">
          {article.title}
        </h3>
        <p className="text-sm leading-relaxed text-foreground/55 line-clamp-5">{article.body}</p>
      </button>

      <div className="mt-1 flex min-h-6 items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {visibleTags.map(tag => (
            <span
              key={tag}
              className="max-w-[8rem] truncate rounded-full border border-foreground/[0.08] bg-foreground/[0.05] px-2 py-0.5 text-xs font-medium text-foreground/55"
            >
              #{tag}
            </span>
          ))}
          {hiddenTagCount > 0 && (
            <span className="rounded-full border border-foreground/[0.08] bg-foreground/[0.04] px-2 py-0.5 text-xs font-medium text-foreground/45">
              +{hiddenTagCount}
            </span>
          )}
        </div>
        <span className="shrink-0 text-xs tabular-nums text-foreground/35">
          {article.citationCount ?? 0} cited
        </span>
      </div>
    </div>
  )
}
