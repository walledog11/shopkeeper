"use client"

import { useEffect, useRef, useState } from "react"
import { Plus, Check, Loader2, ShoppingBag, BookOpen, X, Library, ChevronDown } from "lucide-react"
import type { KnowledgeBase } from "@/types"
import { inputCls } from "./kb-page-utils"

// ── New-KB form (shared by desktop sidebar and mobile dropdown) ────────────────

export function NewKbForm({
  name,
  onNameChange,
  onSubmit,
  onCancel,
  isSaving,
  error,
}: {
  name: string
  onNameChange: (v: string) => void
  onSubmit: () => void
  onCancel: () => void
  isSaving: boolean
  error: string | null
}) {
  return (
    <>
      <input aria-label="Folder name"
        placeholder="Folder name"
        value={name}
        onChange={e => onNameChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') onSubmit()
          if (e.key === 'Escape') onCancel()
        }}
        className={inputCls}
      />
      {error && (
        <p className="mt-2 text-xs text-red-400" aria-live="polite">{error}</p>
      )}
      <div className="flex justify-end gap-1 mt-2">
        <button type="button" onClick={onCancel}
          className="text-xs text-white/40 hover:text-white/70 px-2 py-1"
        >
          Cancel
        </button>
        <button type="button" onClick={onSubmit}
          disabled={isSaving || !name.trim()}
          className="flex items-center gap-1 text-xs font-semibold text-white bg-white/[0.12] hover:bg-white/[0.18] disabled:opacity-40 px-2 py-1 rounded transition-colors"
        >
          {isSaving ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
          Create
        </button>
      </div>
    </>
  )
}

// ── Single collection row ──────────────────────────────────────────────────────

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

// ── Ordered list of All / Shopify / user KB rows ───────────────────────────────

export function CollectionList({
  knowledgeBases,
  allArticlesCount,
  selectedBaseId,
  onSelectBase,
  onDeleteKb,
}: {
  knowledgeBases: KnowledgeBase[]
  allArticlesCount: number
  selectedBaseId: string
  onSelectBase: (id: string) => void
  onDeleteKb?: (id: string) => void
}) {
  const shopifyKb = knowledgeBases.find(kb => kb.source === 'shopify')
  const userKbs = knowledgeBases.filter(kb => kb.source === 'user')
  return (
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
        <CollectionRow
          key={kb.id}
          icon={<BookOpen className="size-3.5 text-white/40" />}
          label={kb.name}
          count={kb.articles.length}
          active={selectedBaseId === kb.id}
          onClick={() => onSelectBase(kb.id)}
          onDelete={onDeleteKb ? () => onDeleteKb(kb.id) : undefined}
        />
      ))}
    </div>
  )
}

// ── Mobile dropdown (wraps CollectionList + new-KB form) ──────────────────────

export function CollectionsDropdown({
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
  actionError,
  onClearActionError,
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
  actionError: string | null
  onClearActionError: () => void
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
          <CollectionList
            knowledgeBases={knowledgeBases}
            allArticlesCount={allArticlesCount}
            selectedBaseId={selectedBaseId}
            onSelectBase={onSelectBase}
            onDeleteKb={onDeleteKb}
          />
          <div className="mt-2 pt-2 border-t border-white/[0.08]">
            {isCreatingKb ? (
              <NewKbForm
                name={newKbName}
                onNameChange={setNewKbName}
                onSubmit={onCreateKb}
                onCancel={() => { setIsCreatingKb(false); setNewKbName(''); onClearActionError() }}
                isSaving={isCreatingKbSaving}
                error={actionError}
              />
            ) : (
              <button
                type="button"
                onClick={() => { setIsCreatingKb(true); onClearActionError() }}
                className="flex items-center gap-2 w-full px-2.5 py-1.5 text-xs text-white/70 hover:text-white hover:bg-white/[0.05] rounded transition-colors"
              >
                <Plus className="size-3.5" />
                New folder
              </button>
            )}
            {!isCreatingKb && actionError && (
              <p className="mt-2 px-2 text-xs text-red-400" aria-live="polite">{actionError}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
