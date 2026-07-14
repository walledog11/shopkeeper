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
      <div className="flex items-center justify-between rounded-xl border border-border bg-foreground/[0.04] px-3 py-2">
        <span className="text-xs font-semibold text-strong">
          {selectedCount} selected
        </span>
        <div className="flex items-center gap-3">
          <button type="button"
            onClick={onBulkClose}
            className="rounded-full bg-foreground px-2.5 py-1 text-xs font-semibold text-background transition-colors hover:bg-foreground/90"
          >
            Close
          </button>
          <button type="button"
            onClick={onBulkArchive}
            title="Archive selected"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <Archive className="size-3.5" />
          </button>
          <button type="button"
            onClick={() => setShowTagInput(value => !value)}
            title="Tag selected"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <Tag className="size-3.5" />
          </button>
          <button type="button" onClick={onClearSelection} className="text-faint transition-colors hover:text-foreground">
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
            className="flex-1 rounded-lg border border-border bg-card px-2 py-1 text-xs text-strong placeholder:text-faint focus:border-foreground/25 focus:outline-none"
          />
          <button
            type="button"
            onClick={applyBulkTag}
            disabled={!tagInput.trim()}
            className="rounded-full bg-foreground px-2.5 py-1 text-xs font-semibold text-background transition-colors hover:bg-foreground/90 disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  )
}
