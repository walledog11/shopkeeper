"use client"

import { useState } from "react"
import { Zap, MessageSquare, StickyNote, Check, ChevronUp, Loader2 } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import type { AgentPlan, PlanStep, RawToolCall } from "@/types"

const CATEGORY_STYLES = {
  action:        { badge: 'bg-amber-100 text-amber-700' },
  communication: { badge: 'bg-blue-100 text-blue-700'  },
  internal:      { badge: 'bg-slate-100 text-slate-600' },
  read:          { badge: 'bg-slate-100 text-slate-600' },
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

// Shape morphs with a spring; opacity snaps in fast so we see the morph, not the flash
const TRANSITION = {
  layout:  { type: "spring" as const, stiffness: 420, damping: 32 },
  opacity: { duration: 0.08, ease: "linear" as const },
}

// Content inside fades in after the shape has mostly settled
const CONTENT_IN  = { duration: 0.13, delay: 0.1 }
const CONTENT_OUT = { duration: 0.07 }

interface Props {
  plan: AgentPlan
  isExecuting: boolean
  onApprove: (approvedToolCalls: RawToolCall[]) => void
  onDismiss: () => void
}

export default function ActionPlanCard({ plan, isExecuting, onApprove, onDismiss }: Props) {
  const [steps, setSteps] = useState<PlanStep[]>(plan.steps)
  const [collapsed, setCollapsed] = useState(false)

  const toggleStep = (id: string) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s))
  }

  const handleRun = () => {
    const enabledIds = new Set(steps.filter(s => s.enabled).map(s => s.id))
    const approved = plan.rawToolCalls.filter(tc => {
      const isRead = !steps.find(s => s.id === tc.id)
      return isRead || enabledIds.has(tc.id)
    })
    onApprove(approved)
  }

  const enabledCount = steps.filter(s => s.enabled).length

  return (
    <div className="w-full">
      <AnimatePresence initial={false}>
        {collapsed ? (
          /* ── Collapsed: pill bubble ── */
          <motion.button
            key="bubble"
            layoutId="plan-card"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={TRANSITION}
            onClick={() => setCollapsed(false)}
            className="w-full flex items-center gap-2 pl-3 pr-4 py-2 bg-white border border-teal-200 rounded-full shadow-md hover:shadow-lg hover:border-teal-300 transition-shadow overflow-hidden"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: CONTENT_IN }}
              exit={{ opacity: 0, transition: CONTENT_OUT }}
              className="flex items-center gap-2 w-full"
            >
              <div className="w-5 h-5 rounded-full bg-teal-700 flex items-center justify-center shrink-0">
                <ChevronUp className="w-3 h-3 text-white" />
              </div>
              <span className="text-[12px] font-semibold text-teal-800">Proposed plan</span>
              <div className="flex items-center gap-1 ml-auto">
                {steps.map(step => {
                  const Icon = CATEGORY_ICONS[step.category]
                  const styles = CATEGORY_STYLES[step.category]
                  return (
                    <span
                      key={step.id}
                      className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full inline-flex items-center gap-0.5 ${styles.badge} ${!step.enabled ? 'opacity-40' : ''}`}
                    >
                      <Icon className="w-2.5 h-2.5" />
                      {CATEGORY_LABELS[step.category]}
                    </span>
                  )
                })}
              </div>
            </motion.div>
          </motion.button>
        ) : (
          /* ── Expanded: full card ── */
          <motion.div
            key="card"
            layoutId="plan-card"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={TRANSITION}
            className="w-full bg-white border border-teal-200 rounded-xl shadow-lg overflow-hidden"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: CONTENT_IN }}
              exit={{ opacity: 0, transition: CONTENT_OUT }}
            >
              {/* Header */}
              <button
                onClick={() => setCollapsed(true)}
                className="w-full flex items-center gap-2 px-4 py-2.5 border-b border-teal-100 bg-teal-50/60 hover:bg-teal-50 transition-colors"
              >
                <span className="text-[13px] font-semibold text-teal-800">Proposed plan</span>
                <span className="ml-auto text-[11px] text-teal-500 font-medium">
                  {enabledCount} of {steps.length} step{steps.length !== 1 ? 's' : ''}
                </span>
                <ChevronUp className="w-3.5 h-3.5 text-teal-500" />
              </button>

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
                      <div className={`mt-0.5 w-4 h-4 shrink-0 rounded border flex items-center justify-center transition-colors ${
                        step.enabled ? 'bg-teal-700 border-teal-700' : 'bg-white border-slate-300'
                      }`}>
                        {isExecuting && step.enabled
                          ? <Loader2 className="w-2.5 h-2.5 text-white animate-spin" />
                          : step.enabled && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                        }
                      </div>
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
              <div className="flex items-center gap-2 px-4 py-2.5 border-t border-slate-100 bg-slate-50/40">
                <button
                  onClick={handleRun}
                  disabled={isExecuting || enabledCount === 0}
                  className="flex items-center gap-1.5 h-8 px-4 bg-teal-700 hover:bg-teal-800 disabled:bg-slate-100 disabled:text-slate-400 text-white text-xs font-semibold rounded-md transition-colors"
                >
                  {isExecuting
                    ? <><Loader2 className="w-3 h-3 animate-spin" /> Running…</>
                    : 'Run plan'
                  }
                </button>
                <button
                  onClick={onDismiss}
                  disabled={isExecuting}
                  className="h-8 px-3 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-40"
                >
                  Dismiss
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
