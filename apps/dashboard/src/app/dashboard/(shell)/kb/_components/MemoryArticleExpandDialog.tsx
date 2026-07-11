"use client"

import { Loader2, Pencil, Trash2 } from "lucide-react"
import { DashboardDetailDialog } from "@/app/dashboard/_components/board/DashboardDetailDialog"
import { formatDate } from "@/lib/format/date"
import type { ArticleWithBase } from "./kb-page-utils"
import { articleMemorySource, isMemoryCorrection, memoryCardBody, memoryCardTitle, memorySourceLabel } from "./memory-page-utils"

interface Props {
  article: ArticleWithBase | null
  deleteError: string | null
  isDeleting: boolean
  onClose: () => void
  onCorrect: () => void
  onDelete: () => void
  onEdit: () => void
}

export function MemoryArticleExpandDialog({ article, deleteError, isDeleting, onClose, onCorrect, onDelete, onEdit }: Props) {
  const source = article ? articleMemorySource(article) : null
  return (
    <DashboardDetailDialog open={Boolean(article)} title={article ? memoryCardTitle(article) : "Memory detail"} maxWidthClassName="sm:max-w-2xl" onClose={onClose}>
      {article && source ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-border px-5 py-5 pr-12 sm:px-6">
            <div className="min-w-0">
              <h2 className="text-base font-semibold leading-snug text-foreground">{memoryCardTitle(article)}</h2>
              <p className="mt-1.5 text-xs text-faint">{isMemoryCorrection(article) ? "Correction" : memorySourceLabel(source)} · Updated {formatDate(article.updatedAt)}</p>
            </div>
          </div>
          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6"><p className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{memoryCardBody(article)}</p></div>
          <div className="shrink-0 border-t border-border bg-background px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span />
              {source === "manual" ? (
                <div className="flex gap-2">
                  <button type="button" onClick={onDelete} disabled={isDeleting} aria-label="Delete memory" className="inline-flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-red-500/[0.07] hover:text-red-400 disabled:opacity-40">{isDeleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}</button>
                  <button type="button" onClick={onEdit} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-semibold text-background"><Pencil className="size-3.5" />Edit note</button>
                </div>
              ) : (
                <button type="button" onClick={onCorrect} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-semibold text-background"><Pencil className="size-3.5" />Correct this</button>
              )}
            </div>
            {deleteError && <p className="mt-3 text-xs text-red-400">{deleteError}</p>}
          </div>
        </div>
      ) : null}
    </DashboardDetailDialog>
  )
}
