import { ChevronLeft, Loader2, Pencil, Trash2 } from "lucide-react"
import { formatDate } from "@/lib/format/date"
import type { ArticleWithBase } from "./kb-page-utils"

interface ArticleReadDetailProps {
  article: ArticleWithBase
  deleteError: string | null
  isDeleting: boolean
  onBack: () => void
  onDelete: () => void
  onStartEdit: () => void
}

export function ArticleReadDetail({
  article,
  deleteError,
  isDeleting,
  onBack,
  onDelete,
  onStartEdit,
}: ArticleReadDetailProps) {
  const tags = article.tags ?? []

  return (
    <div className="px-4 md:px-8 py-6 max-w-3xl">
      <button type="button"
        onClick={onBack}
        className="md:hidden flex items-center gap-1 text-xs text-white/50 hover:text-white/80 transition-colors mb-4"
      >
        <ChevronLeft className="size-3.5" />
        Back
      </button>
      <p className="text-xs text-white/35 uppercase tracking-wide mb-2">{article.baseName}</p>
      <h1 className="text-xl font-semibold text-white/90 mb-4">{article.title}</h1>

      <div className="flex items-center gap-6 pt-2 pb-2 border-t border-b border-border text-xs text-white/40">
        <div>
          <p className="text-white/30 uppercase tracking-wide text-xs">Updated</p>
          <p className="text-white/60 mt-0.5">{formatDate(article.updatedAt)}</p>
        </div>
        <div>
          <p className="text-white/30 uppercase tracking-wide text-xs">Cited</p>
          <p className="text-white/60 mt-0.5">{article.citationCount ?? 0} times</p>
        </div>
        {article.baseSource === 'user' && (
          <div className="ml-auto flex items-center gap-1">
            <button type="button"
              onClick={onStartEdit}
              className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white/90 bg-white/[0.05] hover:bg-white/[0.10] border border-white/[0.08] px-3 py-1.5 rounded transition-colors"
            >
              <Pencil className="size-3" />
              Edit
            </button>
            <button type="button"
              onClick={onDelete}
              disabled={isDeleting}
              className="flex items-center gap-1.5 text-xs text-white/60 hover:text-red-400 bg-white/[0.05] hover:bg-white/[0.10] border border-white/[0.08] disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 rounded transition-colors"
            >
              {isDeleting ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
              {isDeleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        )}
      </div>
      {deleteError && (
        <p className="mt-3 text-xs text-red-400" aria-live="polite">{deleteError}</p>
      )}
      <div className="text-sm text-white/65 leading-relaxed pt-6 whitespace-pre-wrap mb-6">
        {article.body}
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-6">
          {tags.map(tag => (
            <span key={tag} className="text-xs font-medium text-white/55 bg-white/[0.05] border border-white/[0.08] px-2 py-0.5 rounded-full">
              #{tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
