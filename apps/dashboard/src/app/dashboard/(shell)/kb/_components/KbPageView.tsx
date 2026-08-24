"use client"

import { Check, Loader2, Plus } from "lucide-react"
import { MemoryLibrarySkeleton } from "@/app/dashboard/_components/skeletons"
import { dashboardChromeColumnClassName } from "@/app/dashboard/_components/sidebar/sidebar-helpers"
import { DashboardDetailDialog } from "@/app/dashboard/_components/board/DashboardDetailDialog"
import { useMobileChromeOverride } from "@/app/dashboard/_components/mobile-chrome/MobileChromeContext"
import { SearchFilterBar } from "@/components/ui/search-filter-bar"
import { useIsMobile } from "@/hooks/useMobile"
import { CONTEXT_CATEGORIES } from "@/lib/memory/context"
import { cn } from "@/lib/ui/cn"
import { ArticleEditDetail } from "./ArticleEditDetail"
import { MemoryArticleExpandDialog } from "./MemoryArticleExpandDialog"
import { MemoryLibrary } from "./MemoryLibrary"
import { memoryCardTitle } from "./memory-page-utils"
import { inputCls } from "./kb-page-utils"
import type { KbPageState } from "./useKbPageState"

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
      <div className={cn(dashboardChromeColumnClassName(), "flex min-h-0 flex-1 flex-col")}>
        <div className="relative z-20 shrink-0 pb-3 pt-3 md:pt-0">
          <SearchFilterBar
            value={search}
            onValueChange={setSearch}
            placeholder="Search memory…"
            aria-label="Search memory"
            onClear={() => setSearch("")}
            trailing={
              <button
                type="button"
                onClick={beginAddContext}
                className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-xl bg-foreground px-4 text-sm font-semibold text-background"
              >
                <Plus className="size-3.5" />
                Add note
              </button>
            }
          />
        </div>

        <div className="custom-scrollbar flex-1 overflow-y-auto">
          <div className="py-6 pb-16">
            {isLoading ? (
              <MemoryLibrarySkeleton />
            ) : (
              <MemoryLibrary
                books={visibleBooks}
                hasActiveSearch={filtered}
                selectedBookId={selectedBookId}
                onSelectBook={selectBook}
                onCloseBook={closeBook}
                onAddNote={beginAddContext}
                onOpenArticle={expandArticle}
              />
            )}
          </div>
        </div>
      </div>

      <DashboardDetailDialog open={isCreatingArticle} title={correctionTarget ? "Correct memory" : "Add note"} maxWidthClassName="sm:max-w-2xl" onClose={closeContextComposer}>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-border px-5 py-5 pr-12 sm:px-6"><h2 className="text-lg font-semibold text-foreground">{correctionTarget ? "Correct memory" : "Add note"}</h2><p className="mt-1 text-xs text-muted-foreground">{correctionTarget ? `Replace what the agent currently knows about ${memoryCardTitle(correctionTarget)}.` : "Add a fact, policy, or instruction your agent should remember."}</p></div>
          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6"><textarea autoFocus aria-label="Note for the agent" placeholder={correctionTarget ? "Write the accurate information the agent should use instead." : "e.g. Never call our products cheap; say affordable."} value={articleDraft.body} onChange={event => setArticleDraft(draft => ({ ...draft, body: event.target.value }))} rows={9} maxLength={4000} className={`${inputCls} resize-none`} /><div className="mt-2 flex justify-between text-xs text-faint"><span>{articleDraft.body.length.toLocaleString()} / 4,000</span><span>{correctionTarget ? "Overrides the original" : "Saved to your notes"}</span></div><div className="mt-6"><p className="mb-2 text-xs font-semibold text-muted-foreground">Topic</p><div className="flex flex-wrap gap-1.5">{CONTEXT_CATEGORIES.map(category => <button key={category.value} type="button" onClick={() => setArticleDraft(draft => ({ ...draft, category: category.value }))} className={`rounded-full border px-3 py-1.5 text-xs ${articleDraft.category === category.value ? "border-foreground/20 bg-foreground/[0.09] text-foreground" : "border-border text-muted-foreground"}`}>{category.label}</button>)}</div></div></div>
          <div className="shrink-0 border-t border-border bg-background px-5 py-4 sm:px-6">{articleCreateError && <p className="mb-3 text-xs text-red-600">{articleCreateError}</p>}<div className="flex justify-end gap-2"><button type="button" onClick={closeContextComposer} className="px-3 py-1.5 text-xs text-faint">Cancel</button><button type="button" onClick={handleCreateArticle} disabled={isArticleSaving || !articleDraft.body.trim()} className="flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background disabled:opacity-40">{isArticleSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}{correctionTarget ? "Save correction" : "Save note"}</button></div></div>
        </div>
      </DashboardDetailDialog>

      <MemoryArticleExpandDialog article={expandedArticle} deleteError={articleDeleteError} isDeleting={isArticleDeleting} onClose={closeArticleOverlay} onCorrect={beginCorrection} onDelete={handleDeleteArticle} onEdit={startEdit} />
      <DashboardDetailDialog open={Boolean(selectedArticle)} title="Edit note" maxWidthClassName="sm:max-w-2xl" onClose={closeArticleOverlay}>{selectedArticle ? <ArticleEditDetail editDraft={editDraft} editError={editError} isSaving={isEditSaving} onEditDraftChange={setEditDraft} onCancelEdit={closeArticleOverlay} onSaveEdit={handleUpdateArticle} /> : null}</DashboardDetailDialog>
    </div>
  )
}
