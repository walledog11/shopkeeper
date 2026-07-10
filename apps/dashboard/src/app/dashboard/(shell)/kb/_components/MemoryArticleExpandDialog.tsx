"use client"

import { Loader2, MessageCircleQuestion, NotebookPen, Pencil, ShoppingBag, Trash2 } from "lucide-react"
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

const SOURCE_DETAIL = {
  learned: { icon: MessageCircleQuestion, tone: "border-amber-500/20 bg-amber-500/[0.08] text-amber-700 dark:text-amber-300" },
  shopify: { icon: ShoppingBag, tone: "border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-700 dark:text-emerald-300" },
  manual: { icon: NotebookPen, tone: "border-sky-500/20 bg-sky-500/[0.08] text-sky-700 dark:text-sky-300" },
} as const

export function MemoryArticleExpandDialog({ article, deleteError, isDeleting, onClose, onCorrect, onDelete, onEdit }: Props) {
  const source = article ? articleMemorySource(article) : null
  const detail = source ? SOURCE_DETAIL[source] : null
  const Icon = detail?.icon
  return (
    <DashboardDetailDialog open={Boolean(article)} title={article ? memoryCardTitle(article) : "Memory detail"} maxWidthClassName="sm:max-w-2xl" onClose={onClose}>
      {article && source && detail && Icon ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-border px-5 py-5 pr-12 sm:px-6">
            <div className="flex items-start gap-3">
              <span className={`inline-flex size-10 items-center justify-center rounded-lg border ${detail.tone}`}><Icon className="size-4" /></span>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold leading-snug text-foreground">{memoryCardTitle(article)}</h2>
                <p className="mt-1.5 text-xs text-faint">{isMemoryCorrection(article) ? "Merchant correction" : memorySourceLabel(source)}{article.baseName ? ` · ${article.baseName}` : ""}</p>
              </div>
            </div>
          </div>
          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6"><p className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{memoryCardBody(article)}</p></div>
          <div className="shrink-0 border-t border-border bg-background px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-faint">Updated {formatDate(article.updatedAt)}</p>
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
