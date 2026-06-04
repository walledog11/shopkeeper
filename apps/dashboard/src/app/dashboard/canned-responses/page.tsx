"use client"

import { useState, useMemo, useEffect, useRef } from "react"
import useSWR from "swr"
import { MessageSquare, Plus, Search, X, ArrowUpDown } from "lucide-react"
import { fetcher } from "@/lib/api/fetcher"
import { ReplyForm } from "./_components/ReplyForm"
import { emptyForm, formFrom, type FormState } from "./_components/reply-form-state"
import { ReplyCard } from "./_components/ReplyCard"
import type { CannedResponse } from "@/types"

// ── Types & constants ──────────────────────────────────────────────────────────

type SortId = "most_used" | "newest" | "az"

const SORT_OPTIONS: { id: SortId; label: string }[] = [
  { id: "most_used", label: "Most Used" },
  { id: "newest",    label: "Newest"    },
  { id: "az",        label: "A – Z"     },
]

const EMPTY_RESPONSES: CannedResponse[] = []

// ── Page ───────────────────────────────────────────────────────────────────────

function useCannedResponsesPageState() {
  const { data, isLoading, mutate } = useSWR<{ responses: CannedResponse[] }>("/api/canned-responses", fetcher)
  const responses = data?.responses ?? EMPTY_RESPONSES

  const [search, setSearch]       = useState("")
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [sort, setSort]           = useState<SortId>("most_used")
  const [sortOpen, setSortOpen]   = useState(false)
  const sortRef = useRef<HTMLDivElement>(null)

  const [isAdding, setIsAdding]       = useState(false)
  const [newForm, setNewForm]         = useState<FormState>(() => emptyForm())
  const [isSavingNew, setIsSavingNew] = useState(false)

  const [editingId, setEditingId]         = useState<string | null>(null)
  const [editForm, setEditForm]           = useState<FormState>(() => emptyForm())
  const [isSavingEdit, setIsSavingEdit]   = useState(false)

  // Close sort dropdown on outside click
  useEffect(() => {
    if (!sortOpen) return
    const h = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false)
    }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [sortOpen])

  const allTags = useMemo(() => {
    const set = new Set<string>()
    responses.forEach(r => (r.tags ?? []).forEach(t => set.add(t)))
    return Array.from(set).toSorted()
  }, [responses])

  const filtered = useMemo(() => {
    let list = [...responses]
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(r => r.title.toLowerCase().includes(q) || r.body.toLowerCase().includes(q))
    }
    if (activeTag) list = list.filter(r => (r.tags ?? []).includes(activeTag))
    if (sort === "most_used") list.sort((a, b) => b.useCount - a.useCount || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    if (sort === "newest")    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    if (sort === "az")        list.sort((a, b) => a.title.localeCompare(b.title))
    return list
  }, [responses, search, activeTag, sort])

  const handleCreate = async () => {
    if (!newForm.title.trim() || !newForm.body.trim()) return
    setIsSavingNew(true)
    try {
      const res = await fetch("/api/canned-responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newForm.title, body: newForm.body, tags: newForm.tags }),
      })
      if (res.ok) { await mutate(); setIsAdding(false); setNewForm(emptyForm()) }
    } finally { setIsSavingNew(false) }
  }

  const handleUpdate = async () => {
    if (!editingId || !editForm.title.trim() || !editForm.body.trim()) return
    setIsSavingEdit(true)
    try {
      const res = await fetch(`/api/canned-responses/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editForm.title, body: editForm.body, tags: editForm.tags }),
      })
      if (res.ok) { await mutate(); setEditingId(null) }
    } finally { setIsSavingEdit(false) }
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/canned-responses/${id}`, { method: "DELETE" })
    if (editingId === id) setEditingId(null)
    await mutate()
  }

  const handleDuplicate = async (id: string) => {
    const res = await fetch(`/api/canned-responses/${id}/duplicate`, { method: "POST" })
    if (res.ok) await mutate()
  }

  const startEdit = (r: CannedResponse) => {
    setEditingId(r.id)
    setEditForm(formFrom(r))
    setIsAdding(false)
  }

  const startNew = () => {
    setIsAdding(true)
    setNewForm(emptyForm())
    setEditingId(null)
  }

  const hasFilters = !!(search || activeTag)

  return {
    activeTag,
    allTags,
    editForm,
    editingId,
    filtered,
    handleCreate,
    handleDelete,
    handleDuplicate,
    handleUpdate,
    hasFilters,
    isAdding,
    isLoading,
    isSavingEdit,
    isSavingNew,
    newForm,
    responses,
    search,
    setActiveTag,
    setEditForm,
    setEditingId,
    setIsAdding,
    setNewForm,
    setSearch,
    setSort,
    setSortOpen,
    sort,
    sortOpen,
    sortRef,
    startEdit,
    startNew,
  }
}

