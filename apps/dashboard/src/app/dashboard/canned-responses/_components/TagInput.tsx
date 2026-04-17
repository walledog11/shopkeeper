"use client"

import { useState } from "react"
import { X } from "lucide-react"

export function TagPill({ tag, onRemove }: { tag: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-white/50 bg-white/[0.06] border border-white/[0.09] px-1.5 py-0.5 rounded-full">
      {tag}
      {onRemove && (
        <button type="button" onClick={onRemove} className="text-white/30 hover:text-white/70 transition-colors">
          <X className="w-2 h-2" />
        </button>
      )}
    </span>
  )
}

export function TagInput({ tags, onChange }: { tags: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState("")

  const commit = () => {
    const t = input.trim().replace(/,/g, "").trim()
    if (t && !tags.includes(t)) onChange([...tags, t])
    setInput("")
  }

  return (
    <div className="flex flex-wrap gap-1.5 px-2.5 py-2 bg-white/[0.05] border border-white/[0.12] rounded-md min-h-[36px] focus-within:border-white/[0.25] transition-colors cursor-text">
      {tags.map(t => <TagPill key={t} tag={t} onRemove={() => onChange(tags.filter(x => x !== t))} />)}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit() }
          if (e.key === "Backspace" && !input && tags.length > 0) onChange(tags.slice(0, -1))
        }}
        onBlur={commit}
        placeholder={tags.length === 0 ? "Add tag, press Enter…" : ""}
        className="flex-1 min-w-[120px] bg-transparent text-xs text-white/70 placeholder:text-white/25 outline-none"
      />
    </div>
  )
}
