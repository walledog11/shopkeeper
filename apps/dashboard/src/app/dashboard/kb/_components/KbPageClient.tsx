"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { Plus, Trash2, Pencil, Check, Loader2, ShoppingBag, BookOpen, X, Search, Library } from "lucide-react"
import { fetcher } from "@/lib/api/fetcher"
import type { KnowledgeBase, KbArticle, KbSource } from "@/types"

type SortKey = 'most_cited' | 'recent' | 'alpha'
type ArticleWithBase = KbArticle & { baseName: string; baseSource: KbSource }

export default function KbPageClient() {
  const { data, isLoading, mutate } = useSWR<{ knowledgeBases: KnowledgeBase[] }>('/api/kb', fetcher)
  const knowledgeBases = useMemo(() => data?.knowledgeBases ?? [], [data])

  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null)
  const [selectedBaseId, setSelectedBaseId] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('most_cited')

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
    if (sort === 'most_cited') {
      sorted.sort((a, b) => (b.citationCount ?? 0) - (a.citationCount ?? 0) || +new Date(b.updatedAt) - +new Date(a.updatedAt))
    } else if (sort === 'recent') {
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
  }

  const selectBase = (id: string) => {
    setSelectedBaseId(id)
    setSelectedArticleId(null)
    setIsCreatingArticle(false)
    setIsEditing(false)
  }

  const parseTags = (raw: string) => raw.split(',').map(t => t.trim()).filter(Boolean)

  // Handlers ────────────────────────────────────────────────────────────────
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
    if (!articleTargetKb) return
    if (!articleDraft.title.trim() || !articleDraft.body.trim()) return
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

  const inputCls = "w-full text-sm text-white/80 bg-white/[0.06] border border-white/[0.12] rounded-md px-3 py-2 focus:outline-none focus:border-white/[0.25] placeholder:text-white/25"

  const newArticleDisabled = !articleTargetKb || isCreatingArticle

  // Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-border shrink-0">
        <p className="text-xs text-white/35">
          {isLoading ? 'Loading…' : `${allArticles.length} article${allArticles.length !== 1 ? 's' : ''} across ${knowledgeBases.length} collection${knowledgeBases.length !== 1 ? 's' : ''}`}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCreatingKb(true)}
            className="flex items-center gap-1.5 text-xs font-medium text-white/70 bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.12] px-3 py-1.5 rounded-md transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New collection
          </button>
          <button
            onClick={() => setIsCreatingArticle(true)}
            disabled={newArticleDisabled}
            title={!articleTargetKb ? 'Select or create a custom collection first' : undefined}
            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-white/[0.10] hover:bg-white/[0.15] border border-white/[0.12] disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 rounded-md transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New article
          </button>
        </div>
      </div>

      {/* Three-pane body */}
      <div className="flex flex-1 min-h-0">
        {/* Left rail — collections */}
        <aside className="w-[220px] shrink-0 border-r border-border overflow-y-auto custom-scrollbar py-4 px-3">
          <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider px-2 mb-2">Collections</p>
          <div className="space-y-0.5">
            <CollectionRow
              icon={<Library className="w-3.5 h-3.5" />}
              label="All memory"
              count={allArticles.length}
              active={selectedBaseId === 'all'}
              onClick={() => selectBase('all')}
            />
            {shopifyKb && (
              <CollectionRow
                icon={<ShoppingBag className="w-3.5 h-3.5 text-green-400/70" />}
                label="Shopify"
                count={shopifyKb.articles.length}
                active={selectedBaseId === shopifyKb.id}
                onClick={() => selectBase(shopifyKb.id)}
              />
            )}
            {userKbs.map(kb => (
              <CollectionRow
                key={kb.id}
                icon={<BookOpen className="w-3.5 h-3.5 text-white/40" />}
                label={kb.name}
                count={kb.articles.length}
                active={selectedBaseId === kb.id}
                onClick={() => selectBase(kb.id)}
                onDelete={() => handleDeleteKb(kb.id)}
              />
            ))}
          </div>

          {isCreatingKb && (
            <div className="mt-3 px-2">
              <input
                autoFocus
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
                <button
                  onClick={() => { setIsCreatingKb(false); setNewKbName('') }}
                  className="text-[11px] text-white/40 hover:text-white/70 px-2 py-1"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateKb}
                  disabled={isCreatingKbSaving || !newKbName.trim()}
                  className="flex items-center gap-1 text-[11px] font-semibold text-white bg-white/[0.12] hover:bg-white/[0.18] disabled:opacity-40 px-2 py-1 rounded transition-colors"
                >
                  {isCreatingKbSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  Create
                </button>
              </div>
            </div>
          )}
        </aside>

        {/* Middle — article list */}
        <section className="w-[400px] shrink-0 border-r border-border flex flex-col min-h-0">
          <div className="px-4 py-3 border-b border-border space-y-2.5 shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
              <input
                placeholder="Search memory…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className={`${inputCls} pl-8`}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-white/35">
                {visibleArticles.length} {visibleArticles.length === 1 ? 'article' : 'articles'}
              </span>
              <select
                value={sort}
                onChange={e => setSort(e.target.value as SortKey)}
                className="text-[11px] text-white/60 bg-transparent border-none focus:outline-none cursor-pointer hover:text-white/80"
              >
                <option value="most_cited" className="bg-zinc-900">Sort: Most cited</option>
                <option value="recent" className="bg-zinc-900">Sort: Recently updated</option>
                <option value="alpha" className="bg-zinc-900">Sort: A–Z</option>
              </select>
            </div>
          </div>

          {isCreatingArticle && (
            <div className="px-4 py-3 border-b border-border space-y-2 shrink-0 bg-white/[0.02]">
              <p className="text-[11px] text-white/40">
                New article in <span className="text-white/70">{articleTargetKb?.name}</span>
              </p>
              <input
                autoFocus
                placeholder="Article title"
                value={articleDraft.title}
                onChange={e => setArticleDraft(d => ({ ...d, title: e.target.value }))}
                className={inputCls}
              />
              <textarea
                placeholder="Write the article content here…"
                value={articleDraft.body}
                onChange={e => setArticleDraft(d => ({ ...d, body: e.target.value }))}
                rows={5}
                className={`${inputCls} resize-none`}
              />
              <input
                placeholder="Tags (comma-separated)"
                value={articleDraft.tags}
                onChange={e => setArticleDraft(d => ({ ...d, tags: e.target.value }))}
                className={inputCls}
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setIsCreatingArticle(false); setArticleDraft({ title: '', body: '', tags: '' }) }}
                  className="text-xs text-white/40 hover:text-white/70 transition-colors px-3 py-1.5"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateArticle}
                  disabled={!articleTargetKb || isArticleSaving || !articleDraft.title.trim() || !articleDraft.body.trim()}
                  className="flex items-center gap-1.5 text-xs font-semibold text-white bg-white/[0.12] hover:bg-white/[0.18] disabled:opacity-40 px-3 py-1.5 rounded-md transition-colors"
                >
                  {isArticleSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
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

        {/* Right — detail */}
        <main className="flex-1 min-w-0 overflow-y-auto custom-scrollbar bg-background">
          {selectedArticle ? (
            <ArticleDetail
              article={selectedArticle}
              isEditing={isEditing}
              editDraft={editDraft}
              inputCls={inputCls}
              isEditSaving={isEditSaving}
              onEditDraftChange={setEditDraft}
              onCancelEdit={() => setIsEditing(false)}
              onSaveEdit={handleUpdateArticle}
              onStartEdit={startEdit}
              onDelete={handleDeleteArticle}
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

// Components ────────────────────────────────────────────────────────────────

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
    <div
      className={`group flex items-center rounded-md transition-colors ${active ? 'bg-white/[0.10]' : 'hover:bg-white/[0.05]'}`}
    >
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/70 focus-visible:ring-inset"
      >
        <span className={`shrink-0 ${active ? 'text-white/85' : 'text-white/55'}`}>{icon}</span>
        <span className={`text-xs flex-1 truncate ${active ? 'text-white font-medium' : 'text-white/80'}`}>{label}</span>
        <span className={`text-[10px] tabular-nums ${active ? 'text-white/60' : 'text-white/35'}`}>{count}</span>
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${label}`}
          className="mr-2 opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/70"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}

function ArticleCard({
  article, active, onClick,
}: {
  article: ArticleWithBase
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`block w-full text-left px-4 py-3 border-b border-border cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/70 focus-visible:ring-inset ${active ? 'bg-white/[0.06]' : 'hover:bg-white/[0.02]'}`}
    >
      <p className={`text-xs font-medium mb-1 truncate ${active ? 'text-white/90' : 'text-white/75'}`}>
        {article.title}
      </p>
      <p className="text-xs text-white/35 leading-relaxed line-clamp-2 mb-2">{article.body}</p>
      <div className="flex items-center gap-2 text-[10px] text-white/30">
        <span className="truncate">{article.baseName}</span>
        <span>·</span>
        <span className="tabular-nums">cited {article.citationCount ?? 0}×</span>
        <span className="ml-auto">{formatDate(article.updatedAt)}</span>
      </div>
    </button>
  )
}

function ArticleDetail({
  article,
  isEditing,
  editDraft,
  inputCls,
  isEditSaving,
  onEditDraftChange,
  onCancelEdit,
  onSaveEdit,
  onStartEdit,
  onDelete,
}: {
  article: ArticleWithBase
  isEditing: boolean
  editDraft: { title: string; body: string; tags: string }
  inputCls: string
  isEditSaving: boolean
  onEditDraftChange: React.Dispatch<React.SetStateAction<{ title: string; body: string; tags: string }>>
  onCancelEdit: () => void
  onSaveEdit: () => void
  onStartEdit: () => void
  onDelete: () => void
}) {
  const tags = article.tags ?? []

  if (isEditing) {
    return (
      <div className="px-8 py-6 space-y-3 max-w-3xl">
        <input
          value={editDraft.title}
          onChange={e => onEditDraftChange(d => ({ ...d, title: e.target.value }))}
          className={`${inputCls} text-lg font-semibold`}
        />
        <textarea
          value={editDraft.body}
          onChange={e => onEditDraftChange(d => ({ ...d, body: e.target.value }))}
          rows={16}
          className={`${inputCls} resize-y`}
        />
        <input
          placeholder="Tags (comma-separated)"
          value={editDraft.tags}
          onChange={e => onEditDraftChange(d => ({ ...d, tags: e.target.value }))}
          className={inputCls}
        />
        <div className="flex justify-end gap-2">
          <button onClick={onCancelEdit} className="text-xs text-white/40 hover:text-white/70 transition-colors px-3 py-1.5">
            Cancel
          </button>
          <button
            onClick={onSaveEdit}
            disabled={isEditSaving || !editDraft.title.trim() || !editDraft.body.trim()}
            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-white/[0.12] hover:bg-white/[0.18] disabled:opacity-40 px-3 py-1.5 rounded-md transition-colors"
          >
            {isEditSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Save
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="px-8 py-6 max-w-3xl">
      <p className="text-[11px] text-white/35 uppercase tracking-wide mb-2">{article.baseName}</p>
      <h1 className="text-xl font-semibold text-white/90 mb-4">{article.title}</h1>
      <div className="text-sm text-white/65 leading-relaxed whitespace-pre-wrap mb-6">
        {article.body}
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-6">
          {tags.map(tag => (
            <span key={tag} className="text-[11px] font-medium text-white/55 bg-white/[0.05] border border-white/[0.08] px-2 py-0.5 rounded-full">
              #{tag}
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-6 pt-5 border-t border-border text-[11px] text-white/40">
        <div>
          <p className="text-white/30 uppercase tracking-wide text-[10px]">Updated</p>
          <p className="text-white/60 mt-0.5">{formatDate(article.updatedAt)}</p>
        </div>
        <div>
          <p className="text-white/30 uppercase tracking-wide text-[10px]">Cited</p>
          <p className="text-white/60 mt-0.5">{article.citationCount ?? 0} times</p>
        </div>
        {article.baseSource === 'user' && (
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={onStartEdit}
              className="flex items-center gap-1.5 text-xs text-white/60 hover:text-white/90 bg-white/[0.05] hover:bg-white/[0.10] border border-white/[0.08] px-3 py-1.5 rounded transition-colors"
            >
              <Pencil className="w-3 h-3" />
              Edit
            </button>
            <button
              onClick={onDelete}
              className="flex items-center gap-1.5 text-xs text-white/60 hover:text-red-400 bg-white/[0.05] hover:bg-white/[0.10] border border-white/[0.08] px-3 py-1.5 rounded transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
