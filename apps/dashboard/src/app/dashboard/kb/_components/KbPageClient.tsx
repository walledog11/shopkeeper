"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { Plus, Check, Loader2, Search } from "lucide-react"
import { CollectionList, CollectionsDropdown, NewKbForm } from "./CollectionsPanel"
import { fetcher } from "@/lib/api/fetcher"
import type { KnowledgeBase } from "@/types"
import { ArticleCard } from "./ArticleCard"
import { ArticleDetail } from "./ArticleDetail"
import { SORT_OPTIONS, inputCls, parseTags, type ArticleWithBase, type MobileView, type SortKey } from "./kb-page-utils"
import {
  createArticle,
  createKnowledgeBase,
  deleteArticle,
  deleteKnowledgeBase,
  updateArticle,
} from "./kb-page-requests"
import { errorMessageFromUnknown } from "@/lib/api/fetcher"

function useKbPageState() {
  const { data, isLoading, mutate } = useSWR<{ knowledgeBases: KnowledgeBase[] }>('/api/kb', fetcher)
  const knowledgeBases = useMemo(() => data?.knowledgeBases ?? [], [data])

  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null)
  const [selectedBaseId, setSelectedBaseId] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('recent')
  const [mobileView, setMobileView] = useState<MobileView>('list')

  // New KB
  const [isCreatingKb, setIsCreatingKb] = useState(false)
  const [newKbName, setNewKbName] = useState('')
  const [isCreatingKbSaving, setIsCreatingKbSaving] = useState(false)
  const [kbActionError, setKbActionError] = useState<string | null>(null)

  // New article
  const [isCreatingArticle, setIsCreatingArticle] = useState(false)
  const [articleDraft, setArticleDraft] = useState({ title: '', body: '', tags: '' })
  const [isArticleSaving, setIsArticleSaving] = useState(false)
  const [articleCreateError, setArticleCreateError] = useState<string | null>(null)

  // Edit
  const [isEditing, setIsEditing] = useState(false)
  const [editDraft, setEditDraft] = useState({ title: '', body: '', tags: '' })
  const [isEditSaving, setIsEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [isArticleDeleting, setIsArticleDeleting] = useState(false)
  const [articleDeleteError, setArticleDeleteError] = useState<string | null>(null)

  const userKbs = knowledgeBases.filter(kb => kb.source === 'user')
  const shopifyKb = knowledgeBases.find(kb => kb.source === 'shopify')
  const articleTargetKb = selectedBaseId === 'all'
    ? userKbs[0]
    : userKbs.find(kb => kb.id === selectedBaseId)

  const allArticles: ArticleWithBase[] = useMemo(() => {
    return knowledgeBases.flatMap(kb =>
      kb.articles.map(a => ({ ...a, baseName: kb.name, baseSource: kb.source }))
    )
  }, [knowledgeBases])

  const visibleArticles = useMemo(() => {
    let list = allArticles
    if (selectedBaseId !== 'all') {
      list = list.filter(a => a.knowledgeBaseId === selectedBaseId)
    }
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(a => a.title.toLowerCase().includes(q) || a.body.toLowerCase().includes(q))
    }
    const sorted = [...list]
    if (sort === 'recent') {
      sorted.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
    } else {
      sorted.sort((a, b) => a.title.localeCompare(b.title))
    }
    return sorted
  }, [allArticles, selectedBaseId, search, sort])

  const selectedArticle = useMemo(() => {
    if (!selectedArticleId) return null
    return allArticles.find(a => a.id === selectedArticleId) ?? null
  }, [allArticles, selectedArticleId])

  const selectArticle = (id: string | null) => {
    setSelectedArticleId(id)
    setIsEditing(false)
    setEditError(null)
    setArticleDeleteError(null)
    setMobileView(id ? 'detail' : 'list')
  }

  const selectBase = (id: string) => {
    setSelectedBaseId(id)
    setSelectedArticleId(null)
    setIsCreatingArticle(false)
    setIsEditing(false)
    setArticleCreateError(null)
    setEditError(null)
    setArticleDeleteError(null)
    setMobileView('list')
  }

  // Handlers
  const handleCreateKb = async () => {
    if (!newKbName.trim()) return
    setIsCreatingKbSaving(true)
    setKbActionError(null)
    try {
      const json = await createKnowledgeBase(newKbName.trim())
      await mutate()
      setIsCreatingKb(false)
      setNewKbName('')
      if (json.knowledgeBase.id) selectBase(json.knowledgeBase.id)
    } catch (error) {
      setKbActionError(errorMessageFromUnknown(error, 'Failed to create collection.'))
    } finally {
      setIsCreatingKbSaving(false)
    }
  }

  const handleDeleteKb = async (id: string) => {
    setKbActionError(null)
    try {
      await deleteKnowledgeBase(id)
      if (selectedBaseId === id) selectBase('all')
      else if (selectedArticle?.knowledgeBaseId === id) selectArticle(null)
      await mutate()
    } catch (error) {
      setKbActionError(errorMessageFromUnknown(error, 'Failed to delete collection.'))
    }
  }

  const handleCreateArticle = async () => {
    if (!articleTargetKb || !articleDraft.title.trim() || !articleDraft.body.trim()) return
    setIsArticleSaving(true)
    setArticleCreateError(null)
    try {
      const json = await createArticle(articleTargetKb.id, {
        title: articleDraft.title,
        body: articleDraft.body,
        tags: parseTags(articleDraft.tags),
      })
      await mutate()
      setIsCreatingArticle(false)
      setArticleDraft({ title: '', body: '', tags: '' })
      if (json.article.id) selectArticle(json.article.id)
    } catch (error) {
      setArticleCreateError(errorMessageFromUnknown(error, 'Failed to create article.'))
    } finally {
      setIsArticleSaving(false)
    }
  }

  const handleUpdateArticle = async () => {
    if (!selectedArticle) return
    setIsEditSaving(true)
    setEditError(null)
    try {
      await updateArticle(selectedArticle.id, {
        title: editDraft.title,
        body: editDraft.body,
        tags: parseTags(editDraft.tags),
      })
      await mutate()
      setIsEditing(false)
    } catch (error) {
      setEditError(errorMessageFromUnknown(error, 'Failed to update article.'))
    } finally {
      setIsEditSaving(false)
    }
  }

  const handleDeleteArticle = async () => {
    if (!selectedArticle) return
    setIsArticleDeleting(true)
    setArticleDeleteError(null)
    try {
      await deleteArticle(selectedArticle.id)
      selectArticle(null)
      await mutate()
    } catch (error) {
      setArticleDeleteError(errorMessageFromUnknown(error, 'Failed to delete article.'))
    } finally {
      setIsArticleDeleting(false)
    }
  }

  const startEdit = () => {
    if (!selectedArticle) return
    setEditDraft({ title: selectedArticle.title, body: selectedArticle.body, tags: selectedArticle.tags.join(', ') })
    setEditError(null)
    setArticleDeleteError(null)
    setIsEditing(true)
  }

  return {
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
  }
}

