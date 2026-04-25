"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Check, ChevronDown, ChevronRight, X } from "lucide-react"

const DISMISS_KEY = 'workflowSetupBannerDismissed'
const EXPAND_KEY = 'workflowSetupBannerExpanded'

interface Step {
  label: string
  href: string
  status: "done" | "pending"
}

interface Props {
  steps: Step[]
  doneCount: number
}

export default function WorkflowSetupBanner({ steps, doneCount }: Props) {
  // Defer first paint until we've read localStorage to avoid a hydration flash.
  const [dismissed, setDismissed] = useState<boolean | null>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === 'true')
    setExpanded(localStorage.getItem(EXPAND_KEY) === 'true')
  }, [])

  const totalCount = steps.length
  if (dismissed !== false) return null
  if (doneCount >= totalCount) return null

  const remaining = totalCount - doneCount
  const summary = `${remaining} left to finish setup`

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, 'true')
    setDismissed(true)
  }

  function toggle() {
    const next = !expanded
    setExpanded(next)
    localStorage.setItem(EXPAND_KEY, next ? 'true' : 'false')
  }

  return (
    <div className="rounded-md border border-white/[0.07] bg-white/[0.02] shrink-0 overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <button
          type="button"
          onClick={toggle}
          className="flex items-center gap-3 min-w-0 flex-1 text-left"
          aria-expanded={expanded}
        >
          <div className="w-5 h-5 rounded-full border border-green-400/40 flex items-center justify-center shrink-0">
            <span className="block w-2 h-2 rounded-full bg-green-400" />
          </div>
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <span className="text-xs font-semibold text-white/80 shrink-0">
              Workflow setup · {doneCount} of {totalCount}
            </span>
            <span className="text-white/15">—</span>
            <span className="text-xs text-white/45 truncate">{summary}</span>
          </div>
          <ChevronDown
            className={`w-3.5 h-3.5 text-white/40 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="w-6 h-6 rounded flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/[0.04] transition-colors shrink-0"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {expanded && (
        <ul className="border-t border-white/[0.06] px-2 py-1.5">
          {steps.map((step) => {
            const isDone = step.status === "done"
            if (isDone) {
              return (
                <li
                  key={step.label}
                  className="flex items-center gap-3 px-2.5 py-2 rounded-md"
                >
                  <span className="w-4 h-4 rounded-full bg-green-400/15 border border-green-400/40 flex items-center justify-center shrink-0">
                    <Check className="w-2.5 h-2.5 text-green-400" />
                  </span>
                  <span className="text-xs text-white/40 line-through truncate flex-1">
                    {step.label}
                  </span>
                </li>
              )
            }
            return (
              <li key={step.label}>
                <Link
                  href={step.href}
                  className="group flex items-center gap-3 px-2.5 py-2 rounded-md hover:bg-white/[0.03] transition-colors"
                >
                  <span className="w-4 h-4 rounded-full border border-white/25 shrink-0" />
                  <span className="text-xs text-white/80 group-hover:text-white truncate flex-1">
                    {step.label}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-white/30 group-hover:text-white/60 shrink-0 transition-colors" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
