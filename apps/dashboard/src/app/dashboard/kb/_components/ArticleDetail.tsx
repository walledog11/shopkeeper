import { Check, ChevronLeft, Pencil, Trash2, Loader2 } from "lucide-react"
import { formatDate, inputCls, type ArticleWithBase } from "./kb-page-utils"

export function ArticleDetail({
  article,
  isEditing,
  editDraft,
  isEditSaving,
  editError,
  isDeleting,
  deleteError,
  onEditDraftChange,
  onCancelEdit,
  onSaveEdit,
  onStartEdit,
  onDelete,
  onBack,
}: {
  article: ArticleWithBase
  isEditing: boolean
  editDraft: { title: string; body: string; tags: string }
  isEditSaving: boolean
  editError: string | null
  isDeleting: boolean
  deleteError: string | null
  onEditDraftChange: React.Dispatch<React.SetStateAction<{ title: string; body: string; tags: string }>>
  onCancelEdit: () => void
  onSaveEdit: () => void
  onStartEdit: () => void
  onDelete: () => void
  onBack: () => void
}) {
  const tags = article.tags ?? []

  if (isEditing) {
    return (
      <div className="px-4 md:px-8 py-6 space-y-3 max-w-3xl">
        <input
          aria-label="Article title"
          value={editDraft.title}
          onChange={e => onEditDraftChange(d => ({ ...d, title: e.target.value }))}
          className={`${inputCls} text-lg font-semibold`}
        />
        <textarea
          aria-label="Article body"
          value={editDraft.body}
          onChange={e => onEditDraftChange(d => ({ ...d, body: e.target.value }))}
          rows={16}
          className={`${inputCls} resize-y`}
        />
        <input aria-label="Tags (comma-separated)"
          placeholder="Tags (comma-separated)"
          value={editDraft.tags}
          onChange={e => onEditDraftChange(d => ({ ...d, tags: e.target.value }))}
          className={inputCls}
        />
        {editError && (
          <p className="text-xs text-red-400" aria-live="polite">{editError}</p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancelEdit} className="text-xs text-white/40 hover:text-white/70 transition-colors px-3 py-1.5">
            Cancel
          </button>
          <button type="button"
            onClick={onSaveEdit}
            disabled={isEditSaving || !editDraft.title.trim() || !editDraft.body.trim()}
            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-white/[0.12] hover:bg-white/[0.18] disabled:opacity-40 px-3 py-1.5 rounded-md transition-colors"
          >
            {isEditSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            Save
          </button>
        </div>
      </div>
    )
  }

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
