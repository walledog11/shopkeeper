"use client"

import { useState } from "react"
import { Pencil, Copy, Trash2, TrendingUp, Clock, ChevronDown, ChevronUp, ClipboardCheck } from "lucide-react"
import { timeAgo } from "@/lib/format/date"
import { TagPill } from "./TagInput"
import type { CannedResponse } from "@/types"

function highlightVars(text: string) {
  return text.split(/({{[^}]+}})/).map((part, i) =>
    /^{{[^}]+}}$/.test(part)
      ? <mark key={i} className="bg-violet-400/15 text-violet-300 rounded px-0.5 not-italic font-mono text-[0.9em]">{part}</mark>
      : <span key={i}>{part}</span>
  )
}

interface Props {
  response: CannedResponse
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
}

export function ReplyCard({ response, onEdit, onDuplicate, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const tags = response.tags ?? []

  const handleCopy = async () => {
    await navigator.clipboard.writeText(response.body)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.11] transition-all overflow-hidden">
      <div className="flex gap-3 p-4">
        {/* Left: content */}
        <div className="flex-1 min-w-0">
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1.5 text-sm font-semibold text-white/75 hover:text-white/90 transition-colors text-left mb-2"
          >
            {expanded
              ? <ChevronUp className="w-3.5 h-3.5 shrink-0 text-white/30" />
              : <ChevronDown className="w-3.5 h-3.5 shrink-0 text-white/30" />
            }
            {response.title}
          </button>

          {expanded && (
            <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-3 mb-3 ml-5">
              <p className="text-xs text-white/60 whitespace-pre-wrap leading-relaxed">
                {highlightVars(response.body)}
              </p>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 ml-5">
            <div className="flex items-center gap-1.5 flex-wrap">
              {tags.map(t => <TagPill key={t} tag={t} />)}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {response.lastUsedAt && (
                <span className="text-[10px] text-white/35 flex items-center gap-1">
                  <Clock className="w-2.5 h-2.5" />
                  {timeAgo(response.lastUsedAt)}
                </span>
              )}
              {response.useCount > 0 && (
                <span className="text-[10px] text-white/35 flex items-center gap-1">
                  <TrendingUp className="w-2.5 h-2.5" />
                  {response.useCount}×
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: single-row actions */}
        <div className="flex items-center gap-0.5 shrink-0 self-start">
          <button
            onClick={handleCopy}
            className={`flex flex-col items-center gap-1 text-[10px] font-medium px-3 py-2 rounded-lg transition-all ${
              copied
                ? "text-green-400 bg-green-400/10"
                : "text-white/35 hover:text-white/80 hover:bg-white/[0.08]"
            }`}
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            onClick={onEdit}
            className="flex flex-col items-center gap-1 text-[10px] font-medium text-white/35 hover:text-white/80 hover:bg-white/[0.08] px-3 py-2 rounded-lg transition-all"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </button>
          <button
            onClick={onDuplicate}
            className="flex flex-col items-center gap-1 text-[10px] font-medium text-white/35 hover:text-white/80 hover:bg-white/[0.08] px-3 py-2 rounded-lg transition-all"
          >
            <Copy className="w-3.5 h-3.5" />
            Duplicate
          </button>
          <button
            onClick={onDelete}
            className="flex flex-col items-center gap-1 text-[10px] font-medium text-white/35 hover:text-red-400 hover:bg-red-400/10 px-3 py-2 rounded-lg transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}