export default function CannedResponsesPage() {
  const {
    activeTag,
    allTags,
    editForm,
    editingId,
    filtered,
    handleCreate,
    handleDelete,
    handleDuplicate,
    handleUpdate,
    hasFilters,
    isAdding,
    isLoading,
    isSavingEdit,
    isSavingNew,
    newForm,
    responses,
    search,
    setActiveTag,
    setEditForm,
    setEditingId,
    setIsAdding,
    setNewForm,
    setSearch,
    setSort,
    setSortOpen,
    sort,
    sortOpen,
    sortRef,
    startEdit,
    startNew,
  } = useCannedResponsesPageState()

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Page header */}
      <div className="px-5 pt-5 pb-4 border-b border-border shrink-0 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <MessageSquare className="size-4 text-white/40" />
              <h1 className="text-sm font-bold text-white/80">Saved Replies</h1>
              {!isLoading && responses.length > 0 && (
                <span className="text-xs text-white/30 font-medium tabular-nums">{responses.length}</span>
              )}
            </div>
            <p className="text-xs text-white/35">
              Reusable templates. Insert with{" "}
              <kbd className="font-mono bg-white/[0.08] border border-white/[0.10] px-1 py-px rounded text-xs text-white/50">
                /
              </kbd>{" "}
              in the composer.
            </p>
          </div>
          <button type="button"
            onClick={startNew}
            className="flex items-center gap-1.5 text-xs font-semibold text-black bg-green-400 hover:bg-green-300 px-3 py-1.5 rounded-md transition-colors shrink-0"
          >
            <Plus className="size-3.5" />
            New reply
          </button>
        </div>

        {/* Search + sort */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 flex-1 bg-white/[0.05] border border-border rounded-md px-2.5 h-8">
            <Search className="size-3.5 text-white/20 shrink-0" />
            <input
              aria-label="Search saved replies"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by title or content…"
              className="flex-1 bg-transparent text-xs text-white/70 placeholder:text-white/25 outline-none"
            />
            {search && (
              <button type="button" onClick={() => setSearch("")} className="text-white/20 hover:text-white/50 transition-colors">
                <X className="size-3" />
              </button>
            )}
          </div>

          <div className="relative" ref={sortRef}>
            <button type="button"
              onClick={() => setSortOpen(o => !o)}
              className="flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border text-xs text-white/40 hover:text-white/70 font-medium transition-colors"
            >
              <ArrowUpDown className="size-3" />
              {SORT_OPTIONS.find(s => s.id === sort)?.label}
            </button>
            {sortOpen && (
              <div className="absolute top-full right-0 mt-1 w-36 rounded-md border border-white/[0.12] bg-popover shadow-lg z-10 overflow-hidden">
                {SORT_OPTIONS.map(opt => (
                  <button type="button"
                    key={opt.id}
                    onClick={() => { setSort(opt.id); setSortOpen(false) }}
                    className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors ${
                      sort === opt.id
                        ? "text-white bg-white/[0.08]"
                        : "text-white/50 hover:bg-white/[0.05] hover:text-white/70"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Tag filters */}
        {allTags.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <button type="button"
              onClick={() => setActiveTag(null)}
              className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-all ${
                !activeTag
                  ? "bg-white/[0.10] text-white/80 border-white/[0.20]"
                  : "bg-transparent border-border text-white/35 hover:text-white/55 hover:border-white/[0.16]"
              }`}
            >
              All
            </button>
            {allTags.map(t => (
              <button type="button"
                key={t}
                onClick={() => setActiveTag(activeTag === t ? null : t)}
                className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-all ${
                  activeTag === t
                    ? "bg-white/[0.10] text-white/80 border-white/[0.20]"
                    : "bg-transparent border-border text-white/35 hover:text-white/55 hover:border-white/[0.16]"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="p-5 space-y-3">

          {isAdding && (
            <ReplyForm
              mode="new"
              form={newForm}
              onChange={setNewForm}
              onSave={handleCreate}
              onCancel={() => setIsAdding(false)}
              isSaving={isSavingNew}
            />
          )}

          {isLoading && (
            <div className="space-y-3">
              {["reply-skeleton-1", "reply-skeleton-2", "reply-skeleton-3"].map((key) => (
                <div key={key} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                  <div className="h-3.5 w-2/5 bg-white/[0.07] rounded animate-pulse mb-3" />
                  <div className="h-2.5 w-full bg-white/[0.05] rounded animate-pulse mb-1.5" />
                  <div className="h-2.5 w-3/4 bg-white/[0.04] rounded animate-pulse" />
                </div>
              ))}
            </div>
          )}

          {!isLoading && filtered.length === 0 && !isAdding && (
            <div className="flex flex-col items-center text-center py-16 gap-3">
              <div className="size-10 rounded-xl bg-white/[0.04] border border-border flex items-center justify-center">
                <MessageSquare className="size-4 text-white/20" />
              </div>
              {hasFilters ? (
                <>
                  <p className="text-sm font-medium text-white/40">No results</p>
                  <button type="button"
                    onClick={() => { setSearch(""); setActiveTag(null) }}
                    className="text-xs text-white/30 hover:text-white/60 transition-colors"
                  >
                    Clear filters
                  </button>
                </>
              ) : (
                <>
                  <div>
                    <p className="text-sm font-semibold text-white/40 mb-1">No saved replies yet</p>
                    <p className="text-xs text-white/25 max-w-[260px] leading-relaxed">
                      Save reply templates and insert them with{" "}
                      <kbd className="font-mono bg-white/[0.07] border border-white/[0.10] px-1 py-px rounded text-xs">/</kbd>{" "}
                      in the composer.
                    </p>
                  </div>
                  <button type="button"
                    onClick={startNew}
                    className="flex items-center gap-1.5 text-xs font-semibold text-black bg-green-400 hover:bg-green-300 px-3 py-1.5 rounded-md transition-colors"
                  >
                    <Plus className="size-3.5" />
                    Create your first reply
                  </button>
                </>
              )}
            </div>
          )}

          {!isLoading && filtered.map(r =>
            editingId === r.id ? (
              <ReplyForm
                key={r.id}
                mode="edit"
                form={editForm}
                onChange={setEditForm}
                onSave={handleUpdate}
                onCancel={() => setEditingId(null)}
                isSaving={isSavingEdit}
                autoFocusTitle={false}
              />
            ) : (
              <ReplyCard
                key={r.id}
                response={r}
                onEdit={() => startEdit(r)}
                onDuplicate={() => handleDuplicate(r.id)}
                onDelete={() => handleDelete(r.id)}
              />
            )
          )}
        </div>
      </div>
    </div>
  )
}
