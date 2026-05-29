"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { Plus, Check, Loader2, ShoppingBag, BookOpen, X, Search, Library, ChevronDown } from "lucide-react"
import { fetcher } from "@/lib/api/fetcher"
import type { KnowledgeBase } from "@/types"
import { ArticleCard } from "./ArticleCard"
import { ArticleDetail } from "./ArticleDetail"
import { SORT_OPTIONS, inputCls, parseTags, type ArticleWithBase, type MobileView, type SortKey } from "./kb-page-utils"

export default function KbPageClient() {
  return useKbPageClientView()
}

function useKbPageClientView() {
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

  // New article
  const [isCreatingArticle, setIsCreatingArticle] = useState(false)
  const [articleDraft, setArticleDraft] = useState({ title: '', body: '', tags: '' })
  const [isArticleSaving, setIsArticleSaving] = useState(false)

  // Edit
  const [isEditing, setIsEditing] = useState(false)
  const [editDraft, setEditDraft] = useState({ title: '', body: '', tags: '' })
  const [isEditSaving, setIsEditSaving] = useState(false)

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
    setMobileView(id ? 'detail' : 'list')
  }

  const selectBase = (id: string) => {
    setSelectedBaseId(id)
    setSelectedArticleId(null)
    setIsCreatingArticle(false)
    setIsEditing(false)
    setMobileView('list')
  }

  // Handlers
  const handleCreateKb = async () => {
    if (!newKbName.trim()) return
    setIsCreatingKbSaving(true)
    try {
      const res = await fetch('/api/kb/bases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKbName.trim() }),
      })
      if (res.ok) {
        const json = await res.json()
        await mutate()
        setIsCreatingKb(false)
        setNewKbName('')
        if (json?.knowledgeBase?.id) selectBase(json.knowledgeBase.id)
      }
    } finally {
      setIsCreatingKbSaving(false)
    }
  }

  const handleDeleteKb = async (id: string) => {
    const res = await fetch(`/api/kb/bases/${id}`, { method: 'DELETE' })
    if (res.ok) {
      if (selectedBaseId === id) selectBase('all')
      else if (selectedArticle?.knowledgeBaseId === id) selectArticle(null)
      await mutate()
    }
  }

  const handleCreateArticle = async () => {
    if (!articleTargetKb || !articleDraft.title.trim() || !articleDraft.body.trim()) return
    setIsArticleSaving(true)
    try {
      const res = await fetch(`/api/kb/bases/${articleTargetKb.id}/articles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: articleDraft.title, body: articleDraft.body, tags: parseTags(articleDraft.tags) }),
      })
      if (res.ok) {
        const json = await res.json()
        await mutate()
        setIsCreatingArticle(false)
        setArticleDraft({ title: '', body: '', tags: '' })
        if (json?.article?.id) selectArticle(json.article.id)
      }
    } finally {
      setIsArticleSaving(false)
    }
  }

  const handleUpdateArticle = async () => {
    if (!selectedArticle) return
    setIsEditSaving(true)
    try {
      const res = await fetch(`/api/kb/${selectedArticle.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editDraft.title, body: editDraft.body, tags: parseTags(editDraft.tags) }),
      })
      if (res.ok) {
        await mutate()
        setIsEditing(false)
      }
    } finally {
      setIsEditSaving(false)
    }
  }

  const handleDeleteArticle = async () => {
    if (!selectedArticle) return
    const res = await fetch(`/api/kb/${selectedArticle.id}`, { method: 'DELETE' })
    if (res.ok) {
      selectArticle(null)
      await mutate()
    }
  }

  const startEdit = () => {
    if (!selectedArticle) return
    setEditDraft({ title: selectedArticle.title, body: selectedArticle.body, tags: selectedArticle.tags.join(', ') })
    setIsEditing(true)
  }
  const collectionsDropdown = useCollectionsDropdownView({
    knowledgeBases,
    selectedBaseId,
    allArticlesCount: allArticles.length,
    onSelectBase: selectBase,
    onDeleteKb: handleDeleteKb,
    isCreatingKb,
    setIsCreatingKb,
    newKbName,
    setNewKbName,
    isCreatingKbSaving,
    onCreateKb: handleCreateKb,
  })

  // Render
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-2 md:px-8 py-2 md:py-3 border-b border-border shrink-0">
        <h1 className="text-md font-semibold text-foreground">Memory</h1>
        <div className="flex items-center gap-2">
          <button type="button"
            onClick={() => setIsCreatingKb(true)}
            className="hidden md:flex items-center gap-1.5 text-xs font-medium text-white/70 bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.12] px-3 py-1.5 rounded-md transition-colors"
          >
            <Plus className="size-3.5" />
            New collection
          </button>
          <button type="button"
            onClick={() => { setIsCreatingArticle(true); setMobileView('list') }}
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
          <div className="space-y-0.5">
            <CollectionRow
              icon={<Library className="size-3.5" />}
              label="All memory"
              count={allArticles.length}
              active={selectedBaseId === 'all'}
              onClick={() => selectBase('all')}
            />
            {shopifyKb && (
              <CollectionRow
                icon={<ShoppingBag className="size-3.5 text-green-400/70" />}
                label="Shopify"
                count={shopifyKb.articles.length}
                active={selectedBaseId === shopifyKb.id}
                onClick={() => selectBase(shopifyKb.id)}
              />
            )}
            {userKbs.map(kb => (
              <div key={kb.id}>
                <CollectionRow
                  icon={<BookOpen className="size-3.5 text-white/40" />}
                  label={kb.name}
                  count={kb.articles.length}
                  active={selectedBaseId === kb.id}
                  onClick={() => selectBase(kb.id)}
                  onDelete={() => handleDeleteKb(kb.id)}
                />
              </div>
            ))}
          </div>

          {isCreatingKb && (
            <div className="mt-3 px-2">
              <input aria-label="Collection name"
                placeholder="Collection name"
                value={newKbName}
                onChange={e => setNewKbName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleCreateKb()
                  if (e.key === 'Escape') { setIsCreatingKb(false); setNewKbName('') }
                }}
                className={inputCls}
              />
              <div className="flex justify-end gap-1 mt-2">
                <button type="button"
                  onClick={() => { setIsCreatingKb(false); setNewKbName('') }}
                  className="text-xs text-white/40 hover:text-white/70 px-2 py-1"
                >
                  Cancel
                </button>
                <button type="button"
                  onClick={handleCreateKb}
                  disabled={isCreatingKbSaving || !newKbName.trim()}
                  className="flex items-center gap-1 text-xs font-semibold text-white bg-white/[0.12] hover:bg-white/[0.18] disabled:opacity-40 px-2 py-1 rounded transition-colors"
                >
                  {isCreatingKbSaving ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                  Create
                </button>
              </div>
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
              <div className="flex justify-end gap-2">
                <button type="button"
                  onClick={() => { setIsCreatingArticle(false); setArticleDraft({ title: '', body: '', tags: '' }) }}
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
              <div key={a.id}>
                <ArticleCard
                  article={a}
                  active={selectedArticleId === a.id}
                  onClick={() => selectArticle(a.id)}
                />
              </div>
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
              onEditDraftChange={setEditDraft}
              onCancelEdit={() => setIsEditing(false)}
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

// Sub-components

function CollectionRow({
  icon, label, count, active, onClick, onDelete,
}: {
  icon: React.ReactNode
  label: string
  count: number
  active: boolean
  onClick: () => void
  onDelete?: () => void
}) {
  return (
    <div className={`group flex items-center rounded-md transition-colors ${active ? 'bg-white/[0.10]' : 'hover:bg-white/[0.05]'}`}>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/70 focus-visible:ring-inset"
      >
        <span className={`shrink-0 ${active ? 'text-white/85' : 'text-white/55'}`}>{icon}</span>
        <span className={`text-xs flex-1 truncate ${active ? 'text-white font-medium' : 'text-white/80'}`}>{label}</span>
        <span className={`text-xs tabular-nums ${active ? 'text-white/60' : 'text-white/35'}`}>{count}</span>
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${label}`}
          className="flex items-center justify-center shrink-0 w-0 opacity-0 overflow-hidden text-white/30 hover:text-red-400 transition-all duration-200 group-hover:w-7 group-hover:opacity-100 focus-visible:w-7 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/70"
        >
          <X className="size-3 shrink-0" />
        </button>
      )}
    </div>
  )
}

function useCollectionsDropdownView({
  knowledgeBases,
  selectedBaseId,
  allArticlesCount,
  onSelectBase,
  onDeleteKb,
  isCreatingKb,
  setIsCreatingKb,
  newKbName,
  setNewKbName,
  isCreatingKbSaving,
  onCreateKb,
}: {
  knowledgeBases: KnowledgeBase[]
  selectedBaseId: string
  allArticlesCount: number
  onSelectBase: (id: string) => void
  onDeleteKb: (id: string) => void
  isCreatingKb: boolean
  setIsCreatingKb: (v: boolean) => void
  newKbName: string
  setNewKbName: (v: string) => void
  isCreatingKbSaving: boolean
  onCreateKb: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const userKbs = knowledgeBases.filter(kb => kb.source === 'user')
  const shopifyKb = knowledgeBases.find(kb => kb.source === 'shopify')

  const active = (() => {
    if (selectedBaseId === 'all') return { icon: <Library className="size-3.5 text-white/55" />, label: 'All memory', count: allArticlesCount }
    const kb = knowledgeBases.find(k => k.id === selectedBaseId)
    if (!kb) return { icon: <Library className="size-3.5 text-white/55" />, label: 'All memory', count: allArticlesCount }
    if (kb.source === 'shopify') return { icon: <ShoppingBag className="size-3.5 text-green-400/70" />, label: 'Shopify', count: kb.articles.length }
    return { icon: <BookOpen className="size-3.5 text-white/40" />, label: kb.name, count: kb.articles.length }
  })()

  return (
    <div ref={ref} className="md:hidden relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.10] rounded-md px-3 py-2"
      >
        <span className="shrink-0">{active.icon}</span>
        <span className="text-xs text-white/85 font-medium flex-1 truncate text-left">{active.label}</span>
        <span className="text-xs tabular-nums text-white/40">{active.count}</span>
        <ChevronDown className={`size-3.5 text-white/50 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-zinc-950 border border-white/[0.12] rounded-md shadow-lg p-2">
          <div className="space-y-0.5">
            <CollectionRow
              icon={<Library className="size-3.5" />}
              label="All memory"
              count={allArticlesCount}
              active={selectedBaseId === 'all'}
              onClick={() => onSelectBase('all')}
            />
            {shopifyKb && (
              <CollectionRow
                icon={<ShoppingBag className="size-3.5 text-green-400/70" />}
                label="Shopify"
                count={shopifyKb.articles.length}
                active={selectedBaseId === shopifyKb.id}
                onClick={() => onSelectBase(shopifyKb.id)}
              />
            )}
            {userKbs.map(kb => (
              <div key={kb.id}>
                <CollectionRow
                  icon={<BookOpen className="size-3.5 text-white/40" />}
                  label={kb.name}
                  count={kb.articles.length}
                  active={selectedBaseId === kb.id}
                  onClick={() => onSelectBase(kb.id)}
                  onDelete={() => onDeleteKb(kb.id)}
                />
              </div>
            ))}
          </div>

          <div className="mt-2 pt-2 border-t border-white/[0.08]">
            {isCreatingKb ? (
              <>
                <input aria-label="Collection name"
                  placeholder="Collection name"
                  value={newKbName}
                  onChange={e => setNewKbName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') onCreateKb()
                    if (e.key === 'Escape') { setIsCreatingKb(false); setNewKbName('') }
                  }}
                  className={inputCls}
                />
                <div className="flex justify-end gap-1 mt-2">
                  <button type="button"
                    onClick={() => { setIsCreatingKb(false); setNewKbName('') }}
                    className="text-xs text-white/40 hover:text-white/70 px-2 py-1"
                  >
                    Cancel
                  </button>
                  <button type="button"
                    onClick={onCreateKb}
                    disabled={isCreatingKbSaving || !newKbName.trim()}
                    className="flex items-center gap-1 text-xs font-semibold text-white bg-white/[0.12] hover:bg-white/[0.18] disabled:opacity-40 px-2 py-1 rounded transition-colors"
                  >
                    {isCreatingKbSaving ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                    Create
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setIsCreatingKb(true)}
                className="flex items-center gap-2 w-full px-2.5 py-1.5 text-xs text-white/70 hover:text-white hover:bg-white/[0.05] rounded transition-colors"
              >
                <Plus className="size-3.5" />
                New collection
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
