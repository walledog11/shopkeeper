"use client"

import { Pencil, Trash2 } from "lucide-react"
import type { Playbook, PlaybookAction, PlaybookTrigger } from "@/types"
import {
  ACTION_CHIP_CLS,
  generateDescription,
  triggerChipText,
} from "./playbook-helpers"

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${checked ? "bg-green-500" : "bg-white/[0.12]"}`}
      role="switch"
      aria-checked={checked}
      aria-label={checked ? "Disable playbook" : "Enable playbook"}
    >
      <span
        className={`pointer-events-none inline-block size-4 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`}
      />
    </button>
  )
}

export function PlaybookCard({
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
    <div className={`flex items-center gap-4 rounded-lg border p-4 group transition-colors ${playbook.enabled ? "border-white/[0.08] bg-white/[0.025]" : "border-white/[0.05] bg-transparent"}`}>
      <div className={`size-9 rounded-full flex items-center justify-center shrink-0 ${playbook.enabled ? "bg-orange-500/20" : "bg-white/[0.05]"}`}>
        <div className={`ml-0.5 border-y-[5px] border-y-transparent border-l-[8px] ${playbook.enabled ? "border-l-orange-400" : "border-l-white/20"}`} />
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold mb-0.5 ${playbook.enabled ? "text-white" : "text-white/50"}`}>{playbook.name}</p>
        <p className="text-xs text-white/35 mb-2">{generateDescription(trigger, actions)}</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-mono text-xs bg-white/[0.06] text-white/45 px-2 py-0.5 rounded">
            {triggerChipText(trigger)}
          </span>
          <span className="text-white/25 text-xs">→</span>
          {actions.map((action, i) => (
            <span key={`${action.type}-${action.message ?? action.note ?? action.tag ?? i + 1}`} className={`text-xs px-2 py-0.5 rounded border ${ACTION_CHIP_CLS[action.type]}`}>
              {action.type}
            </span>
          ))}
        </div>
      </div>

      <div className="text-right shrink-0">
        <p className={`text-sm font-semibold ${playbook.enabled ? "text-white" : "text-white/30"}`}>{playbook.runCount}</p>
        <p className="text-xs text-white/25">runs</p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
          <button type="button" onClick={onEdit} className="text-white/30 hover:text-white/60 transition-colors p-1">
            <Pencil className="size-3.5" />
          </button>
          <button type="button" onClick={onDelete} className="text-white/30 hover:text-red-400 transition-colors p-1">
            <Trash2 className="size-3.5" />
          </button>
        </div>
        <Toggle checked={playbook.enabled} onChange={onToggle} />
      </div>
    </div>
  )
}
