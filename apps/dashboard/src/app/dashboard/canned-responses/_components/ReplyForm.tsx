"use client"

import { useState, useRef } from "react"
import { X, Eye, EyeOff, Check, Loader2 } from "lucide-react"
import { TagInput } from "./TagInput"
import type { FormState } from "./reply-form-state"

// ── Variable insertion helpers ─────────────────────────────────────────────────

const AVAILABLE_VARS = ["{{customer_name}}", "{{order_number}}", "{{store_name}}"]
const EXAMPLE_VALUES: Record<string, string> = {
  customer_name: "Sarah",
  order_number:  "#1042",
  store_name:    "Your Store",
}

function fillVars(text: string) {
  return text.replace(/{{([^}]+)}}/g, (_, k) => EXAMPLE_VALUES[k.trim()] ?? `{{${k}}}`)
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Props {
  mode: "new" | "edit"
  form: FormState
  onChange: (f: FormState) => void
  onSave: () => void
  onCancel: () => void
  isSaving: boolean
  autoFocusTitle?: boolean
}

const inputCls = "w-full text-sm text-white/70 bg-white/[0.05] border border-white/[0.12] rounded-md px-3 py-2 focus:outline-none focus:border-white/[0.25] placeholder:text-white/25 transition-colors"

export function ReplyForm({ mode, form, onChange, onSave, onCancel, isSaving }: Props) {
  const [showPreview, setShowPreview] = useState(false)
  const bodyRef  = useRef<HTMLTextAreaElement>(null)
  const caretRef = useRef<number>(0)

  const insertVar = (v: string) => {
    const pos  = caretRef.current
    const next = form.body.slice(0, pos) + v + form.body.slice(pos)
    onChange({ ...form, body: next })
    requestAnimationFrame(() => {
      if (!bodyRef.current) return
      const newPos = pos + v.length
      bodyRef.current.focus()
      bodyRef.current.setSelectionRange(newPos, newPos)
    })
  }

  return (
    <div className="rounded-xl border border-white/[0.12] bg-white/[0.03] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07]">
        <span className="text-xs font-semibold text-white/50">
          {mode === "new" ? "New saved reply" : "Edit saved reply"}
        </span>
        <button type="button" onClick={onCancel} className="text-white/25 hover:text-white/60 transition-colors">
          <X className="size-3.5" />
        </button>
      </div>

      <div className="p-4 space-y-3">
        <input
          aria-label="Reply title"
          value={form.title}
          onChange={e => onChange({ ...form, title: e.target.value })}
          placeholder="Title , e.g. Refund approved"
          className={inputCls}
        />

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white/30">Message</span>
            <button
              type="button"
              onClick={() => setShowPreview(p => !p)}
              className="flex items-center gap-1 text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              {showPreview ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
              {showPreview ? "Hide preview" : "Preview"}
            </button>
          </div>
          <textarea
            aria-label="Reply message"
            ref={bodyRef}
            value={form.body}
            onChange={e => onChange({ ...form, body: e.target.value })}
            onSelect={e => { caretRef.current = (e.target as HTMLTextAreaElement).selectionStart }}
            onBlur={e  => { caretRef.current = e.target.selectionStart }}
            placeholder="Write your reply…"
            rows={5}
            className={`${inputCls} resize-none font-mono text-[13px] leading-relaxed`}
          />
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-white/25">Variables:</span>
            {AVAILABLE_VARS.map(v => (
              <button
                key={v}
                type="button"
                onMouseDown={e => {
                  e.preventDefault()
                  caretRef.current = bodyRef.current?.selectionStart ?? form.body.length
                }}
                onClick={() => insertVar(v)}
                className="text-xs font-mono text-violet-400/70 hover:text-violet-300 bg-violet-400/10 hover:bg-violet-400/15 px-1.5 py-0.5 rounded transition-colors"
              >
                {v}
              </button>
            ))}
          </div>
          {showPreview && form.body && (
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3">
              <p className="text-xs font-semibold text-white/25 uppercase tracking-wider mb-1.5">Preview</p>
              <p className="text-xs text-white/60 whitespace-pre-wrap leading-relaxed">{fillVars(form.body)}</p>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-white/30">Tags</span>
          <TagInput tags={form.tags} onChange={v => onChange({ ...form, tags: v })} />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-white/[0.07]">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-white/40 hover:text-white/70 font-medium transition-colors px-3 py-1.5"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving || !form.title.trim() || !form.body.trim()}
          className="flex items-center gap-1.5 text-xs font-semibold text-black bg-green-400 hover:bg-green-300 disabled:opacity-40 px-4 py-1.5 rounded-md transition-colors"
        >
          {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          Save reply
        </button>
      </div>
    </div>
  )
}
