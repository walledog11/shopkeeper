import type { Dispatch, SetStateAction } from "react"
import { Check, Loader2 } from "lucide-react"
import { inputCls } from "./kb-page-utils"

interface Props {
  editDraft: { title: string; body: string }
  editError: string | null
  isSaving: boolean
  onCancelEdit: () => void
  onEditDraftChange: Dispatch<SetStateAction<{ title: string; body: string }>>
  onSaveEdit: () => void
}

export function ArticleEditDetail({ editDraft, editError, isSaving, onCancelEdit, onEditDraftChange, onSaveEdit }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border px-5 py-5 pr-12 sm:px-6"><p className="text-xs font-semibold uppercase text-faint">Your notes</p><h2 className="mt-1 text-lg font-semibold text-foreground">Edit memory</h2></div>
      <div className="custom-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
        <div><label htmlFor="memory-note-title" className="mb-2 block text-xs font-semibold text-muted-foreground">Title</label><input id="memory-note-title" value={editDraft.title} onChange={event => onEditDraftChange(draft => ({ ...draft, title: event.target.value }))} className={`${inputCls} font-semibold`} /></div>
        <div><label htmlFor="memory-note-body" className="mb-2 block text-xs font-semibold text-muted-foreground">Context</label><textarea id="memory-note-body" value={editDraft.body} onChange={event => onEditDraftChange(draft => ({ ...draft, body: event.target.value }))} rows={14} className={`${inputCls} resize-none`} /></div>
      </div>
      <div className="shrink-0 border-t border-border bg-background px-5 py-4 sm:px-6">
        {editError && <p className="mb-3 text-xs text-red-400">{editError}</p>}
        <div className="flex justify-end gap-2"><button type="button" onClick={onCancelEdit} className="px-3 py-1.5 text-xs text-faint hover:text-strong">Cancel</button><button type="button" onClick={onSaveEdit} disabled={isSaving || !editDraft.title.trim() || !editDraft.body.trim()} className="flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background disabled:opacity-40">{isSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}Save changes</button></div>
      </div>
    </div>
  )
}
