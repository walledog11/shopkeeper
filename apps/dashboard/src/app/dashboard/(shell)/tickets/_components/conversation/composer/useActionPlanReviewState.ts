"use client"

import { useReducer, useRef } from "react"
import { AGENT_DISPLAY_NAME } from "@shopkeeper/agent/settings"
import { planReplyText } from "@shopkeeper/agent/plan-preview"
import { planSignalTiers } from "@shopkeeper/agent/plan-signals"
import { TOOL_CATEGORIES } from "@shopkeeper/agent/tools"
import type { AgentPlan, PlanCardOutcome, RawToolCall } from "@/types"
import { getPlanCollapsedPreview } from "./plan-step-display"
import { planRecipientDisplay } from "./plan-recipient-display"

const REPLY_TOOLS = new Set(["send_reply", "send_email"])

interface ActionPlanReviewState {
  collapsed: boolean
  compactHeader: boolean
  confirming: boolean
  warningsReviewed: boolean
  submitting: boolean
}

type ActionPlanReviewAction =
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
  customerName,
  executionOutcome,
  isExecuting,
  onApprove,
  plan,
}: {
  customerName?: string | null
  executionOutcome: PlanCardOutcome | null
  isExecuting: boolean
  onApprove: (approvedToolCalls: RawToolCall[]) => Promise<void>
  plan: AgentPlan
}) {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    collapsed: false,
    compactHeader: false,
    confirming: false,
    warningsReviewed: false,
    submitting: false,
  }))
  const submissionStarted = useRef(false)

  // The merchant approves the whole card or none of it: its proposal hash binds
  // every step, so a card with a step switched off could never be approved.
  const steps = plan.steps
  const replyStep = steps.find(step => REPLY_TOOLS.has(step.tool)) ?? null
  const actionSteps = steps.filter(step => !REPLY_TOOLS.has(step.tool))
  const shopifyActionSteps = actionSteps.filter(step => TOOL_CATEGORIES[step.tool] === "action")
  const replyText = planReplyText(plan)
  const showReplyHero = Boolean(replyText && replyStep)
  const recipient = planRecipientDisplay(customerName)
  const planInvalid = plan.validation?.status === "invalid"
  const { blocking: blockingSignals, advisory: advisorySignals } = planSignalTiers(plan)
  const hasBlockingSignals = blockingSignals.length > 0
  const needsWarningReview = hasBlockingSignals && !state.warningsReviewed
  const consequential = steps.some(step => TOOL_CATEGORIES[step.tool] === "action")
  const enabledActions = shopifyActionSteps.length > 0
  const inReviewFlow = needsWarningReview || state.confirming
  const isRunning = !executionOutcome && (isExecuting || state.submitting)

  const headerLabel = showReplyHero
    ? `${AGENT_DISPLAY_NAME} drafted a reply${recipient.headerTo ? ` to ${recipient.headerTo}` : ""}`
    : `${AGENT_DISPLAY_NAME} proposes`
  const primaryLabel = planInvalid || isRunning || executionOutcome
    ? null
    : state.confirming
      ? (showReplyHero ? "Confirm & send" : "Confirm")
      : needsWarningReview
        ? "Review & send"
        : showReplyHero
          ? (enabledActions ? "Approve & send" : "Send reply")
          : "Approve"

  const runApprovedSteps = async () => {
    if (submissionStarted.current) return
    submissionStarted.current = true
    dispatch({ type: "submit" })
    await onApprove(plan.rawToolCalls)
  }

  const onApproveClick = () => {
    if (planInvalid) return
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
    blockingSignals,
    collapsedPreview: getPlanCollapsedPreview(plan),
    hasBlockingSignals,
    headerLabel,
    advisorySignals,
    inReviewFlow,
    isRunning,
    onApproveClick,
    onCancelReview,
    primaryLabel,
    planInvalid,
    primaryNeedsCaution: needsWarningReview || state.confirming || consequential,
    replyText,
    shopifyActionSteps,
    showReplyHero,
    state,
    collapse: () => dispatch({ type: "collapse" }),
    expand: () => dispatch({ type: "expand" }),
    bodyExpanded: () => dispatch({ type: "bodyExpanded" }),
  }
}
