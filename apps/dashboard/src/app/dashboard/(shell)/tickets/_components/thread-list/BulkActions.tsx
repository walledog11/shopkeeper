"use client"

import { useState } from "react"
import { Archive, Tag, X } from "lucide-react"

interface BulkActionsProps {
  selectedCount: number
  onBulkArchive: () => void
  onBulkClose: () => void
  onBulkTag: (tag: string) => void
  onClearSelection: () => void
}

export function BulkActions({
  selectedCount,
  onBulkArchive,
  onBulkClose,
  onBulkTag,
  onClearSelection,
}: BulkActionsProps) {
  const [tagInput, setTagInput] = useState("")
  const [showTagInput, setShowTagInput] = useState(false)
  const applyBulkTag = () => {
    const tag = tagInput.trim()
    if (!tag) return
    onBulkTag(tag)
    setTagInput("")
    setShowTagInput(false)
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between bg-foreground/[0.10] border border-foreground/[0.12] rounded-md px-3 py-2">
        <span className="text-xs font-semibold text-strong">
          {selectedCount} selected
        </span>
        <div className="flex items-center gap-2">
          <button type="button"
            onClick={onBulkClose}
            className="text-xs font-semibold text-white bg-foreground/[0.15] hover:bg-foreground/[0.22] px-2.5 py-1 rounded transition-colors"
          >
            Close
          </button>
          <button type="button"
            onClick={onBulkArchive}
            title="Archive selected"
            className="text-muted-foreground hover:text-white transition-colors"
          >
            <Archive className="size-3.5" />
          </button>
          <button type="button"
            onClick={() => setShowTagInput(value => !value)}
            title="Tag selected"
            className="text-muted-foreground hover:text-white transition-colors"
          >
            <Tag className="size-3.5" />
          </button>
          <button type="button" onClick={onClearSelection} className="text-faint hover:text-white transition-colors">
            <X className="size-3.5" />
          </button>
        </div>
      </div>
      {showTagInput && (
        <div
          className="flex items-center gap-1.5"
        >
          <input
            aria-label="Bulk tag name"
            value={tagInput}
            onChange={event => setTagInput(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter") applyBulkTag()
            }}
            placeholder="Tag name…"
            className="flex-1 text-xs text-strong bg-foreground/[0.06] border border-foreground/[0.12] rounded px-2 py-1 focus:outline-none focus:border-foreground/[0.25] placeholder:text-faint"
          />
          <button
            type="button"
            onClick={applyBulkTag}
            disabled={!tagInput.trim()}
            className="text-xs font-semibold text-white bg-foreground/[0.15] hover:bg-foreground/[0.22] disabled:opacity-40 px-2.5 py-1 rounded transition-colors"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  )
}
