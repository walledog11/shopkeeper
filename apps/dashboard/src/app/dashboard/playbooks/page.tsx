"use client"

import { useState, useEffect } from "react"
import useSWR from "swr"
import { Plus, X, Trash2, Pencil, ChevronDown, Loader2, Zap } from "lucide-react"
import { fetcher } from "@/lib/api/fetcher"
import type { Playbook, PlaybookTrigger, PlaybookAction, PlaybookTriggerType, PlaybookActionType } from "@/types"

// ── Constants ─────────────────────────────────────────────────────────────────

const TICKET_TAGS = ['Shipping', 'Returns', 'Order Status', 'Product Inquiry', 'General']

const TRIGGER_LABELS: Record<PlaybookTriggerType, string> = {
  new_ticket: 'A new ticket is received',
  tag_applied: 'A tag is applied',
  ticket_closed: 'A ticket is closed',
}

const ACTION_LABELS: Record<PlaybookActionType, string> = {
  send_reply: 'Send a reply',
  apply_tag: 'Apply a tag',
  close_ticket: 'Close the ticket',
  add_note: 'Add an internal note',
}

const TEMPLATES: Array<{ name: string; trigger: PlaybookTrigger; actions: PlaybookAction[] }> = [
  {
    name: 'WISMO Auto-Reply',
    trigger: { type: 'tag_applied', tag: 'Shipping' },
    actions: [
      { type: 'send_reply', message: "Hi! I can see you have a question about your shipment. Let me look into that for you right away — could you confirm your order number so I can give you the most up-to-date info?" },
    ],
  },
  {
    name: 'Returns & Refunds',
    trigger: { type: 'tag_applied', tag: 'Returns' },
    actions: [
      { type: 'send_reply', message: "Hi! Thanks for reaching out about a return. We're happy to help. Please share your order details and the reason for your return and we'll get back to you quickly." },
    ],
  },
  {
    name: 'Auto-close Resolved',
    trigger: { type: 'ticket_closed' },
    actions: [
      { type: 'send_reply', message: "Thanks for reaching out! We're glad we could help. If you have any other questions feel free to contact us anytime." },
      { type: 'add_note', note: 'Ticket auto-closed by playbook.' },
    ],
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function triggerSummary(trigger: PlaybookTrigger): string {
  if (trigger.type === 'tag_applied') return `Tag: ${trigger.tag ?? 'any'}`
  return TRIGGER_LABELS[trigger.type]
}

function actionSummary(actions: PlaybookAction[]): string {
  if (actions.length === 0) return 'No actions'
  return actions.map(a => ACTION_LABELS[a.type]).join(' · ')
}

function emptyTrigger(): PlaybookTrigger {
  return { type: 'tag_applied', tag: TICKET_TAGS[0] }
}

function emptyAction(): PlaybookAction {
  return { type: 'send_reply', message: '' }
}

// ── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${checked ? 'bg-white/70' : 'bg-white/[0.12]'}`}
      role="switch"
      aria-checked={checked}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`}
      />
    </button>
  )
}

// ── Drawer ────────────────────────────────────────────────────────────────────

interface DrawerProps {
  initial?: Playbook | null
  onClose: () => void
  onSave: () => void
}

function PlaybookDrawer({ initial, onClose, onSave }: DrawerProps) {
  const [name, setName] = useState(initial?.name ?? '')
  const [trigger, setTrigger] = useState<PlaybookTrigger>(initial?.trigger ?? emptyTrigger())
  const [actions, setActions] = useState<PlaybookAction[]>(initial?.actions ?? [emptyAction()])
  const [saving, setSaving] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const handleClose = () => {
    setVisible(false)
    setTimeout(onClose, 280)
  }

  const updateTriggerType = (type: PlaybookTriggerType) => {
    setTrigger(type === 'tag_applied' ? { type, tag: TICKET_TAGS[0] } : { type })
  }

  const updateAction = (i: number, patch: Partial<PlaybookAction>) => {
    setActions(prev => prev.map((a, idx) => idx === i ? { ...a, ...patch } as PlaybookAction : a))
  }

  const changeActionType = (i: number, type: PlaybookActionType) => {
    const base: PlaybookAction = { type }
    setActions(prev => prev.map((a, idx) => idx === i ? base : a))
  }

  const removeAction = (i: number) => setActions(prev => prev.filter((_, idx) => idx !== i))

  const isEditing = !!(initial?.id)

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      const url = isEditing ? `/api/playbooks/${initial!.id}` : '/api/playbooks'
      const method = isEditing ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, trigger, actions }),
      })
      if (res.ok) { onSave(); handleClose() }
    } finally {
      setSaving(false)
    }
  }

  const inputCls = "w-full text-sm text-white/70 bg-white/[0.06] border border-white/[0.12] rounded-md px-3 py-2 focus:outline-none focus:border-white/[0.25] placeholder:text-white/25"
  const selectCls = `${inputCls} appearance-none cursor-pointer`
  const labelCls = "text-xs font-semibold text-white/40 uppercase tracking-wider"

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ease-in-out ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleClose}
      />

      {/* Panel */}
      <div className={`fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-[#0f0f0f] border-l border-white/[0.1] flex flex-col shadow-2xl transition-transform duration-300 ease-in-out ${visible ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
          <h2 className="text-sm font-semibold text-white">{isEditing ? 'Edit Playbook' : 'New Playbook'}</h2>
          <button onClick={handleClose} className="text-white/40 hover:text-white/70 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Name */}
          <div className="space-y-1.5">
            <label className={labelCls}>Name</label>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. WISMO Auto-Reply"
              className={inputCls}
            />
          </div>

          {/* Trigger */}
          <div className="space-y-2">
            <label className={labelCls}>Trigger</label>
            <p className="text-xs text-white/30">When does this run?</p>
            <div className="relative">
              <select
                value={trigger.type}
                onChange={e => updateTriggerType(e.target.value as PlaybookTriggerType)}
                className={selectCls}
              >
                {(Object.keys(TRIGGER_LABELS) as PlaybookTriggerType[]).map(t => (
                  <option key={t} value={t}>{TRIGGER_LABELS[t]}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
            </div>

            {trigger.type === 'tag_applied' && (
              <div className="relative">
                <select
                  value={trigger.tag ?? ''}
                  onChange={e => setTrigger({ type: 'tag_applied', tag: e.target.value })}
                  className={selectCls}
                >
                  {TICKET_TAGS.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <label className={labelCls}>Actions</label>
            <p className="text-xs text-white/30">What happens when the trigger fires?</p>

            <div className="space-y-2">
              {actions.map((action, i) => (
                <div key={i} className="rounded-lg border border-white/[0.1] bg-white/[0.03] p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <select
                        value={action.type}
                        onChange={e => changeActionType(i, e.target.value as PlaybookActionType)}
                        className={selectCls}
                      >
                        {(Object.keys(ACTION_LABELS) as PlaybookActionType[]).map(t => (
                          <option key={t} value={t}>{ACTION_LABELS[t]}</option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                    </div>
                    <button
                      onClick={() => removeAction(i)}
                      className="text-white/30 hover:text-white/60 transition-colors shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {action.type === 'send_reply' && (
                    <textarea
                      value={action.message ?? ''}
                      onChange={e => updateAction(i, { message: e.target.value })}
                      placeholder="Type the reply message..."
                      rows={3}
                      className={`${inputCls} resize-none`}
                    />
                  )}

                  {action.type === 'apply_tag' && (
                    <div className="relative">
                      <select
                        value={action.tag ?? ''}
                        onChange={e => updateAction(i, { tag: e.target.value })}
                        className={selectCls}
                      >
                        <option value="">Select tag...</option>
                        {TICKET_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                    </div>
                  )}

                  {action.type === 'add_note' && (
                    <textarea
                      value={action.note ?? ''}
                      onChange={e => updateAction(i, { note: e.target.value })}
                      placeholder="Type the internal note..."
                      rows={2}
                      className={`${inputCls} resize-none`}
                    />
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={() => setActions(prev => [...prev, emptyAction()])}
              className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add action
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-white/[0.08]">
          <button
            onClick={handleClose}
            className="text-xs text-white/40 hover:text-white/70 px-3 py-1.5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="flex items-center gap-1.5 text-xs font-semibold text-black bg-white hover:bg-white/90 disabled:opacity-40 px-4 py-1.5 rounded-md transition-colors"
          >
            {saving && <Loader2 className="w-3 h-3 animate-spin" />}
            {isEditing ? 'Save changes' : 'Create playbook'}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onUseTemplate }: { onUseTemplate: (t: typeof TEMPLATES[number]) => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center mb-4">
        <Zap className="w-5 h-5 text-white/30" />
      </div>
      <p className="text-sm font-medium text-white/60 mb-1">No playbooks yet</p>
      <p className="text-xs text-white/30 mb-8 max-w-xs">
        Playbooks automate repetitive actions — auto-reply to common questions, close resolved tickets, and more.
      </p>

      <p className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-3">Start from a template</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-2xl">
        {TEMPLATES.map(t => (
          <button
            key={t.name}
            onClick={() => onUseTemplate(t)}
            className="text-left rounded-lg border border-white/[0.1] bg-white/[0.03] hover:bg-white/[0.06] p-4 transition-colors group"
          >
            <p className="text-sm font-medium text-white/70 group-hover:text-white/90 transition-colors mb-1">{t.name}</p>
            <p className="text-xs text-white/30">{triggerSummary(t.trigger)}</p>
            <p className="text-xs text-white/20 mt-1">{actionSummary(t.actions)}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Playbook card ─────────────────────────────────────────────────────────────

function PlaybookCard({
  playbook,
  onToggle,
  onEdit,
  onDelete,
}: {
  playbook: Playbook
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const trigger = playbook.trigger as PlaybookTrigger
  const actions = playbook.actions as PlaybookAction[]

  return (
    <div className={`flex items-start gap-4 rounded-lg border p-4 transition-colors ${playbook.enabled ? 'border-white/[0.1] bg-white/[0.03]' : 'border-white/[0.06] bg-transparent opacity-60'}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-medium text-white/80 truncate">{playbook.name}</p>
        </div>
        <p className="text-xs text-white/40">{triggerSummary(trigger)}</p>
        <p className="text-xs text-white/25 mt-0.5">{actionSummary(actions)}</p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Toggle checked={playbook.enabled} onChange={onToggle} />
        <button
          onClick={onEdit}
          className="text-white/30 hover:text-white/60 transition-colors p-1"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="text-white/30 hover:text-red-400 transition-colors p-1"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PlaybooksPage() {
  const { data, isLoading, mutate } = useSWR<{ playbooks: Playbook[] }>('/api/playbooks', fetcher, { revalidateOnFocus: false })
  const playbooks = data?.playbooks ?? []

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<Playbook | null>(null)
  const [templateDraft, setTemplateDraft] = useState<typeof TEMPLATES[number] | null>(null)

  const openNew = () => { setEditing(null); setTemplateDraft(null); setDrawerOpen(true) }
  const openEdit = (pb: Playbook) => { setEditing(pb); setTemplateDraft(null); setDrawerOpen(true) }
  const closeDrawer = () => { setDrawerOpen(false); setEditing(null); setTemplateDraft(null) }

  const handleUseTemplate = (t: typeof TEMPLATES[number]) => {
    setEditing(null)
    setTemplateDraft(t)
    setDrawerOpen(true)
  }

  const handleToggle = async (pb: Playbook) => {
    await fetch(`/api/playbooks/${pb.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !pb.enabled }),
    })
    mutate()
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/playbooks/${id}`, { method: 'DELETE' })
    mutate()
  }

  const active = playbooks.filter(p => p.enabled)
  const inactive = playbooks.filter(p => !p.enabled)

  return (
    <div className="p-5 sm:p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-white">Playbooks</h1>
          <p className="text-sm text-white/40">Automate repetitive support tasks with trigger-based rules.</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 text-xs font-semibold text-white bg-white/[0.10] hover:bg-white/[0.15] border border-white/[0.12] px-3 py-1.5 rounded-md transition-colors shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          New Playbook
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="h-20 rounded-lg border border-white/[0.06] bg-white/[0.02] animate-pulse" />
          ))}
        </div>
      ) : playbooks.length === 0 ? (
        <EmptyState onUseTemplate={handleUseTemplate} />
      ) : (
        <div className="space-y-5">
          {active.length > 0 && (
            <section className="space-y-2">
              <p className="text-xs font-semibold text-white/30 uppercase tracking-wider">
                Active ({active.length})
              </p>
              {active.map(pb => (
                <PlaybookCard
                  key={pb.id}
                  playbook={pb}
                  onToggle={() => handleToggle(pb)}
                  onEdit={() => openEdit(pb)}
                  onDelete={() => handleDelete(pb.id)}
                />
              ))}
            </section>
          )}

          {inactive.length > 0 && (
            <section className="space-y-2">
              <p className="text-xs font-semibold text-white/30 uppercase tracking-wider">
                Inactive ({inactive.length})
              </p>
              {inactive.map(pb => (
                <PlaybookCard
                  key={pb.id}
                  playbook={pb}
                  onToggle={() => handleToggle(pb)}
                  onEdit={() => openEdit(pb)}
                  onDelete={() => handleDelete(pb.id)}
                />
              ))}
            </section>
          )}
        </div>
      )}

      {/* Drawer */}
      {drawerOpen && (
        <PlaybookDrawer
          initial={editing ?? (templateDraft ? ({ ...templateDraft, id: '', organizationId: '', enabled: true, createdAt: '', updatedAt: '' } as Playbook) : null)}
          onClose={closeDrawer}
          onSave={() => mutate()}
        />
      )}
    </div>
  )
}
