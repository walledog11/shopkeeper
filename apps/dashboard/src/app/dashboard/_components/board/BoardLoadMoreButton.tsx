"use client"

import { Loader2 } from "lucide-react"

interface BoardLoadMoreButtonProps {
  isLoadingMore: boolean
  onLoadMore: () => void
  loadingLabel?: string
  idleLabel?: string
}

export function BoardLoadMoreButton({
  isLoadingMore,
  onLoadMore,
  loadingLabel = "Loading...",
  idleLabel = "Load more",
}: BoardLoadMoreButtonProps) {
  return (
    <button
      type="button"
      onClick={onLoadMore}
      disabled={isLoadingMore}
      className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-border text-xs font-semibold text-faint transition-colors hover:bg-foreground/[0.04] hover:text-muted-foreground disabled:opacity-40"
    >
      {isLoadingMore ? <Loader2 className="size-3 animate-spin" /> : null}
      {isLoadingMore ? loadingLabel : idleLabel}
    </button>
  )
}
