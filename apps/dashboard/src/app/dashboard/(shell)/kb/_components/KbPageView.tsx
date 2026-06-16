import { Check, FileText, Loader2, Plus, Search } from "lucide-react"
import { ArticleCard } from "./ArticleCard"
import { ArticleEditDetail } from "./ArticleEditDetail"
import { ArticleReadDetail } from "./ArticleReadDetail"
import { CollectionList, CollectionsDropdown, NewKbForm } from "./CollectionsPanel"
import { SORT_OPTIONS, inputCls, type SortKey } from "./kb-page-utils"
import type { KbPageState } from "./useKbPageState"

interface KbPageViewProps {
  state: KbPageState
}

export function KbPageView({ state }: KbPageViewProps) {
  const {
    allArticles,
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
    mobileView,
    newKbName,
    search,
    selectArticle,
    selectBase,
    selectedArticle,
    selectedArticleId,
    selectedBaseId,
    setArticleCreateError,
    setArticleDraft,
    setEditDraft,
    setEditError,
    setIsCreatingArticle,
    setIsCreatingKb,
    setIsEditing,
    setKbActionError,
    setMobileView,
    setNewKbName,
    setSearch,
    setSort,
    sort,
    startEdit,
    visibleArticles,
  } = state

  const collectionsDropdown = (
    <CollectionsDropdown
      knowledgeBases={knowledgeBases}
      selectedBaseId={selectedBaseId}
      allArticlesCount={allArticles.length}
      onSelectBase={selectBase}
      onDeleteKb={handleDeleteKb}
      isCreatingKb={isCreatingKb}
      setIsCreatingKb={setIsCreatingKb}
      newKbName={newKbName}
      setNewKbName={setNewKbName}
      isCreatingKbSaving={isCreatingKbSaving}
      onCreateKb={handleCreateKb}
      actionError={kbActionError}
      onClearActionError={() => setKbActionError(null)}
    />
  )

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-2 md:px-8 py-2 md:py-3 border-b border-border shrink-0">
        <h1 className="text-md font-semibold text-foreground">Memory</h1>
        <div className="flex items-center gap-2">
          <button type="button"
            onClick={() => { setIsCreatingKb(true); setKbActionError(null) }}
            className="hidden md:flex items-center gap-1.5 text-xs font-medium text-foreground/70 bg-foreground/[0.06] hover:bg-foreground/[0.10] border border-foreground/[0.12] px-3 py-1.5 rounded-md transition-colors"
          >
            <Plus className="size-3.5" />
            New folder
          </button>
          <button type="button"
            onClick={() => { setIsCreatingArticle(true); setArticleCreateError(null); setMobileView("list") }}
            disabled={!articleTargetKb || isCreatingArticle}
            title={!articleTargetKb ? "Select or create a folder first" : undefined}
            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-foreground/[0.10] hover:bg-foreground/[0.15] border border-foreground/[0.12] disabled:opacity-40 disabled:cursor-not-allowed px-2 md:px-3 py-1.5 rounded-md transition-colors"
          >
            <Plus className="size-3.5" />
            <span className="hidden md:inline">New note</span>
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <aside className="hidden md:flex flex-col w-full md:w-[200px] shrink-0 border-r border-border overflow-y-auto custom-scrollbar py-4 px-3">
          <p className="text-xs font-semibold text-foreground/30 uppercase tracking-wider px-2 mb-2">Folders</p>
          <CollectionList
            knowledgeBases={knowledgeBases}
            allArticlesCount={allArticles.length}
            selectedBaseId={selectedBaseId}
            onSelectBase={selectBase}
            onDeleteKb={handleDeleteKb}
          />

          {isCreatingKb && (
            <div className="mt-3 px-2">
              <NewKbForm
                name={newKbName}
                onNameChange={setNewKbName}
                onSubmit={handleCreateKb}
                onCancel={() => { setIsCreatingKb(false); setNewKbName(""); setKbActionError(null) }}
                isSaving={isCreatingKbSaving}
                error={kbActionError}
              />
            </div>
          )}
        </aside>

        <section className={`${mobileView === "list" ? "flex" : "hidden"} md:flex flex-col w-full md:w-[400px] shrink-0 border-r border-border min-h-0`}>
          <div className="px-4 py-3 border-b border-border space-y-2.5 shrink-0">
            {collectionsDropdown}
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center flex-1 mr-4 bg-zinc-950 rounded-lg border border-foreground/10 px-3 py-2 hover:border-foreground/30">
                <Search className="size-4 text-foreground/50 shrink-0" />
                <input aria-label="Search memory…"
                  placeholder="Search memory…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full bg-transparent border-none focus:outline-none text-sm text-white placeholder:text-foreground/50 ml-2"
                />
              </div>

              <div className="flex items-center shrink-0">
                <p className="text-xs text-foreground/60 mr-1 whitespace-nowrap">Sort: </p>
                <select
                  aria-label="Sort notes"
                  value={sort}
                  onChange={e => setSort(e.target.value as SortKey)}
                  className="text-xs text-white bg-transparent focus:outline-none cursor-pointer hover:text-foreground/80"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      className="bg-zinc-900 text-white"
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {isCreatingArticle && (
            <div className="px-4 py-3 border-b border-border space-y-2 shrink-0 bg-foreground/[0.02]">
              <p className="text-xs text-foreground/40">
                New note in <span className="text-foreground/70">{articleTargetKb?.name}</span>
              </p>
              <input aria-label="Note title"
                placeholder="Note title"
                value={articleDraft.title}
                onChange={e => setArticleDraft(d => ({ ...d, title: e.target.value }))}
                className={inputCls}
              />
              <textarea aria-label="Write the note here…"
                placeholder="Write the note here…"
                value={articleDraft.body}
                onChange={e => setArticleDraft(d => ({ ...d, body: e.target.value }))}
                rows={5}
                className={`${inputCls} resize-none`}
              />
              <input aria-label="Tags (comma-separated)"
                placeholder="Tags (comma-separated)"
                value={articleDraft.tags}
                onChange={e => setArticleDraft(d => ({ ...d, tags: e.target.value }))}
                className={inputCls}
              />
              {articleCreateError && (
                <p className="text-xs text-red-400" aria-live="polite">{articleCreateError}</p>
              )}
              <div className="flex justify-end gap-2">
                <button type="button"
                  onClick={() => { setIsCreatingArticle(false); setArticleDraft({ title: "", body: "", tags: "" }); setArticleCreateError(null) }}
                  className="text-xs text-foreground/40 hover:text-foreground/70 transition-colors px-3 py-1.5"
                >
                  Cancel
                </button>
                <button type="button"
                  onClick={handleCreateArticle}
                  disabled={!articleTargetKb || isArticleSaving || !articleDraft.title.trim() || !articleDraft.body.trim()}
                  className="flex items-center gap-1.5 text-xs font-semibold text-white bg-foreground/[0.12] hover:bg-foreground/[0.18] disabled:opacity-40 px-3 py-1.5 rounded-md transition-colors"
                >
                  {isArticleSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                  Save
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {!isLoading && visibleArticles.length === 0 && (
              <div className="px-4 py-12 text-center">
                <p className="text-xs text-foreground/30">
                  {search ? "No notes match your search." : "No notes in this folder."}
                </p>
              </div>
            )}
            {visibleArticles.map(a => (
              <ArticleCard
                key={a.id}
                article={a}
                active={selectedArticleId === a.id}
                onClick={() => selectArticle(a.id)}
              />
            ))}
          </div>
        </section>

        <main className={`${mobileView === "detail" ? "flex" : "hidden"} md:flex flex-col flex-1 min-w-0 overflow-y-auto custom-scrollbar bg-background`}>
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
                onBack={() => setMobileView("list")}
              />
            )
          ) : (
            <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6">
              <span className="flex size-11 items-center justify-center rounded-full border border-border bg-foreground/[0.04]">
                <FileText className="size-5 text-foreground/40" />
              </span>
              <div className="flex flex-col gap-1">
                <h2 className="font-display-serif text-lg text-foreground">
                  {allArticles.length === 0 ? "Start your memory" : "Select a note"}
                </h2>
                <p className="text-sm text-foreground/50 max-w-[230px]">
                  {allArticles.length === 0
                    ? "Add a note so your agent can answer from it."
                    : "Choose a note from the list to read or edit it."}
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
