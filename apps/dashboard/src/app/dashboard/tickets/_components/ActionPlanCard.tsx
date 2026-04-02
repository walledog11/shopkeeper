"use client"

import { useState } from "react"
import { Bot, Zap, MessageSquare, StickyNote, Check } from "lucide-react"
import type { AgentPlan, PlanStep, RawToolCall } from "@/types"

const CATEGORY_STYLES = {
  action:        { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-700' },
  communication: { bg: 'bg-blue-50',  text: 'text-blue-700',  border: 'border-blue-200',  badge: 'bg-blue-100 text-blue-700'  },
  internal:      { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200', badge: 'bg-slate-100 text-slate-600' },
  read:          { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200', badge: 'bg-slate-100 text-slate-600' },
}

const CATEGORY_ICONS = {
  action:        Zap,
  communication: MessageSquare,
  internal:      StickyNote,
  read:          StickyNote,
}

const CATEGORY_LABELS = {
  action:        'Shopify',
  communication: 'Reply',
  internal:      'Internal',
  read:          'Read',
}

interface Props {
  plan: AgentPlan
  isExecuting: boolean
  onApprove: (approvedToolCalls: RawToolCall[]) => void
  onDismiss: () => void
}

export default function ActionPlanCard({ plan, isExecuting, onApprove, onDismiss }: Props) {
  const [steps, setSteps] = useState<PlanStep[]>(plan.steps)

  const toggleStep = (id: string) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s))
  }

  const handleRun = () => {
    const enabledIds = new Set(steps.filter(s => s.enabled).map(s => s.id))
    // Always include read tool calls (no side effects); include writes only if enabled
    const approved = plan.rawToolCalls.filter(tc => {
      const isRead = !steps.find(s => s.id === tc.id) // not in visible steps = read
      return isRead || enabledIds.has(tc.id)
    })
    onApprove(approved)
  }

  const enabledCount = steps.filter(s => s.enabled).length

  return (
    <div className="flex flex-col gap-1 items-start">

      <div className="w-full bg-white border border-violet-200 rounded-md rounded-tl-sm shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-violet-100 bg-violet-50/60">
          <span className="text-[13px] font-semibold text-violet-800">Proposed plan</span>
          <span className="ml-auto text-[11px] text-violet-400 font-medium">
            {enabledCount} of {steps.length} step{steps.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Steps */}
        <div className="divide-y divide-slate-100">
          {steps.map((step) => {
            const styles = CATEGORY_STYLES[step.category]
            const Icon = CATEGORY_ICONS[step.category]
            return (
              <button
                key={step.id}
                onClick={() => toggleStep(step.id)}
                disabled={isExecuting}
                className="w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors disabled:opacity-60"
              >
                {/* Checkbox */}
                <div className={`mt-0.5 w-4 h-4 shrink-0 rounded border flex items-center justify-center transition-colors ${
                  step.enabled
                    ? 'bg-violet-600 border-violet-600'
                    : 'bg-white border-slate-300'
                }`}>
                  {step.enabled && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full inline-flex items-center gap-1 ${styles.badge}`}>
                      <Icon className="w-2.5 h-2.5" />
                      {CATEGORY_LABELS[step.category]}
                    </span>
                    <span className={`text-[13px] font-medium ${step.enabled ? 'text-slate-800' : 'text-slate-400 line-through'}`}>
                      {step.label}
                    </span>
                  </div>
                  {step.description && (
                    <p className={`text-xs mt-0.5 ${
                      step.category === 'communication'
                        ? step.enabled
                          ? 'text-slate-600 italic border-l-2 border-blue-200 pl-2 mt-1'
                          : 'text-slate-300 italic border-l-2 border-slate-200 pl-2 mt-1'
                        : step.enabled ? 'text-slate-500' : 'text-slate-300'
                    }`}>
                      {step.description}
                    </p>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 px-4 py-2 border-t border-slate-100 bg-slate-50/40">
          <button
            onClick={handleRun}
            disabled={isExecuting || enabledCount === 0}
            className="flex items-center gap-1.5 h-8 px-4 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-100 disabled:text-slate-400 text-white text-xs font-semibold rounded-md transition-colors"
          >
            {isExecuting ? 'Running…' : 'Run plan'}
          </button>
          <button
            onClick={onDismiss}
            disabled={isExecuting}
            className="h-8 px-3 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-40"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}