export default function KbPageClient() {
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
  } = useKbPageState()

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

  // Render
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-2 md:px-8 py-2 md:py-3 border-b border-border shrink-0">
        <h1 className="text-md font-semibold text-foreground">Memory</h1>
        <div className="flex items-center gap-2">
          <button type="button"
            onClick={() => { setIsCreatingKb(true); setKbActionError(null) }}
            className="hidden md:flex items-center gap-1.5 text-xs font-medium text-white/70 bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.12] px-3 py-1.5 rounded-md transition-colors"
          >
            <Plus className="size-3.5" />
            New collection
          </button>
          <button type="button"
            onClick={() => { setIsCreatingArticle(true); setArticleCreateError(null); setMobileView('list') }}
            disabled={!articleTargetKb || isCreatingArticle}
            title={!articleTargetKb ? 'Select or create a custom collection first' : undefined}
            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-white/[0.10] hover:bg-white/[0.15] border border-white/[0.12] disabled:opacity-40 disabled:cursor-not-allowed px-2 md:px-3 py-1.5 rounded-md transition-colors"
          >
            <Plus className="size-3.5" />
            <span className="hidden md:inline">New article</span>
          </button>
        </div>
      </div>

      {/* Three-pane body */}
      <div className="flex flex-1 min-h-0">
        {/* Left rail , collections */}
        <aside className="hidden md:flex flex-col w-full md:w-[200px] shrink-0 border-r border-border overflow-y-auto custom-scrollbar py-4 px-3">
          <p className="text-xs font-semibold text-white/30 uppercase tracking-wider px-2 mb-2">Collections</p>
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
                onCancel={() => { setIsCreatingKb(false); setNewKbName(''); setKbActionError(null) }}
                isSaving={isCreatingKbSaving}
                error={kbActionError}
              />
            </div>
          )}
        </aside>

        {/* Middle , article list */}
        <section className={`${mobileView === 'list' ? 'flex' : 'hidden'} md:flex flex-col w-full md:w-[400px] shrink-0 border-r border-border min-h-0`}>
          <div className="px-4 py-3 border-b border-border space-y-2.5 shrink-0">
            {collectionsDropdown}
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center flex-1 mr-4 bg-zinc-950 rounded-lg border border-white/10 px-3 py-2 hover:border-white/30">
                <Search className="size-4 text-white/50 shrink-0" />
                <input aria-label="Search memory…"
                  placeholder="Search memory…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full bg-transparent border-none focus:outline-none text-sm text-white placeholder:text-white/50 ml-2" 
                />
              </div>

              <div className="flex items-center shrink-0">
                <p className="text-xs text-white/60 mr-1 whitespace-nowrap">Sort: </p>
                <select
                  aria-label="Sort articles"
                  value={sort}
                  onChange={e => setSort(e.target.value as SortKey)}
                  className="text-xs text-white bg-transparent focus:outline-none cursor-pointer hover:text-white/80"
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
            <div className="px-4 py-3 border-b border-border space-y-2 shrink-0 bg-white/[0.02]">
              <p className="text-xs text-white/40">
                New article in <span className="text-white/70">{articleTargetKb?.name}</span>
              </p>
              <input aria-label="Article title"
                placeholder="Article title"
                value={articleDraft.title}
                onChange={e => setArticleDraft(d => ({ ...d, title: e.target.value }))}
                className={inputCls}
              />
              <textarea aria-label="Write the article content here…"
                placeholder="Write the article content here…"
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
                  onClick={() => { setIsCreatingArticle(false); setArticleDraft({ title: '', body: '', tags: '' }); setArticleCreateError(null) }}
                  className="text-xs text-white/40 hover:text-white/70 transition-colors px-3 py-1.5"
                >
                  Cancel
                </button>
                <button type="button"
                  onClick={handleCreateArticle}
                  disabled={!articleTargetKb || isArticleSaving || !articleDraft.title.trim() || !articleDraft.body.trim()}
                  className="flex items-center gap-1.5 text-xs font-semibold text-white bg-white/[0.12] hover:bg-white/[0.18] disabled:opacity-40 px-3 py-1.5 rounded-md transition-colors"
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
                <p className="text-xs text-white/30">
                  {search ? 'No articles match your search.' : 'No articles in this collection.'}
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

        {/* Right , detail */}
        <main className={`${mobileView === 'detail' ? 'flex' : 'hidden'} md:flex flex-col flex-1 min-w-0 overflow-y-auto custom-scrollbar bg-background`}>
          {selectedArticle ? (
            <ArticleDetail
              article={selectedArticle}
              isEditing={isEditing}
              editDraft={editDraft}
              isEditSaving={isEditSaving}
              editError={editError}
              isDeleting={isArticleDeleting}
              deleteError={articleDeleteError}
              onEditDraftChange={setEditDraft}
              onCancelEdit={() => { setIsEditing(false); setEditError(null) }}
              onSaveEdit={handleUpdateArticle}
              onStartEdit={startEdit}
              onDelete={handleDeleteArticle}
              onBack={() => setMobileView('list')}
            />
          ) : (
            <div className="h-full flex items-center justify-center">
              <p className="text-xs text-white/25">
                {allArticles.length === 0
                  ? 'Add an article to get started.'
                  : 'Select an article from the list.'}
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
