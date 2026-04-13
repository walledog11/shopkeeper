"use client"

import { useState } from "react"
import useSWR from "swr"
import { Plus, Trash2, Pencil, Check, Loader2, ChevronDown, ChevronRight, ShoppingBag, BookOpen, X } from "lucide-react"
import { fetcher } from "@/lib/fetcher"
import type { KnowledgeBase } from "@/types"

export default function KbPageClient() {
  const { data, isLoading, mutate } = useSWR<{ knowledgeBases: KnowledgeBase[] }>('/api/kb', fetcher)
  const knowledgeBases = data?.knowledgeBases ?? []

  const shopifyKb = knowledgeBases.find(kb => kb.source === 'shopify')
  const userKbs = knowledgeBases.filter(kb => kb.source === 'user')

  // Collapsed state per KB id
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  // Collapsed state per article id (for shopify read-only)
  const [collapsedArticles, setCollapsedArticles] = useState<Record<string, boolean>>({})

  // New KB form
  const [isCreatingKb, setIsCreatingKb] = useState(false)
  const [newKbName, setNewKbName] = useState('')
  const [isCreatingKbSaving, setIsCreatingKbSaving] = useState(false)

  // New article form — keyed by KB id
  const [addingArticleFor, setAddingArticleFor] = useState<string | null>(null)
  const [articleDraft, setArticleDraft] = useState({ title: '', body: '', tags: '' })
  const [isArticleSaving, setIsArticleSaving] = useState(false)

  // Edit state
  const [editingArticleId, setEditingArticleId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState({ title: '', body: '', tags: '' })
  const [isEditSaving, setIsEditSaving] = useState(false)

  const parseTags = (raw: string) => raw.split(',').map(t => t.trim()).filter(Boolean)

  const toggleKb = (id: string) => setCollapsed(c => ({ ...c, [id]: !c[id] }))
  const toggleArticle = (id: string) => setCollapsedArticles(c => ({ ...c, [id]: !c[id] }))

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
        await mutate()
        setIsCreatingKb(false)
        setNewKbName('')
      }
    } finally {
      setIsCreatingKbSaving(false)
    }
  }

  const handleDeleteKb = async (id: string) => {
    const res = await fetch(`/api/kb/bases/${id}`, { method: 'DELETE' })
    if (res.ok) await mutate()
  }

  const handleAddArticle = async (kbId: string) => {
    if (!articleDraft.title.trim() || !articleDraft.body.trim()) return
    setIsArticleSaving(true)
    try {
      const res = await fetch(`/api/kb/bases/${kbId}/articles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: articleDraft.title, body: articleDraft.body, tags: parseTags(articleDraft.tags) }),
      })
      if (res.ok) {
        await mutate()
        setAddingArticleFor(null)
        setArticleDraft({ title: '', body: '', tags: '' })
      }
    } finally {
      setIsArticleSaving(false)
    }
  }

  const handleUpdateArticle = async (id: string) => {
    setIsEditSaving(true)
    try {
      const res = await fetch(`/api/kb/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editDraft.title, body: editDraft.body, tags: parseTags(editDraft.tags) }),
      })
      if (res.ok) {
        await mutate()
        setEditingArticleId(null)
      }
    } finally {
      setIsEditSaving(false)
    }
  }

  const handleDeleteArticle = async (id: string) => {
    const res = await fetch(`/api/kb/${id}`, { method: 'DELETE' })
    if (res.ok) await mutate()
  }

  const inputCls = "w-full text-sm text-white/70 bg-white/[0.06] border border-white/[0.12] rounded-md px-3 py-2 focus:outline-none focus:border-white/[0.25] placeholder:text-white/25"

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-border shrink-0">
        <p className="text-xs text-white/35">
          {isLoading ? 'Loading…' : `${knowledgeBases.length} knowledge base${knowledgeBases.length !== 1 ? 's' : ''}`}
        </p>
        <button
          onClick={() => setIsCreatingKb(true)}
          className="flex items-center gap-1.5 text-xs font-semibold text-white bg-white/[0.10] hover:bg-white/[0.15] border border-white/[0.12] px-3 py-1.5 rounded-md transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New Knowledge Base
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-8 py-5 space-y-3">
        {/* New KB inline form */}
        {isCreatingKb && (
          <div className="rounded-lg border border-white/[0.12] bg-white/[0.03] p-4 flex items-center gap-3">
            <input
              autoFocus
              placeholder="Knowledge base name…"
              value={newKbName}
              onChange={e => setNewKbName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateKb(); if (e.key === 'Escape') { setIsCreatingKb(false); setNewKbName('') } }}
              className={inputCls}
            />
            <button
              onClick={handleCreateKb}
              disabled={isCreatingKbSaving || !newKbName.trim()}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-white/[0.12] hover:bg-white/[0.18] disabled:opacity-40 px-3 py-2 rounded-md transition-colors shrink-0"
            >
              {isCreatingKbSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Create
            </button>
            <button onClick={() => { setIsCreatingKb(false); setNewKbName('') }} className="text-white/30 hover:text-white/60 transition-colors shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && knowledgeBases.length === 0 && !isCreatingKb && (
          <div className="flex flex-col items-center text-center py-20 gap-4">
            <div className="w-12 h-12 rounded-lg bg-white/[0.04] border border-border flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-white/20" />
            </div>
            <div>
              <p className="text-sm font-medium text-white/50 mb-1.5">No knowledge bases yet</p>
              <p className="text-xs text-white/25 max-w-xs leading-relaxed">Connect Shopify to sync your store policies, or create a custom knowledge base for your agent.</p>
            </div>
            <button
              onClick={() => setIsCreatingKb(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-white/[0.10] hover:bg-white/[0.15] border border-white/[0.12] px-3 py-1.5 rounded-md transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Create your first knowledge base
            </button>
          </div>
        )}

        {/* Shopify KB */}
        {shopifyKb && (
          <KbSection
            title="Shopify"
            icon={<ShoppingBag className="w-3.5 h-3.5 text-green-400/70" />}
            badge={`${shopifyKb.articles.length} article${shopifyKb.articles.length !== 1 ? 's' : ''}`}
            isOpen={!!collapsed[shopifyKb.id]}
            onToggle={() => toggleKb(shopifyKb.id)}
          >
            {shopifyKb.articles.length === 0 ? (
              <p className="text-xs text-white/25 px-4 py-3">No articles synced yet. Connect Shopify and run a sync.</p>
            ) : (
              shopifyKb.articles.map(a => (
                <div key={a.id} className="border-t border-white/[0.05] first:border-t-0">
                  <button
                    onClick={() => toggleArticle(a.id)}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
                  >
                    {collapsedArticles[a.id]
                      ? <ChevronDown className="w-3 h-3 text-white/25 shrink-0" />
                      : <ChevronRight className="w-3 h-3 text-white/25 shrink-0" />}
                    <span className="text-xs font-medium text-white/70">{a.title}</span>
                  </button>
                  {!!collapsedArticles[a.id] && (
                    <div className="max-h-40 overflow-y-auto custom-scrollbar px-9 pb-3">
                      <p className="text-xs text-white/35 leading-relaxed">{a.body}</p>
                    </div>
                  )}
                </div>
              ))
            )}
          </KbSection>
        )}

        {/* User KBs */}
        {userKbs.map(kb => (
          <KbSection
            key={kb.id}
            title={kb.name}
            icon={<BookOpen className="w-3.5 h-3.5 text-white/40" />}
            badge={`${kb.articles.length} article${kb.articles.length !== 1 ? 's' : ''}`}
            isOpen={!!collapsed[kb.id]}
            onToggle={() => toggleKb(kb.id)}
            actions={
              <div className="flex items-center gap-1">
                <button
                  onClick={e => { e.stopPropagation(); setAddingArticleFor(kb.id); setArticleDraft({ title: '', body: '', tags: '' }); setCollapsed(c => ({ ...c, [kb.id]: true })) }}
                  className="flex items-center gap-1 text-[10px] font-medium text-white/40 hover:text-white/70 bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] px-2 py-1 rounded transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Add article
                </button>
                <button
                  onClick={e => { e.stopPropagation(); handleDeleteKb(kb.id) }}
                  className="text-white/20 hover:text-red-400 p-1 rounded hover:bg-white/[0.06] transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            }
          >
            {/* New article form */}
            {addingArticleFor === kb.id && (
              <div className="px-4 py-3 border-t border-white/[0.05] space-y-2.5">
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
                  rows={6}
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
                    onClick={() => { setAddingArticleFor(null); setArticleDraft({ title: '', body: '', tags: '' }) }}
                    className="text-xs text-white/40 hover:text-white/70 transition-colors px-3 py-1.5"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleAddArticle(kb.id)}
                    disabled={isArticleSaving || !articleDraft.title.trim() || !articleDraft.body.trim()}
                    className="flex items-center gap-1.5 text-xs font-semibold text-white bg-white/[0.12] hover:bg-white/[0.18] disabled:opacity-40 px-3 py-1.5 rounded-md transition-colors"
                  >
                    {isArticleSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Save
                  </button>
                </div>
              </div>
            )}

            {kb.articles.length === 0 && addingArticleFor !== kb.id && (
              <p className="text-xs text-white/25 px-4 py-3 border-t border-white/[0.05]">No articles yet. Add one above.</p>
            )}

            {kb.articles.map(a => (
              <div key={a.id} className="group border-t border-white/[0.05] first:border-t-0">
                {editingArticleId === a.id ? (
                  <div className="px-4 py-3 space-y-2.5">
                    <input
                      autoFocus
                      value={editDraft.title}
                      onChange={e => setEditDraft(d => ({ ...d, title: e.target.value }))}
                      className={inputCls}
                    />
                    <textarea
                      value={editDraft.body}
                      onChange={e => setEditDraft(d => ({ ...d, body: e.target.value }))}
                      rows={6}
                      className={`${inputCls} resize-none`}
                    />
                    <input
                      placeholder="Tags (comma-separated)"
                      value={editDraft.tags}
                      onChange={e => setEditDraft(d => ({ ...d, tags: e.target.value }))}
                      className={inputCls}
                    />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setEditingArticleId(null)} className="text-xs text-white/40 hover:text-white/70 transition-colors px-3 py-1.5">
                        Cancel
                      </button>
                      <button
                        onClick={() => handleUpdateArticle(a.id)}
                        disabled={isEditSaving || !editDraft.title.trim() || !editDraft.body.trim()}
                        className="flex items-center gap-1.5 text-xs font-semibold text-white bg-white/[0.12] hover:bg-white/[0.18] disabled:opacity-40 px-3 py-1.5 rounded-md transition-colors"
                      >
                        {isEditSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 px-4 py-3 hover:bg-white/[0.025] transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white/70 mb-1">{a.title}</p>
                      <p className="text-xs text-white/35 leading-relaxed line-clamp-3">{a.body}</p>
                      {a.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {a.tags.map(tag => (
                            <span key={tag} className="text-[10px] font-medium text-white/35 bg-white/[0.04] border border-white/[0.07] px-1.5 py-0.5 rounded-full">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">
                      <button
                        onClick={() => { setEditingArticleId(a.id); setEditDraft({ title: a.title, body: a.body, tags: a.tags.join(', ') }) }}
                        className="text-white/30 hover:text-white/70 p-1.5 rounded hover:bg-white/[0.07] transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteArticle(a.id)}
                        className="text-white/30 hover:text-red-400 p-1.5 rounded hover:bg-white/[0.07] transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </KbSection>
        ))}
      </div>
    </div>
  )
}

function KbSection({
  title, icon, badge, isOpen, onToggle, actions, children,
}: {
  title: string
  icon: React.ReactNode
  badge: string
  isOpen: boolean
  onToggle: () => void
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] overflow-hidden">
      <div
        className="flex items-center gap-2.5 px-4 py-3 cursor-pointer hover:bg-white/[0.03] transition-colors select-none"
        onClick={onToggle}
      >
        {isOpen
          ? <ChevronDown className="w-3.5 h-3.5 text-white/30 shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 text-white/30 shrink-0" />}
        {icon}
        <span className="text-xs font-semibold text-white/75 flex-1">{title}</span>
        <span className="text-[10px] text-white/25 mr-2">{badge}</span>
        {actions && <div onClick={e => e.stopPropagation()}>{actions}</div>}
      </div>
      {isOpen && <div>{children}</div>}
    </div>
  )
}
