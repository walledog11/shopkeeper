"use client"

import { useState } from "react"
import { Check, ChevronUp, Loader2, RefreshCw, AlertTriangle } from "lucide-react"
import { isShopifyCustomerWarning, planReplyText, planWarningTiers } from "@shopkeeper/agent/plan-preview"
import { TOOL_CATEGORIES } from "@shopkeeper/agent/tools"
import type { AgentPlan, PlanStep, RawToolCall } from "@/types"
import { formatPlanStepSentence, getPlanCollapsedPreview } from "./plan-step-display"
import { planRecipientDisplay } from "./plan-recipient-display"

const HIGH_RISK_TOOLS = new Set(["send_reply", "create_refund"])
const REPLY_TOOLS = new Set(["send_reply", "send_email"])

function highRiskUncheckMessage(tool: string): string {
  if (tool === "send_reply" || tool === "send_email") {
    return "Dropping the reply means no message goes to the customer. Continue?"
  }
  if (tool === "create_refund") {
    return "Dropping the refund step skips the refund. Continue?"
  }
  return "Dropping this step skips a customer-facing action. Continue?"
}

function warningDisplayText(warning: string, blocking: boolean): string {
  if (isShopifyCustomerWarning(warning) && !blocking) {
    return "No Shopify customer linked — check the customer panel if this reply needs order context."
  }
  return warning
}

function stepChipLabel(step: PlanStep): string {
  const text = (step.description || step.label || "").replace(/^"|"$/g, "").trim()
  return text.length > 46 ? `${text.slice(0, 45)}…` : text
}

const PLAN_CARD_CLASS =
  "w-full rounded-2xl bg-card border border-border shadow-sm overflow-hidden"

interface Props {
  plan: AgentPlan
  agentName?: string
  customerName?: string | null
  isExecuting: boolean
  isRegenerating?: boolean
  layout?: "default" | "mobile-sticky"
  onApprove: (approvedToolCalls: RawToolCall[]) => void
  onEdit?: () => void
  onFocusShopifyLink?: () => void
  onRegenerate?: () => void
}

