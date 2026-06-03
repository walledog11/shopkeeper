"use client"

import { X } from "lucide-react"
import { TEMPLATES, actionSummary, triggerSummary, type PlaybookTemplate } from "./playbook-helpers"

export function TemplatesModal({
  onSelect,
  onClose,
}: {
  onSelect: (template: PlaybookTemplate) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Close templates dialog" className="absolute inset-0 border-0 bg-neutral-950/60 p-0" onClick={onClose} />
      <div className="relative bg-[#0f0f0f] border border-white/[0.1] rounded-xl p-6 w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">Start from a template</h2>
          <button type="button" onClick={onClose} className="text-white/40 hover:text-white/70 transition-colors">
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-2">
          {TEMPLATES.map(template => (
            <button type="button"
              key={template.name}
              onClick={() => { onSelect(template); onClose() }}
              className="w-full text-left rounded-lg border border-white/[0.1] bg-white/[0.03] hover:bg-white/[0.06] p-4 transition-colors group"
            >
              <p className="text-sm font-medium text-white/70 group-hover:text-white/90 transition-colors mb-1">{template.name}</p>
              <p className="text-xs text-white/30">{triggerSummary(template.trigger)}</p>
              <p className="text-xs text-white/20 mt-1">{actionSummary(template.actions)}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
