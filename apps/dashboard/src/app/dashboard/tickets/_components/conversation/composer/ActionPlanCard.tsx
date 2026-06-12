"use client"

import { useState } from "react"
import { ChevronUp, Loader2, RefreshCw, AlertTriangle } from "lucide-react"
import { AnimatePresence, LazyMotion, domAnimation, m } from "motion/react"
import type { AgentPlan, RawToolCall } from "@/types"
import {
  formatPlanStepSentence,
  getPlanApproveLabel,
  getPlanCollapsedPreview,
} from "./plan-step-display"

const TRANSITION = {
  layout:  { type: "spring" as const, stiffness: 420, damping: 32 },
  opacity: { duration: 0.08, ease: "linear" as const },
}

const HIGH_RISK_TOOLS = new Set(["send_reply", "create_refund"])

function highRiskUncheckMessage(tool: string): string {
  if (tool === "send_reply") {
    return "Unchecking the reply step means no message goes to the customer. Continue?"
  }
  if (tool === "create_refund") {
    return "Unchecking the refund step skips the refund. Continue?"
  }
  return "Unchecking this step skips a customer-facing action. Continue?"
}

const CONTENT_IN  = { duration: 0.13, delay: 0.1 }
const CONTENT_OUT = { duration: 0.07 }

interface Props {
  plan: AgentPlan
  agentName?: string
  customerName?: string | null
  isExecuting: boolean
  isRegenerating?: boolean
  onApprove: (approvedToolCalls: RawToolCall[]) => void
  onDismiss: () => void
  onRegenerate?: () => void
}

export default function ActionPlanCard({
  plan,
  agentName = "Shopkeeper",
  customerName,
  isExecuting,
  isRegenerating,
  onApprove,
  onDismiss,
  onRegenerate,
}: Props) {
  const [disabledStepIds, setDisabledStepIds] = useState(() => new Set<string>())
  const [collapsed, setCollapsed] = useState(false)
  const steps = plan.steps.map(step => ({
    ...step,
    enabled: !disabledStepIds.has(step.id),
  }))

  const toggleStep = (id: string, tool: string) => {
    const isEnabled = !disabledStepIds.has(id)
    if (isEnabled && HIGH_RISK_TOOLS.has(tool)) {
      if (!window.confirm(highRiskUncheckMessage(tool))) return
    }

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
  const approveLabel = getPlanApproveLabel(steps)
  const collapsedPreview = getPlanCollapsedPreview(plan)

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
              className="flex items-center gap-2 w-full min-w-0"
            >
              <div className="size-5 rounded-full bg-white/[0.12] flex items-center justify-center shrink-0">
                <ChevronUp className="size-3 text-white/60" />
              </div>
              <span className="text-[12px] font-semibold text-white/60 shrink-0">{agentName} wants to</span>
              {collapsedPreview && (
                <span className="text-[12px] text-white/45 truncate ml-auto italic">
                  {collapsedPreview}
                </span>
              )}
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
                  className="flex-1 flex items-center gap-2 text-left min-w-0"
                >
                  <span className="text-[13px] font-semibold text-white/70 truncate">
                    {agentName} wants to:
                  </span>
                  <ChevronUp className="size-3.5 text-white/35 shrink-0 ml-auto" />
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
              <ol className="divide-y divide-white/[0.06] max-h-[30vh] overflow-y-auto custom-scrollbar">
                {steps.map((step, index) => (
                  <li key={step.id}>
                    <button type="button"
                      data-testid="action-plan-step-toggle"
                      data-step-id={step.id}
                      aria-pressed={step.enabled}
                      onClick={() => toggleStep(step.id, step.tool)}
                      disabled={isExecuting}
                      className="w-full flex items-start gap-3 px-4 py-2.5 text-left hover:bg-white/[0.04] transition-colors disabled:opacity-60"
                    >
                      <span className={`mt-0.5 size-4 shrink-0 rounded border flex items-center justify-center text-[10px] font-bold transition-colors ${
                        step.enabled
                          ? 'bg-white border-white text-black'
                          : 'bg-transparent border-white/[0.20] text-white/25'
                      }`}>
                        {isExecuting && step.enabled
                          ? <Loader2 className="size-2.5 animate-spin" />
                          : index + 1
                        }
                      </span>
                      <span className={`flex-1 min-w-0 text-[13px] leading-relaxed ${
                        step.enabled ? 'text-white/80' : 'text-white/25 line-through'
                      }`}>
                        {formatPlanStepSentence(step, customerName)}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>

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
                    : approveLabel
                  }
                </button>
                <button type="button"
                  data-testid="action-plan-dismiss"
                  onClick={onDismiss}
                  disabled={isExecuting}
                  className="h-8 px-3 text-xs font-semibold text-white/50 border border-white/[0.12] rounded-md hover:text-white/70 hover:border-white/[0.20] transition-colors disabled:opacity-40"
                >
                  I&apos;ll handle this
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
