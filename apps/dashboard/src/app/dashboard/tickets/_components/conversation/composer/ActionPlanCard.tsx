"use client"

import { useState } from "react"
import { Zap, MessageSquare, StickyNote, Check, ChevronUp, Loader2, RefreshCw, AlertTriangle } from "lucide-react"
import { AnimatePresence, LazyMotion, domAnimation, m } from "motion/react"
import type { AgentPlan, RawToolCall } from "@/types"
import { Badge } from "@/components/ui/badge"

const CATEGORY_STYLES = {
  action:        { badge: 'bg-amber-400/15 text-amber-400' },
  communication: { badge: 'bg-blue-400/15 text-blue-400'  },
  internal:      { badge: 'bg-white/[0.08] text-white/50' },
  read:          { badge: 'bg-white/[0.08] text-white/50' },
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

const TRANSITION = {
  layout:  { type: "spring" as const, stiffness: 420, damping: 32 },
  opacity: { duration: 0.08, ease: "linear" as const },
}

const CONTENT_IN  = { duration: 0.13, delay: 0.1 }
const CONTENT_OUT = { duration: 0.07 }

interface Props {
  plan: AgentPlan
  isExecuting: boolean
  isRegenerating?: boolean
  onApprove: (approvedToolCalls: RawToolCall[]) => void
  onDismiss: () => void
  onRegenerate?: () => void
}

export default function ActionPlanCard({ plan, isExecuting, isRegenerating, onApprove, onDismiss, onRegenerate }: Props) {
  const [disabledStepIds, setDisabledStepIds] = useState(() => new Set<string>())
  const [collapsed, setCollapsed] = useState(false)
  const steps = plan.steps.map(step => ({
    ...step,
    enabled: !disabledStepIds.has(step.id),
  }))

  const toggleStep = (id: string) => {
    setDisabledStepIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleRun = () => {
    const enabledIds = new Set(steps.flatMap(s => s.enabled ? [s.id] : []))
    const stepIds = new Set(steps.map(s => s.id))
    const approved = plan.rawToolCalls.filter(tc => {
      const isRead = !stepIds.has(tc.id)
      return isRead || enabledIds.has(tc.id)
    })
    onApprove(approved)
  }

  const enabledCount = steps.filter(s => s.enabled).length

  return (
    <LazyMotion features={domAnimation}>
    <div className="w-full">
      <AnimatePresence initial={false} mode="popLayout">
        {collapsed ? (
          <m.button
            key="bubble"
            layoutId="plan-card"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={TRANSITION}
            onClick={() => setCollapsed(false)}
            className="w-full flex items-center gap-2 pl-3 pr-4 py-2 bg-card border border-white/[0.12] rounded-full shadow-lg hover:border-white/[0.20] transition-colors overflow-hidden"
          >
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: CONTENT_IN }}
              exit={{ opacity: 0, transition: CONTENT_OUT }}
              className="flex items-center gap-2 w-full"
            >
              <div className="size-5 rounded-full bg-white/[0.12] flex items-center justify-center shrink-0">
                <ChevronUp className="size-3 text-white/60" />
              </div>
              <span className="text-[12px] font-semibold text-white/60">Proposed plan</span>
              <div className="flex items-center gap-1 ml-auto">
                {steps.map(step => {
                  const Icon = CATEGORY_ICONS[step.category]
                  const styles = CATEGORY_STYLES[step.category]
                  return (
                    <Badge
                      variant="ghost"
                      key={step.id}
                      className={`text-xs font-semibold gap-0.5 ${styles.badge} ${!step.enabled ? 'opacity-40' : ''}`}
                    >
                      <Icon className="size-2.5" />
                      {CATEGORY_LABELS[step.category]}
                    </Badge>
                  )
                })}
              </div>
            </m.div>
          </m.button>
        ) : (
          <m.div
            key="card"
            layoutId="plan-card"
            data-testid="action-plan-card"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={TRANSITION}
            className="w-full bg-card border border-white/[0.12] rounded-xl shadow-xl overflow-hidden"
          >
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: CONTENT_IN }}
              exit={{ opacity: 0, transition: CONTENT_OUT }}
            >
              {/* Header */}
              <div className="relative flex items-center px-4 py-2.5 border-b border-white/[0.08] bg-white/[0.04]">
                <button type="button"
                  onClick={() => setCollapsed(true)}
                  className="flex-1 flex items-center gap-2 text-left"
                >
                  <span className="text-[13px] font-semibold text-white/70">Proposed plan</span>
                  <span className="ml-auto text-xs text-white/35 font-medium">
                    {enabledCount} of {steps.length} step{steps.length !== 1 ? 's' : ''}
                  </span>
                  <ChevronUp className="size-3.5 text-white/35" />
                </button>
                {onRegenerate && (
                  <button type="button"
                    onClick={onRegenerate}
                    disabled={isExecuting || isRegenerating}
                    title="Regenerate plan"
                    className="ml-2 shrink-0 p-1 rounded text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-colors disabled:opacity-40"
                  >
                    <RefreshCw className={`size-3.5 ${isRegenerating ? 'animate-spin' : ''}`} />
                  </button>
                )}
              </div>

              {/* Warnings */}
              {plan.warnings && plan.warnings.length > 0 && (
                <div className="px-4 py-2.5 border-b border-white/[0.06] space-y-1.5 bg-amber-400/[0.04]">
                  {plan.warnings.map((w) => (
                    <div key={w} className="flex items-start gap-2">
                      <AlertTriangle className="size-3 text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-300/80 leading-relaxed">{w}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Steps */}
              <div className="divide-y divide-white/[0.06] max-h-[30vh] overflow-y-auto custom-scrollbar">
                {steps.map((step) => {
                  const styles = CATEGORY_STYLES[step.category]
                  const Icon = CATEGORY_ICONS[step.category]
                  return (
                    <button type="button"
                      key={step.id}
                      data-testid="action-plan-step-toggle"
                      data-step-id={step.id}
                      aria-pressed={step.enabled}
                      onClick={() => toggleStep(step.id)}
                      disabled={isExecuting}
                      className="w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-white/[0.04] transition-colors disabled:opacity-60"
                    >
                      <div className={`mt-0.5 size-4 shrink-0 rounded border flex items-center justify-center transition-colors ${
                        step.enabled ? 'bg-white border-white' : 'bg-transparent border-white/[0.20]'
                      }`}>
                        {isExecuting && step.enabled
                          ? <Loader2 className="size-2.5 text-black animate-spin" />
                          : step.enabled && <Check className="size-2.5 text-black" strokeWidth={3} />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="ghost" className={`text-xs font-semibold gap-1 ${styles.badge}`}>
                            <Icon className="size-2.5" />
                            {CATEGORY_LABELS[step.category]}
                          </Badge>
                          <span className={`text-[13px] font-medium ${step.enabled ? 'text-white/80' : 'text-white/25 line-through'}`}>
                            {step.label}
                          </span>
                        </div>
                        {step.description && (
                          <p className={`text-xs mt-0.5 ${
                            step.category === 'communication'
                              ? step.enabled
                                ? 'text-white/50 italic border-l-2 border-blue-400/30 pl-2 mt-1'
                                : 'text-white/20 italic border-l-2 border-white/[0.08] pl-2 mt-1'
                              : step.enabled ? 'text-white/60' : 'text-white/20'
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
              <div className="flex items-center gap-2 px-4 py-2.5 border-t border-white/[0.06] bg-white/[0.02]">
                <button type="button"
                  data-testid="action-plan-run"
                  onClick={handleRun}
                  disabled={isExecuting || enabledCount === 0}
                  className="flex items-center gap-1.5 h-8 px-4 bg-green-400 hover:bg-green-300 disabled:bg-white/[0.07] disabled:text-white/25 text-black text-xs font-semibold rounded-md transition-colors"
                >
                  {isExecuting
                    ? <><Loader2 className="size-3 animate-spin" /> Running…</>
                    : 'Run plan'
                  }
                </button>
                <button type="button"
                  data-testid="action-plan-dismiss"
                  onClick={onDismiss}
                  disabled={isExecuting}
                  className="h-8 px-3 text-xs font-semibold text-white/50 border border-white/[0.12] rounded-md hover:text-white/70 hover:border-white/[0.20] transition-colors disabled:opacity-40"
                >
                  Dismiss
                </button>
              </div>
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
    </LazyMotion>
  )
}