export default function ActionPlanCard({
  plan,
  agentName = "Shopkeeper",
  customerName,
  isExecuting,
  isRegenerating,
  layout = "default",
  onApprove,
  onEdit,
  onFocusShopifyLink,
  onRegenerate,
}: Props) {
  const isMobileSticky = layout === "mobile-sticky"
  const [disabledStepIds, setDisabledStepIds] = useState(() => new Set<string>())
  const [collapsed, setCollapsed] = useState(false)
  const [compactHeader, setCompactHeader] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [warningsReviewed, setWarningsReviewed] = useState(false)

  const steps = plan.steps.map(step => ({
    ...step,
    enabled: !disabledStepIds.has(step.id),
  }))

  const toggleStep = (id: string, tool: string) => {
    const isEnabled = !disabledStepIds.has(id)
    if (isEnabled && HIGH_RISK_TOOLS.has(tool)) {
      if (!window.confirm(highRiskUncheckMessage(tool))) return
    }

    setConfirming(false)
    setWarningsReviewed(false)
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

  const replyStep = steps.find(s => REPLY_TOOLS.has(s.tool)) ?? null
  const actionSteps = steps.filter(s => !REPLY_TOOLS.has(s.tool))
  const replyText = planReplyText(plan)
  const replyEnabled = replyStep?.enabled ?? false
  const showReplyHero = Boolean(replyText && replyStep)
  const showSkipReply = showReplyHero && actionSteps.length > 0
  const showEditTakeover = Boolean(onEdit && showReplyHero && replyEnabled)

  const recipient = planRecipientDisplay(customerName)
  const { blocking: blockingWarnings, informational: informationalWarnings } = planWarningTiers(plan)
  const hasBlockingWarnings = blockingWarnings.length > 0
  const needsWarningReview = hasBlockingWarnings && !warningsReviewed

  const enabledCount = steps.filter(s => s.enabled).length
  const consequential = steps.some(s => s.enabled && TOOL_CATEGORIES[s.tool] === "action")
  const enabledActions = actionSteps.some(s => s.enabled)

  const headerLabel = showReplyHero && replyEnabled
    ? `${agentName} drafted a reply${recipient.headerTo ? ` to ${recipient.headerTo}` : ""}`
    : `${agentName} proposes`

  const inReviewFlow = needsWarningReview || confirming

  const primaryLabel = isExecuting
    ? null
    : confirming
      ? (showReplyHero && replyEnabled ? "Confirm & send" : "Confirm")
      : needsWarningReview
        ? "Review & send"
        : showReplyHero && replyEnabled
          ? (enabledActions ? "Approve & send" : "Send reply")
          : "Approve"

  const onApproveClick = () => {
    if (needsWarningReview) {
      setWarningsReviewed(true)
      return
    }
    if (consequential && !confirming) {
      setConfirming(true)
      return
    }
    handleRun()
  }

  const onCancelReview = () => {
    if (confirming) {
      setConfirming(false)
      return
    }
    if (warningsReviewed) {
      setWarningsReviewed(false)
    }
  }

  const collapsedPreview = getPlanCollapsedPreview(plan)
  const primaryNeedsCaution = needsWarningReview || confirming || (hasBlockingWarnings && !warningsReviewed) || consequential

  const handleCollapse = () => {
    setCollapsed(true)
    setCompactHeader(true)
  }

  const handleExpand = () => setCollapsed(false)

  const handleBodyTransitionEnd = (event: React.TransitionEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || event.propertyName !== "grid-template-rows") return
    if (!collapsed) setCompactHeader(false)
  }

  const draftTextClass = isMobileSticky
    ? "text-[15px] leading-relaxed text-foreground/90 whitespace-pre-wrap max-h-[32vh] overflow-y-auto custom-scrollbar"
    : "text-[15px] leading-relaxed text-foreground/90 whitespace-pre-wrap max-h-[34vh] overflow-y-auto custom-scrollbar"

  return (
    <div
      data-testid="action-plan-card"
      data-layout={isMobileSticky ? "mobile-floating" : "default"}
      className={PLAN_CARD_CLASS}
    >
      <div className="flex h-11 items-center gap-2 px-3 sm:px-4 shrink-0">
        {compactHeader && !isMobileSticky ? (
          <button
            type="button"
            onClick={handleExpand}
            className="flex min-w-0 flex-1 items-center gap-2 text-left hover:opacity-80 transition-opacity"
          >
            <span className="size-5 rounded-full bg-foreground/[0.06] flex items-center justify-center shrink-0">
              <ChevronUp className="size-3 text-foreground/55" />
            </span>
            <span className="text-xs font-semibold text-foreground/60 shrink-0">{agentName}&apos;s draft</span>
            {collapsedPreview && (
              <span className="text-xs text-foreground/45 truncate ml-auto">
                {collapsedPreview}
              </span>
            )}
          </button>
        ) : (
          <>
            <p className="flex-1 min-w-0 text-sm font-medium text-foreground/70 truncate">{headerLabel}</p>
            {onRegenerate && (
              <button type="button"
                onClick={onRegenerate}
                disabled={isExecuting || isRegenerating}
                title="Rewrite"
                className="shrink-0 p-1.5 rounded-lg text-foreground/35 hover:text-foreground/70 hover:bg-foreground/[0.05] transition-colors disabled:opacity-40"
              >
                <RefreshCw className={`size-3.5 ${isRegenerating ? "animate-spin" : ""}`} />
              </button>
            )}
            {!isMobileSticky && (
              <button type="button"
                onClick={handleCollapse}
                title="Collapse"
                className="shrink-0 p-1.5 rounded-lg text-foreground/35 hover:text-foreground/70 hover:bg-foreground/[0.05] transition-colors"
              >
                <ChevronUp className="size-4" />
              </button>
            )}
          </>
        )}
      </div>

      <div
        className="grid transition-[grid-template-rows] duration-300 ease-in-out"
        style={{ gridTemplateRows: collapsed && !isMobileSticky ? "0fr" : "1fr" }}
        onTransitionEnd={handleBodyTransitionEnd}
      >
        <div className="overflow-hidden min-h-0">
          <div
            className={`px-4 sm:px-5 pb-4 transition-opacity duration-200 ease-out ${
              (collapsed && !isMobileSticky) || (compactHeader && !isMobileSticky) ? "opacity-0" : "opacity-100"
            }`}
          >
            {(blockingWarnings.length > 0 || informationalWarnings.length > 0) && (
              <div className="mt-0.5 space-y-2">
                {blockingWarnings.map((w) => (
                  <div key={w} className="flex items-start gap-2">
                    <AlertTriangle className="size-3.5 text-red-600 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-red-600 leading-snug">{warningDisplayText(w, true)}</p>
                      {isShopifyCustomerWarning(w) && onFocusShopifyLink && (
                        <button
                          type="button"
                          onClick={onFocusShopifyLink}
                          className="mt-1 text-xs font-semibold text-red-600 hover:text-red-700 transition-colors"
                        >
                          Check customer panel →
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {informationalWarnings.map((w) => (
                  <div key={w} className="flex items-start gap-2">
                    <AlertTriangle className="size-3.5 text-red-600 shrink-0 mt-0.5" />
                    <p className="text-sm font-semibold text-red-600 leading-snug">
                      {warningDisplayText(w, false)}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {showReplyHero ? (
              <div className="mt-3 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-foreground/40">
                    To {recipient.draftTo}
                  </span>
                  {showSkipReply && replyStep && (
                    <button type="button"
                      data-testid="action-plan-step-toggle"
                      data-step-id={replyStep.id}
                      aria-pressed={replyEnabled}
                      onClick={() => toggleStep(replyStep.id, replyStep.tool)}
                      disabled={isExecuting}
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-40 ${
                        replyEnabled
                          ? "border-border bg-foreground/[0.04] text-foreground/55 hover:border-foreground/20 hover:text-foreground/75"
                          : "border-amber-600/30 bg-amber-600/[0.1] text-amber-700 hover:border-amber-600/45"
                      }`}
                    >
                      {replyEnabled ? "Skip reply" : "Include reply"}
                    </button>
                  )}
                </div>
                <div className={`rounded-2xl border px-4 py-3 ${
                  replyEnabled ? "bg-foreground/[0.04] border-border" : "border-dashed border-border opacity-50"
                }`}>
                  <p className={`${draftTextClass} ${
                    replyEnabled ? "" : "line-through opacity-50"
                  }`}>
                    {replyText}
                  </p>
                </div>
              </div>
            ) : (
              <ol className="mt-3 flex flex-col gap-1.5">
                {actionSteps.map((step) => (
                  <li key={step.id}>
                    <button type="button"
                      data-testid="action-plan-step-toggle"
                      data-step-id={step.id}
                      aria-pressed={step.enabled}
                      onClick={() => toggleStep(step.id, step.tool)}
                      disabled={isExecuting}
                      className="w-full flex items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-foreground/[0.03] transition-colors disabled:opacity-60"
                    >
                      <span className={`mt-0.5 size-4 shrink-0 rounded-md border flex items-center justify-center transition-colors ${
                        step.enabled ? "bg-foreground border-foreground text-background" : "border-border text-foreground/25"
                      }`}>
                        {isExecuting && step.enabled
                          ? <Loader2 className="size-2.5 animate-spin" />
                          : <Check className="size-3" />
                        }
                      </span>
                      <span className={`flex-1 min-w-0 text-sm leading-relaxed ${
                        step.enabled ? "text-foreground/85" : "text-foreground/30 line-through"
                      }`}>
                        {formatPlanStepSentence(step, customerName)}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}

            {showReplyHero && actionSteps.length > 0 && (
              <div className="mt-3 flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-foreground/35">Also in Shopify</span>
                <div className="flex flex-wrap gap-1.5">
                  {actionSteps.map((step) => {
                    const isAction = TOOL_CATEGORIES[step.tool] === "action"
                    return (
                      <button type="button"
                        key={step.id}
                        data-testid="action-plan-step-toggle"
                        data-step-id={step.id}
                        aria-pressed={step.enabled}
                        onClick={() => toggleStep(step.id, step.tool)}
                        disabled={isExecuting}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                          !step.enabled
                            ? "border-border text-foreground/30 line-through"
                            : isAction
                              ? "border-amber-600/25 bg-amber-600/[0.08] text-amber-700/90"
                              : "border-border bg-foreground/[0.04] text-foreground/70"
                        }`}
                      >
                        {isExecuting && step.enabled
                          ? <Loader2 className="size-3 animate-spin" />
                          : <span className={`size-1.5 rounded-full ${
                              step.enabled ? (isAction ? "bg-amber-600" : "bg-foreground/40") : "bg-foreground/20"
                            }`} />
                        }
                        {stepChipLabel(step)}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="mt-4 flex flex-col gap-2">
              <div className={`flex ${showEditTakeover ? "gap-2" : ""}`}>
                <button type="button"
                  data-testid="action-plan-run"
                  onClick={onApproveClick}
                  disabled={isExecuting || enabledCount === 0}
                  className={`${showEditTakeover ? "flex-1" : "w-full"} inline-flex items-center justify-center gap-2 py-3 rounded-2xl text-[15px] font-semibold transition-colors disabled:opacity-40 ${
                    inReviewFlow || (hasBlockingWarnings && warningsReviewed)
                      ? "bg-amber-600 hover:bg-amber-700 text-white"
                      : primaryNeedsCaution
                        ? "bg-foreground text-background hover:bg-foreground/90 ring-2 ring-amber-500/70 ring-offset-2 ring-offset-card"
                        : "bg-foreground text-background hover:bg-foreground/90"
                  }`}
                >
                  {isExecuting
                    ? <><Loader2 className="size-4 animate-spin" /> Sending…</>
                    : primaryLabel
                  }
                </button>
                {showEditTakeover && (
                  <button
                    type="button"
                    data-testid="action-plan-edit"
                    onClick={onEdit}
                    disabled={isExecuting}
                    className="flex-1 inline-flex items-center justify-center py-3 rounded-2xl text-[15px] font-semibold bg-foreground/[0.05] hover:bg-foreground/[0.08] text-foreground/70 transition-colors disabled:opacity-40"
                  >
                    Edit & send myself
                  </button>
                )}
              </div>
              {inReviewFlow && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    data-testid="action-plan-cancel"
                    onClick={onCancelReview}
                    disabled={isExecuting}
                    className="text-xs font-medium text-foreground/40 hover:text-foreground/65 transition-colors disabled:opacity-40"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
