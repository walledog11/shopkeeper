"use client"

import { Check, Loader2, Plus, Search, X } from "lucide-react"
import { DashboardDetailDialog } from "@/app/dashboard/_components/board/DashboardDetailDialog"
import { useMobileChromeOverride } from "@/app/dashboard/_components/mobile-chrome/MobileChromeContext"
import { useIsMobile } from "@/hooks/useMobile"
import { CONTEXT_CATEGORIES } from "@/lib/memory/context"
import { ArticleEditDetail } from "./ArticleEditDetail"
import { MemoryArticleExpandDialog } from "./MemoryArticleExpandDialog"
import { MemoryLibrary } from "./MemoryLibrary"
import { memoryCardTitle } from "./memory-page-utils"
import { inputCls } from "./kb-page-utils"
import type { KbPageState } from "./useKbPageState"

const GLASS_SHELL = "rounded-[22px] border border-foreground/[0.08] bg-card/60 px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_18px_50px_rgba(43,33,24,0.13)] backdrop-blur-2xl backdrop-saturate-150 supports-[backdrop-filter]:bg-card/45"
const GLASS_CONTROL = "border border-foreground/[0.08] bg-background/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.38)] backdrop-blur-md backdrop-saturate-150 supports-[backdrop-filter]:bg-background/28"

export function KbPageView({ state }: { state: KbPageState }) {
  const {
    articleCreateError, articleDeleteError, articleDraft, beginAddContext, beginCorrection,
    closeArticleOverlay, closeContextComposer, correctionTarget, editDraft, editError,
    expandedArticle, expandArticle, handleCreateArticle, handleDeleteArticle, handleUpdateArticle,
    isArticleDeleting, isArticleSaving, isCreatingArticle, isEditSaving, isLoading, search,
    selectedArticle, setArticleDraft, setEditDraft, setSearch, startEdit, visibleBooks,
    selectedBookId, selectBook, closeBook,
  } = state
  const mobile = useIsMobile()
  const detailOpen = Boolean(expandedArticle || selectedArticle || isCreatingArticle)
  useMobileChromeOverride(mobile && detailOpen ? "detail" : null)
  const filtered = Boolean(search.trim())

  return (
    <div className="relative flex size-full flex-col overflow-hidden bg-background">
      <div className="relative z-20 shrink-0 px-3 pb-3 pt-3">
        <div className={GLASS_SHELL}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className={`flex h-9 min-w-0 items-center gap-2 rounded-full px-3.5 sm:flex-1 ${GLASS_CONTROL}`}>
              <Search className="size-3.5 shrink-0 text-faint" />
              <input aria-label="Search memory" placeholder="Search memory…" value={search} onChange={event => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-strong outline-none placeholder:text-faint" />
              {search && <button type="button" onClick={() => setSearch("")} aria-label="Clear search" className="text-faint hover:text-muted-foreground"><X className="size-3.5" /></button>}
            </div>
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={beginAddContext} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-3 text-xs font-semibold text-background"><Plus className="size-3.5" />Add note</button>
            </div>
          </div>
        </div>
      </div>

      {isLoading ? <div className="flex flex-1 items-center justify-center"><Loader2 className="size-5 animate-spin text-faint" /></div> : <div className="custom-scrollbar flex-1 overflow-y-auto"><div className="px-4 py-6 pb-16 sm:px-6 lg:px-8"><MemoryLibrary books={visibleBooks} hasActiveSearch={filtered} selectedBookId={selectedBookId} onSelectBook={selectBook} onCloseBook={closeBook} onAddNote={beginAddContext} onOpenArticle={expandArticle} /></div></div>}

      <DashboardDetailDialog open={isCreatingArticle} title={correctionTarget ? "Correct memory" : "Add note"} maxWidthClassName="sm:max-w-2xl" onClose={closeContextComposer}>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-border px-5 py-5 pr-12 sm:px-6"><h2 className="text-lg font-semibold text-foreground">{correctionTarget ? "Correct memory" : "Add note"}</h2><p className="mt-1 text-xs text-muted-foreground">{correctionTarget ? `Replace what the agent currently knows about ${memoryCardTitle(correctionTarget)}.` : "Add a fact, policy, or instruction your agent should remember."}</p></div>
          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6"><textarea autoFocus aria-label="Note for the agent" placeholder={correctionTarget ? "Write the accurate information the agent should use instead." : "e.g. Never call our products cheap; say affordable."} value={articleDraft.body} onChange={event => setArticleDraft(draft => ({ ...draft, body: event.target.value }))} rows={9} maxLength={4000} className={`${inputCls} resize-none`} /><div className="mt-2 flex justify-between text-xs text-faint"><span>{articleDraft.body.length.toLocaleString()} / 4,000</span><span>{correctionTarget ? "Overrides the original" : "Saved to your notes"}</span></div><div className="mt-6"><p className="mb-2 text-xs font-semibold text-muted-foreground">Topic</p><div className="flex flex-wrap gap-1.5">{CONTEXT_CATEGORIES.map(category => <button key={category.value} type="button" onClick={() => setArticleDraft(draft => ({ ...draft, category: category.value }))} className={`rounded-full border px-3 py-1.5 text-xs ${articleDraft.category === category.value ? "border-foreground/20 bg-foreground/[0.09] text-foreground" : "border-border text-muted-foreground"}`}>{category.label}</button>)}</div></div></div>
          <div className="shrink-0 border-t border-border bg-background px-5 py-4 sm:px-6">{articleCreateError && <p className="mb-3 text-xs text-red-400">{articleCreateError}</p>}<div className="flex justify-end gap-2"><button type="button" onClick={closeContextComposer} className="px-3 py-1.5 text-xs text-faint">Cancel</button><button type="button" onClick={handleCreateArticle} disabled={isArticleSaving || !articleDraft.body.trim()} className="flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background disabled:opacity-40">{isArticleSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}{correctionTarget ? "Save correction" : "Save note"}</button></div></div>
        </div>
      </DashboardDetailDialog>

      <MemoryArticleExpandDialog article={expandedArticle} deleteError={articleDeleteError} isDeleting={isArticleDeleting} onClose={closeArticleOverlay} onCorrect={beginCorrection} onDelete={handleDeleteArticle} onEdit={startEdit} />
      <DashboardDetailDialog open={Boolean(selectedArticle)} title="Edit note" maxWidthClassName="sm:max-w-2xl" onClose={closeArticleOverlay}>{selectedArticle ? <ArticleEditDetail editDraft={editDraft} editError={editError} isSaving={isEditSaving} onEditDraftChange={setEditDraft} onCancelEdit={closeArticleOverlay} onSaveEdit={handleUpdateArticle} /> : null}</DashboardDetailDialog>
    </div>
  )
}
