"use client"

import { useReducer, useRef } from "react"
import { planReplyText, planWarningTiers } from "@shopkeeper/agent/plan-preview"
import { TOOL_CATEGORIES } from "@shopkeeper/agent/tools"
import type { AgentPlan, PlanExecutionOutcome, RawToolCall } from "@/types"
import { getPlanCollapsedPreview } from "./plan-step-display"
import { planRecipientDisplay } from "./plan-recipient-display"

const HIGH_RISK_TOOLS = new Set(["create_refund"])
const REPLY_TOOLS = new Set(["send_reply", "send_email"])

function highRiskUncheckMessage(tool: string): string {
  if (tool === "create_refund") {
    return "Dropping the refund step skips the refund. Continue?"
  }
  return "Dropping this step skips a customer-facing action. Continue?"
}

interface ActionPlanReviewState {
  disabledStepIds: Set<string>
  collapsed: boolean
  compactHeader: boolean
  confirming: boolean
  warningsReviewed: boolean
  submitting: boolean
}

type ActionPlanReviewAction =
  | { type: "toggleStep"; id: string }
  | { type: "setConfirming"; value: boolean }
  | { type: "setWarningsReviewed"; value: boolean }
  | { type: "submit" }
  | { type: "collapse" }
  | { type: "expand" }
  | { type: "bodyExpanded" }

function reducer(
  state: ActionPlanReviewState,
  action: ActionPlanReviewAction,
): ActionPlanReviewState {
  switch (action.type) {
    case "toggleStep": {
      const disabledStepIds = new Set(state.disabledStepIds)
      if (disabledStepIds.has(action.id)) disabledStepIds.delete(action.id)
      else disabledStepIds.add(action.id)
      return {
        ...state,
        disabledStepIds,
        confirming: false,
        warningsReviewed: false,
      }
    }
    case "setConfirming":
      return { ...state, confirming: action.value }
    case "setWarningsReviewed":
      return { ...state, warningsReviewed: action.value }
    case "submit":
      return { ...state, submitting: true }
    case "collapse":
      return { ...state, collapsed: true, compactHeader: true }
    case "expand":
      return { ...state, collapsed: false }
    case "bodyExpanded":
      return state.collapsed ? state : { ...state, compactHeader: false }
  }
}

export function useActionPlanReviewState({
  agentName,
  customerName,
  executionOutcome,
  isExecuting,
  onApprove,
  plan,
}: {
  agentName: string
  customerName?: string | null
  executionOutcome: PlanExecutionOutcome | null
  isExecuting: boolean
  onApprove: (approvedToolCalls: RawToolCall[]) => Promise<void>
  plan: AgentPlan
}) {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    disabledStepIds: new Set<string>(),
    collapsed: false,
    compactHeader: false,
    confirming: false,
    warningsReviewed: false,
    submitting: false,
  }))
  const submissionStarted = useRef(false)

  const steps = plan.steps.map(step => ({
    ...step,
    enabled: !state.disabledStepIds.has(step.id),
  }))
  const replyStep = steps.find(step => REPLY_TOOLS.has(step.tool)) ?? null
  const actionSteps = steps.filter(step => !REPLY_TOOLS.has(step.tool))
  const shopifyActionSteps = actionSteps.filter(step => TOOL_CATEGORIES[step.tool] === "action")
  const replyText = planReplyText(plan)
  const showReplyHero = Boolean(replyText && replyStep)
  const recipient = planRecipientDisplay(customerName)
  const { blocking: blockingWarnings, informational: informationalWarnings } = planWarningTiers(plan)
  const hasBlockingWarnings = blockingWarnings.length > 0
  const needsWarningReview = hasBlockingWarnings && !state.warningsReviewed
  const enabledCount = steps.filter(step => step.enabled).length
  const consequential = steps.some(step => step.enabled && TOOL_CATEGORIES[step.tool] === "action")
  const enabledActions = shopifyActionSteps.some(step => step.enabled)
  const inReviewFlow = needsWarningReview || state.confirming
  const isRunning = !executionOutcome && (isExecuting || state.submitting)

  const headerLabel = showReplyHero
    ? `${agentName} drafted a reply${recipient.headerTo ? ` to ${recipient.headerTo}` : ""}`
    : `${agentName} proposes`
  const primaryLabel = isRunning || executionOutcome
    ? null
    : state.confirming
      ? (showReplyHero ? "Confirm & send" : "Confirm")
      : needsWarningReview
        ? "Review & send"
        : showReplyHero
          ? (enabledActions ? "Approve & send" : "Send reply")
          : "Approve"

  const toggleStep = (id: string, tool: string) => {
    const isEnabled = !state.disabledStepIds.has(id)
    if (isEnabled && HIGH_RISK_TOOLS.has(tool) && !window.confirm(highRiskUncheckMessage(tool))) {
      return
    }
    dispatch({ type: "toggleStep", id })
  }

  const runApprovedSteps = async () => {
    if (submissionStarted.current) return
    submissionStarted.current = true
    const enabledIds = new Set(steps.flatMap(step => step.enabled ? [step.id] : []))
    const stepIds = new Set(steps.map(step => step.id))
    const approved = plan.rawToolCalls.filter(toolCall => (
      !stepIds.has(toolCall.id) || enabledIds.has(toolCall.id)
    ))
    dispatch({ type: "submit" })
    await onApprove(approved)
  }

  const onApproveClick = () => {
    if (needsWarningReview) {
      dispatch({ type: "setWarningsReviewed", value: true })
      return
    }
    if (consequential && !state.confirming) {
      dispatch({ type: "setConfirming", value: true })
      return
    }
    void runApprovedSteps()
  }

  const onCancelReview = () => {
    if (state.confirming) {
      dispatch({ type: "setConfirming", value: false })
      return
    }
    if (state.warningsReviewed) {
      dispatch({ type: "setWarningsReviewed", value: false })
    }
  }

  return {
    actionSteps,
    blockingWarnings,
    collapsedPreview: getPlanCollapsedPreview(plan),
    enabledCount,
    hasBlockingWarnings,
    headerLabel,
    informationalWarnings,
    inReviewFlow,
    isRunning,
    onApproveClick,
    onCancelReview,
    primaryLabel,
    primaryNeedsCaution: needsWarningReview || state.confirming || consequential,
    replyText,
    shopifyActionSteps,
    showReplyHero,
    state,
    toggleStep,
    collapse: () => dispatch({ type: "collapse" }),
    expand: () => dispatch({ type: "expand" }),
    bodyExpanded: () => dispatch({ type: "bodyExpanded" }),
  }
}
