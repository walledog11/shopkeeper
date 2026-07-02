"use client"

import { Check, ChevronDown, Loader2, Search, X } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useMobileChromeOverride } from "@/app/dashboard/_components/mobile-chrome/MobileChromeContext"
import { useIsMobile } from "@/hooks/useMobile"
import { ArticleEditDetail } from "./ArticleEditDetail"
import { ArticleReadDetail } from "./ArticleReadDetail"
import { NewKbForm } from "./CollectionsPanel"
import { MemoryStackBoard } from "./MemoryStackBoard"
import { SORT_OPTIONS, inputCls, type SortKey } from "./kb-page-utils"
import type { KbPageState } from "./useKbPageState"

interface KbPageViewProps {
  state: KbPageState
}

const GLASS_SHELL_CLASS =
  "space-y-2 rounded-[22px] border border-foreground/[0.08] bg-card/60 px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.55),0_18px_50px_rgba(43,33,24,0.13)] backdrop-blur-2xl backdrop-saturate-150 supports-[backdrop-filter]:bg-card/45"

const GLASS_CONTROL_CLASS =
  "border border-foreground/[0.08] bg-background/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.38)] backdrop-blur-md backdrop-saturate-150 supports-[backdrop-filter]:bg-background/28"

export function KbPageView({ state }: KbPageViewProps) {
  const {
    articleCreateError,
    articleDeleteError,
    articleDraft,
    articleTargetKb,
    editDraft,
    editError,
    handleCreateArticle,
    handleCreateKb,
    handleDeleteArticle,
    handleDeleteKb,
    handleUpdateArticle,
    isArticleDeleting,
    isArticleSaving,
    isCreatingArticle,
    isCreatingKb,
    isCreatingKbSaving,
    isEditing,
    isEditSaving,
    isLoading,
    kbActionError,
    knowledgeBases,
    newKbName,
    search,
    selectArticle,
    selectBase,
    selectedArticle,
    selectedArticleId,
    setArticleCreateError,
    setArticleDraft,
    setEditDraft,
    setEditError,
    setIsCreatingArticle,
    setIsCreatingKb,
    setIsEditing,
    setKbActionError,
    setNewKbName,
    setSearch,
    setSort,
    sort,
    startEdit,
    visibleArticles,
  } = state
  const isMobile = useIsMobile()
  useMobileChromeOverride(isMobile && selectedArticle ? "detail" : null)

  const closeCreateKb = () => {
    setIsCreatingKb(false)
    setNewKbName("")
    setKbActionError(null)
  }
  const closeCreateArticle = () => {
    setIsCreatingArticle(false)
    setArticleDraft({ title: "", body: "", tags: "" })
    setArticleCreateError(null)
  }

  return (
    <div className="relative flex size-full flex-col overflow-hidden bg-background">
      <div className="relative z-20 shrink-0 px-3 pt-3 pb-3">
        <div className={GLASS_SHELL_CLASS}>
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className={`flex h-9 min-w-0 items-center gap-2 rounded-full px-3.5 md:flex-1 ${GLASS_CONTROL_CLASS}`}>
              <Search className="size-3.5 shrink-0 text-faint" />
              <input aria-label="Search memory"
                placeholder="Search memory..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm text-strong placeholder:text-faint outline-none"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="text-faint transition-colors hover:text-muted-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            <div className="relative flex items-center">
              <select
                aria-label="Sort notes"
                value={sort}
                onChange={e => setSort(e.target.value as SortKey)}
                className={`h-9 min-w-0 flex-1 appearance-none rounded-full pl-3.5 pr-9 text-xs font-semibold text-muted-foreground outline-none transition-colors hover:text-strong md:w-44 md:flex-none ${GLASS_CONTROL_CLASS}`}
              >
                {SORT_OPTIONS.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                    className="bg-card text-foreground"
                  >
                    {option.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
            </div>
          </div>
        </div>
      </div>

      {!isCreatingKb && kbActionError && (
        <div className="shrink-0 border-b border-border bg-red-500/[0.06] px-4 py-2 text-xs text-red-400 sm:px-6" aria-live="polite">
          {kbActionError}
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-faint" />
        </div>
      ) : (
        <MemoryStackBoard
          articles={visibleArticles}
          activeArticleId={selectedArticleId}
          knowledgeBases={knowledgeBases}
          onCreateArticleInKb={(kbId) => {
            selectBase(kbId)
            setArticleCreateError(null)
            setIsCreatingArticle(true)
          }}
          onCreateKb={() => { setIsCreatingKb(true); setKbActionError(null) }}
          onDeleteKb={handleDeleteKb}
          onSelectArticle={selectArticle}
          showEmptyUserFolders={search.trim().length === 0}
        />
      )}

      <Dialog open={isCreatingKb} onOpenChange={open => { if (!open) closeCreateKb() }}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-2xl border-border bg-background p-5 shadow-xl">
          <DialogTitle className="text-base font-semibold text-foreground">New Folder</DialogTitle>
          <NewKbForm
            name={newKbName}
            onNameChange={setNewKbName}
            onSubmit={handleCreateKb}
            onCancel={closeCreateKb}
            isSaving={isCreatingKbSaving}
            error={kbActionError}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={isCreatingArticle} onOpenChange={open => { if (!open) closeCreateArticle() }}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-2xl rounded-2xl border-border bg-background p-5 shadow-xl">
          <DialogTitle className="text-base font-semibold text-foreground">New Note</DialogTitle>
          <div className="space-y-3">
            <p className="text-xs text-faint">
              Folder <span className="text-strong">{articleTargetKb?.name}</span>
            </p>
            <input aria-label="Note title"
              placeholder="Note title"
              value={articleDraft.title}
              onChange={e => setArticleDraft(d => ({ ...d, title: e.target.value }))}
              className={inputCls}
            />
            <textarea aria-label="Write the note here"
              placeholder="Write the note here..."
              value={articleDraft.body}
              onChange={e => setArticleDraft(d => ({ ...d, body: e.target.value }))}
              rows={8}
              className={`${inputCls} resize-none`}
            />
            <input aria-label="Tags, comma-separated"
              placeholder="Tags, comma-separated"
              value={articleDraft.tags}
              onChange={e => setArticleDraft(d => ({ ...d, tags: e.target.value }))}
              className={inputCls}
            />
            {articleCreateError && (
              <p className="text-xs text-red-400" aria-live="polite">{articleCreateError}</p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button"
                onClick={closeCreateArticle}
                className="px-3 py-1.5 text-xs text-faint transition-colors hover:text-strong"
              >
                Cancel
              </button>
              <button type="button"
                onClick={handleCreateArticle}
                disabled={!articleTargetKb || isArticleSaving || !articleDraft.title.trim() || !articleDraft.body.trim()}
                className="flex items-center gap-1.5 rounded-md bg-foreground/[0.12] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-foreground/[0.18] disabled:opacity-40"
              >
                {isArticleSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                Save
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedArticle)} onOpenChange={open => { if (!open) selectArticle(null) }}>
        <DialogContent
          showCloseButton={false}
          className="flex h-[86vh] w-[calc(100%-2rem)] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden rounded-2xl border-border bg-background p-0 shadow-xl sm:max-w-3xl lg:max-w-5xl"
        >
          <DialogTitle className="sr-only">Memory note</DialogTitle>
          <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
            {selectedArticle ? (
              isEditing ? (
              <ArticleEditDetail
                editDraft={editDraft}
                editError={editError}
                isSaving={isEditSaving}
                onEditDraftChange={setEditDraft}
                onCancelEdit={() => { setIsEditing(false); setEditError(null) }}
                onSaveEdit={handleUpdateArticle}
              />
            ) : (
              <ArticleReadDetail
                article={selectedArticle}
                deleteError={articleDeleteError}
                isDeleting={isArticleDeleting}
                onStartEdit={startEdit}
                onDelete={handleDeleteArticle}
                onBack={() => selectArticle(null)}
              />
            )
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
