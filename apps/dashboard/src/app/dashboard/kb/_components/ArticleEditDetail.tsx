import type { Dispatch, SetStateAction } from "react"
import { Check, Loader2 } from "lucide-react"
import { inputCls } from "./kb-page-utils"

interface ArticleEditDetailProps {
  editDraft: { title: string; body: string; tags: string }
  editError: string | null
  isSaving: boolean
  onCancelEdit: () => void
  onEditDraftChange: Dispatch<SetStateAction<{ title: string; body: string; tags: string }>>
  onSaveEdit: () => void
}

export function ArticleEditDetail({
  editDraft,
  editError,
  isSaving,
  onCancelEdit,
  onEditDraftChange,
  onSaveEdit,
}: ArticleEditDetailProps) {
  return (
    <div className="px-4 md:px-8 py-6 space-y-3 max-w-3xl">
      <input
        aria-label="Note title"
        value={editDraft.title}
        onChange={e => onEditDraftChange(d => ({ ...d, title: e.target.value }))}
        className={`${inputCls} text-lg font-semibold`}
      />
      <textarea
        aria-label="Note body"
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
          disabled={isSaving || !editDraft.title.trim() || !editDraft.body.trim()}
          className="flex items-center gap-1.5 text-xs font-semibold text-white bg-white/[0.12] hover:bg-white/[0.18] disabled:opacity-40 px-3 py-1.5 rounded-md transition-colors"
        >
          {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          Save
        </button>
      </div>
    </div>
  )
}
