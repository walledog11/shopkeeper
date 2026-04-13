"use client"

import { useState } from "react"
import useSWR from "swr"
import { Plus, Trash2, Pencil, Check, Loader2, Tag, MessageSquare } from "lucide-react"
import { fetcher } from "@/lib/fetcher"
import type { CannedResponse } from "@/types"

export default function CannedResponses() {
  const { data, isLoading, mutate } = useSWR<{ responses: CannedResponse[] }>('/api/canned-responses', fetcher)
  const responses = data?.responses ?? []

  const [isAdding, setIsAdding] = useState(false)
  const [draft, setDraft] = useState({ title: '', body: '', tags: '' })
  const [isSaving, setIsSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState({ title: '', body: '', tags: '' })

  const parseTags = (raw: string) =>
    raw.split(',').map(t => t.trim()).filter(Boolean)

  const handleCreate = async () => {
    if (!draft.title.trim() || !draft.body.trim()) return
    setIsSaving(true)
    try {
      const res = await fetch('/api/canned-responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: draft.title, body: draft.body, tags: parseTags(draft.tags) }),
      })
      if (res.ok) {
        await mutate()
        setIsAdding(false)
        setDraft({ title: '', body: '', tags: '' })
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleUpdate = async (id: string) => {
    setIsSaving(true)
    try {
      const res = await fetch(`/api/canned-responses/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editDraft.title, body: editDraft.body, tags: parseTags(editDraft.tags) }),
      })
      if (res.ok) {
        await mutate()
        setEditingId(null)
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/canned-responses/${id}`, { method: 'DELETE' })
    await mutate()
  }

  const startEdit = (r: CannedResponse) => {
    setEditingId(r.id)
    setEditDraft({ title: r.title, body: r.body, tags: r.tags.join(', ') })
  }

  const inputCls = "w-full text-sm text-white/70 bg-white/[0.06] border border-white/[0.12] rounded-md px-3 py-2 focus:outline-none focus:border-white/[0.25] placeholder:text-white/25"

  return (
    <div className="bg-card rounded-md border border-border overflow-hidden">
      <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-4 sm:gap-8 p-5 sm:p-6">
        <div>
          <h2 className="text-sm font-semibold text-white/75">Canned Responses</h2>
          <p className="text-xs text-white/35 mt-1 leading-relaxed">
            Reusable reply templates. Type <span className="font-mono bg-white/[0.07] px-1 rounded">/</span> in the composer to insert one.
          </p>
        </div>
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              onClick={() => setIsAdding(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-white/[0.10] hover:bg-white/[0.15] border border-white/[0.12] px-3 py-1.5 rounded-md transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New
            </button>
          </div>

          {isAdding && (
            <div className="rounded-lg border border-white/[0.12] bg-white/[0.03] p-4 space-y-3">
              <p className="text-xs font-semibold text-white/50">New canned response</p>
              <input
                autoFocus
                placeholder="Title (e.g. Refund approved)"
                value={draft.title}
                onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                className={inputCls}
              />
              <textarea
                placeholder="Body…"
                value={draft.body}
                onChange={e => setDraft(d => ({ ...d, body: e.target.value }))}
                rows={4}
                className={`${inputCls} resize-none`}
              />
              <input
                placeholder="Tags (comma-separated, optional)"
                value={draft.tags}
                onChange={e => setDraft(d => ({ ...d, tags: e.target.value }))}
                className={inputCls}
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setIsAdding(false); setDraft({ title: '', body: '', tags: '' }) }}
                  className="text-xs text-white/40 hover:text-white/70 transition-colors px-3 py-1.5"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={isSaving || !draft.title.trim() || !draft.body.trim()}
                  className="flex items-center gap-1.5 text-xs font-semibold text-white bg-white/[0.12] hover:bg-white/[0.18] disabled:opacity-40 px-3 py-1.5 rounded-md transition-colors"
                >
                  {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Save
                </button>
              </div>
            </div>
          )}

          {isLoading && (
            <div className="text-sm text-white/30 py-2">Loading…</div>
          )}

          {!isLoading && responses.length === 0 && !isAdding && (
            <div className="flex flex-col items-center text-center py-8 gap-3">
              <div className="w-10 h-10 rounded-lg bg-white/[0.04] border border-border flex items-center justify-center">
                <MessageSquare className="w-4 h-4 text-white/20" />
              </div>
              <div>
                <p className="text-sm font-medium text-white/50 mb-1">No canned responses yet</p>
                <p className="text-xs text-white/25 max-w-xs leading-relaxed">Save reply templates and insert them with <span className="font-mono bg-white/[0.07] px-1 rounded">/</span> in the composer.</p>
              </div>
              <button
                onClick={() => setIsAdding(true)}
                className="flex items-center gap-1.5 text-xs font-semibold text-white bg-white/[0.10] hover:bg-white/[0.15] border border-white/[0.12] px-3 py-1.5 rounded-md transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Create your first response
              </button>
            </div>
          )}

          <div className="space-y-2">
            {responses.map(r => (
              <div key={r.id} className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-4">
                {editingId === r.id ? (
                  <div className="space-y-3">
                    <input
                      autoFocus
                      value={editDraft.title}
                      onChange={e => setEditDraft(d => ({ ...d, title: e.target.value }))}
                      className={inputCls}
                    />
                    <textarea
                      value={editDraft.body}
                      onChange={e => setEditDraft(d => ({ ...d, body: e.target.value }))}
                      rows={4}
                      className={`${inputCls} resize-none`}
                    />
                    <input
                      placeholder="Tags (comma-separated)"
                      value={editDraft.tags}
                      onChange={e => setEditDraft(d => ({ ...d, tags: e.target.value }))}
                      className={inputCls}
                    />
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setEditingId(null)} className="text-xs text-white/40 hover:text-white/70 transition-colors px-3 py-1.5">
                        Cancel
                      </button>
                      <button
                        onClick={() => handleUpdate(r.id)}
                        disabled={isSaving}
                        className="flex items-center gap-1.5 text-xs font-semibold text-white bg-white/[0.12] hover:bg-white/[0.18] disabled:opacity-40 px-3 py-1.5 rounded-md transition-colors"
                      >
                        {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white/80 mb-1">{r.title}</p>
                      <p className="text-xs text-white/45 whitespace-pre-wrap line-clamp-3">{r.body}</p>
                      {r.tags.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap mt-2">
                          <Tag className="w-2.5 h-2.5 text-white/20 shrink-0" />
                          {r.tags.map(tag => (
                            <span key={tag} className="text-[10px] text-white/40 bg-white/[0.06] border border-white/[0.09] px-1.5 py-0.5 rounded-full">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => startEdit(r)} className="text-white/25 hover:text-white/60 transition-colors p-1">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(r.id)} className="text-white/25 hover:text-red-400 transition-colors p-1">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
