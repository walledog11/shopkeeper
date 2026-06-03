"use client"

import { Zap } from "lucide-react"
import { TEMPLATES, actionSummary, triggerSummary, type PlaybookTemplate } from "./playbook-helpers"

export function EmptyState({ onUseTemplate }: { onUseTemplate: (template: PlaybookTemplate) => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="size-10 rounded-xl bg-white/[0.06] flex items-center justify-center mb-4">
        <Zap className="size-5 text-white/30" />
      </div>
      <p className="text-sm font-medium text-white/60 mb-1">No playbooks yet</p>
      <p className="text-xs text-white/30 mb-8 max-w-xs">
        Playbooks automate repetitive actions , auto-reply to common questions, close resolved tickets, and more.
      </p>

      <p className="text-xs font-semibold text-white/30 uppercase tracking-wider mb-3">Start from a template</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-2xl">
        {TEMPLATES.map(template => (
          <button type="button"
            key={template.name}
            onClick={() => onUseTemplate(template)}
            className="text-left rounded-lg border border-white/[0.1] bg-white/[0.03] hover:bg-white/[0.06] p-4 transition-colors group"
          >
            <p className="text-sm font-medium text-white/70 group-hover:text-white/90 transition-colors mb-1">{template.name}</p>
            <p className="text-xs text-white/30">{triggerSummary(template.trigger)}</p>
            <p className="text-xs text-white/20 mt-1">{actionSummary(template.actions)}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
