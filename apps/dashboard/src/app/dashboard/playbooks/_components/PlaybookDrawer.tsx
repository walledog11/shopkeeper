"use client"

import { useEffect, useState } from "react"
import { ChevronDown, Loader2, Plus, X } from "lucide-react"
import type { Playbook, PlaybookAction, PlaybookActionType, PlaybookTrigger, PlaybookTriggerType } from "@/types"
import { errorMessageFromUnknown } from "@/lib/api/fetcher"
import {
  ACTION_LABELS,
  TICKET_TAGS,
  TRIGGER_LABELS,
  emptyAction,
  emptyTrigger,
} from "./playbook-helpers"
import { savePlaybook } from "./playbook-requests"

interface PlaybookDrawerProps {
  initial?: Playbook | null
  onClose: () => void
  onSave: (playbook: Playbook) => Promise<unknown> | unknown
}

export function PlaybookDrawer({ initial, onClose, onSave }: PlaybookDrawerProps) {
  const [name, setName] = useState(initial?.name ?? "")
  const [trigger, setTrigger] = useState<PlaybookTrigger>(initial?.trigger ?? emptyTrigger())
  const [actions, setActions] = useState<PlaybookAction[]>(initial?.actions ?? [emptyAction()])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
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
    setTrigger(type === "tag_applied" ? { type, tag: TICKET_TAGS[0] } : { type })
  }

  const updateAction = (i: number, patch: Partial<PlaybookAction>) => {
    setActions(prev => prev.map((action, idx) => idx === i ? { ...action, ...patch } as PlaybookAction : action))
  }

  const changeActionType = (i: number, type: PlaybookActionType) => {
    const base: PlaybookAction = { type }
    setActions(prev => prev.map((action, idx) => idx === i ? base : action))
  }

  const removeAction = (i: number) => setActions(prev => prev.filter((_, idx) => idx !== i))
  const isEditing = !!initial?.id

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    setSaveError(null)
    try {
      const playbook = await savePlaybook(isEditing ? initial!.id : null, { name, trigger, actions })
      await onSave(playbook)
      handleClose()
    } catch (error) {
      setSaveError(errorMessageFromUnknown(error, isEditing
        ? "Failed to update playbook."
        : "Failed to create playbook."))
    } finally {
      setSaving(false)
    }
  }

  const inputCls = "w-full text-sm text-white/70 bg-white/[0.06] border border-white/[0.12] rounded-md px-3 py-2 focus:outline-none focus:border-white/[0.25] placeholder:text-white/25"
  const selectCls = `${inputCls} appearance-none cursor-pointer`
  const labelCls = "text-xs font-semibold text-white/40 uppercase tracking-wider"

  return (
    <>
      <button
        type="button"
        aria-label="Close playbook editor"
        className={`fixed inset-0 z-40 bg-neutral-950/40 transition-opacity duration-300 ease-in-out ${visible ? "opacity-100" : "opacity-0"}`}
        onClick={handleClose}
      />
      <div className={`fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-[#0f0f0f] border-l border-white/[0.1] flex flex-col shadow-2xl transition-transform duration-300 ease-in-out ${visible ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
          <h2 className="text-sm font-semibold text-white">{isEditing ? "Edit Playbook" : "New Playbook"}</h2>
          <button type="button" onClick={handleClose} className="text-white/40 hover:text-white/70 transition-colors">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <div className="space-y-1.5">
            <span className={labelCls}>Name</span>
            <input
              aria-label="Playbook name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. WISMO Auto-Reply"
              className={inputCls}
            />
          </div>

          <div className="space-y-2">
            <span className={labelCls}>Trigger</span>
            <p className="text-xs text-white/30">When does this run?</p>
            <div className="relative">
              <select
                aria-label="Playbook trigger"
                value={trigger.type}
                onChange={e => updateTriggerType(e.target.value as PlaybookTriggerType)}
                className={selectCls}
              >
                {(Object.keys(TRIGGER_LABELS) as PlaybookTriggerType[]).map(type => (
                  <option key={type} value={type}>{TRIGGER_LABELS[type]}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 text-white/30" />
            </div>

            {trigger.type === "tag_applied" && (
              <div className="relative">
                <select
                  aria-label="Trigger tag"
                  value={trigger.tag ?? ""}
                  onChange={e => setTrigger({ type: "tag_applied", tag: e.target.value })}
                  className={selectCls}
                >
                  {TICKET_TAGS.map(tag => (
                    <option key={tag} value={tag}>{tag}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 text-white/30" />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <span className={labelCls}>Actions</span>
            <p className="text-xs text-white/30">What happens when the trigger fires?</p>

            <div className="space-y-2">
              {actions.map((action, i) => (
                <div key={`${action.type}-${action.message ?? action.note ?? action.tag ?? i + 1}`} className="rounded-lg border border-white/[0.1] bg-white/[0.03] p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <select
                        aria-label={`Action ${i + 1} type`}
                        value={action.type}
                        onChange={e => changeActionType(i, e.target.value as PlaybookActionType)}
                        className={selectCls}
                      >
                        {(Object.keys(ACTION_LABELS) as PlaybookActionType[]).map(type => (
                          <option key={type} value={type}>{ACTION_LABELS[type]}</option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 text-white/30" />
                    </div>
                    <button type="button"
                      onClick={() => removeAction(i)}
                      className="text-white/30 hover:text-white/60 transition-colors shrink-0"
                    >
                      <X className="size-4" />
                    </button>
                  </div>

                  {action.type === "send_reply" && (
                    <textarea
                      aria-label={`Action ${i + 1} reply message`}
                      value={action.message ?? ""}
                      onChange={e => updateAction(i, { message: e.target.value })}
                      placeholder="Type the reply message…"
                      rows={3}
                      className={`${inputCls} resize-none`}
                    />
                  )}

                  {action.type === "apply_tag" && (
                    <div className="relative">
                      <select
                        aria-label={`Action ${i + 1} tag`}
                        value={action.tag ?? ""}
                        onChange={e => updateAction(i, { tag: e.target.value })}
                        className={selectCls}
                      >
                        <option value="">Select tag…</option>
                        {TICKET_TAGS.map(tag => <option key={tag} value={tag}>{tag}</option>)}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 text-white/30" />
                    </div>
                  )}

                  {action.type === "add_note" && (
                    <textarea
                      aria-label={`Action ${i + 1} internal note`}
                      value={action.note ?? ""}
                      onChange={e => updateAction(i, { note: e.target.value })}
                      placeholder="Type the internal note…"
                      rows={2}
                      className={`${inputCls} resize-none`}
                    />
                  )}
                </div>
              ))}
            </div>

            <button type="button"
              onClick={() => setActions(prev => [...prev, emptyAction()])}
              className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors"
            >
              <Plus className="size-3.5" />
              Add action
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-white/[0.08]">
          {saveError && (
            <p className="mr-auto text-xs text-red-400" aria-live="polite">{saveError}</p>
          )}
          <button type="button"
            onClick={handleClose}
            className="text-xs text-white/40 hover:text-white/70 px-3 py-1.5 transition-colors"
          >
            Cancel
          </button>
          <button type="button"
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="flex items-center gap-1.5 text-xs font-semibold text-black bg-white hover:bg-white/90 disabled:opacity-40 px-4 py-1.5 rounded-md transition-colors"
          >
            {saving && <Loader2 className="size-3 animate-spin" />}
            {isEditing ? "Save changes" : "Create playbook"}
          </button>
        </div>
      </div>
    </>
  )
}
