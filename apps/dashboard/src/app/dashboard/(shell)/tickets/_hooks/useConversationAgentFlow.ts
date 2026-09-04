"use client"

import { useEffect, useReducer, useRef, useState } from "react"
import { AGENT_DISPLAY_NAME } from "@shopkeeper/agent/settings"
import { planReplyText } from "@shopkeeper/agent/plan-preview"
import type { AgentPlan, AgentTurn, PlanExecutionOutcome, RawToolCall, Ticket } from "@/types"
import {
  askAgentPrivately,
  dismissAgentPlan,
  executeApprovedAgentPlan,
  fetchAgentPlan,
  planRequestErrorTurn,
} from "./conversation-agent-requests"
import { REPLAN_CUSTOMER_REPLY_INSTRUCTION } from "@/lib/agent/replan-instruction"
import { captureClientProductEvent } from "@/lib/product-events"

interface UseConversationAgentFlowProps {
  ticket: Ticket
  replyText: string
  initialPlan?: AgentPlan | null
  onReplyChange: (text: string) => void
  onSend: (isNote: boolean) => void
  onAgentTurnAdd: (turn: AgentTurn) => void
  onAgentRunningChange: (running: boolean) => void
  onAgentComplete: (turn: AgentTurn) => void
  onPlanCacheUpdated?: () => void | Promise<void>
}

// How long a server-confirmed plan card lingers before it slides away.
const SENT_CARD_LINGER_MS = 500

function createAgentTurn(turn: Omit<AgentTurn, "id">): AgentTurn {
  return { id: crypto.randomUUID(), ...turn }
}

// `instruction` is the merchant's own composer text, echoed back above the turn.
// Only the `@{agentName}` path has one; a card button or an auto-plan carries a
// planner instruction the merchant never wrote, and echoing that puts words in
// their mouth — an internal prompt paragraph included.
const NO_MERCHANT_INSTRUCTION = ""

export function getAgentCommandState(replyText: string) {
  const triggerPrefix = `@${AGENT_DISPLAY_NAME.toLowerCase()}`
  const trimmedReply = replyText.trimStart()
  const isAgentMode = trimmedReply.toLowerCase().startsWith(triggerPrefix)
  const agentInstruction = isAgentMode ? trimmedReply.slice(triggerPrefix.length).replace(/^ /, "") : ""

  return {
    agentInstruction,
    isAgentMode,
    triggerPrefix,
  }
}

export function resolvePendingPlan(plan: AgentPlan, instruction: string): AgentPlan | null {
  return plan.steps.length > 0 || plan.validation?.status === "invalid"
    ? { ...plan, instruction }
    : null
}

const PRIVATE_ASK_RE =
  /\b(what should i|what do i|what to say|how should i|how do i|what can i|can you draft|draft|write|rewrite|responding to this|summari[sz]e|explain|do we have enough|should i|what's|what is|why)\b/i
const ACTION_REQUEST_RE =
  /^(?:(?:please|can you|could you|go ahead and|let's|lets)\s+)?(?:change|update|edit|swap|remove|add|refund|cancel|create|place|make|send|email|notify|close|tag|run|approve)\b/i

export function shouldUsePrivateComposerAsk(instruction: string): boolean {
  const normalized = instruction.trim()
  if (!normalized) return false
  if (PRIVATE_ASK_RE.test(normalized)) return true
  return !ACTION_REQUEST_RE.test(normalized)
}

export function planRequiresApproval(plan: AgentPlan): boolean {
  return plan.validation?.status === "invalid"
    || plan.steps.some(step => step.category === "action" || step.category === "communication" || step.category === "internal")
}

interface PendingPlanState {
  ticketId: string
  hasOverride: boolean
  plan: AgentPlan | null
}

interface PlanExecutionState {
  ticketId: string
  planKey: string
  outcome: PlanExecutionOutcome
}

function planStateKey(plan: AgentPlan): string {
  return plan.planId
    ?? `${plan.instruction}:${plan.rawToolCalls.map(toolCall => toolCall.id).join(",")}`
}

type PendingPlanAction = { type: "set"; ticketId: string; plan: AgentPlan | null }

function pendingPlanReducer(_state: PendingPlanState, action: PendingPlanAction): PendingPlanState {
  return {
    ticketId: action.ticketId,
    hasOverride: true,
    plan: action.plan,
  }
}

export function useConversationAgentFlow({
  ticket,
  replyText,
  initialPlan,
  onReplyChange,
  onSend,
  onAgentTurnAdd,
  onAgentRunningChange,
  onAgentComplete,
  onPlanCacheUpdated,
}: UseConversationAgentFlowProps) {
  const [pendingInstruction, setPendingInstruction] = useState<string | null>(null)
  const [pendingPlanState, dispatchPendingPlan] = useReducer(pendingPlanReducer, {
    ticketId: ticket.id,
    hasOverride: false,
    plan: null,
  })
  const [isPlanLoading, setIsPlanLoading] = useState(false)
  const [isPlanExecuting, setIsPlanExecuting] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [planExecutionState, setPlanExecutionState] = useState<PlanExecutionState | null>(null)
  const successDismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { agentInstruction, isAgentMode } = getAgentCommandState(replyText)
  const pendingPlan = pendingPlanState.ticketId === ticket.id && pendingPlanState.hasOverride
    ? pendingPlanState.plan
    : initialPlan ?? null
  const planExecutionOutcome = pendingPlan
    && planExecutionState?.ticketId === ticket.id
    && planExecutionState.planKey === planStateKey(pendingPlan)
    ? planExecutionState.outcome
    : null
  const setPendingPlan = (plan: AgentPlan | null) => {
    if (successDismissTimer.current) {
      clearTimeout(successDismissTimer.current)
      successDismissTimer.current = null
    }
    dispatchPendingPlan({ type: "set", ticketId: ticket.id, plan })
    setPlanExecutionState(null)
  }

  useEffect(() => () => {
    if (successDismissTimer.current) clearTimeout(successDismissTimer.current)
  }, [])

  const executeApprovedPlan = async (plan: AgentPlan, approvedToolCalls: RawToolCall[]) => {
    const instruction = plan.instruction
    const executionIdentity = {
      ticketId: ticket.id,
      planKey: planStateKey(plan),
    }
    // Pin the reviewed plan locally while the server consumes its cache. This
    // preserves failure/partial/unknown recovery context across SWR refreshes.
    setPendingPlan(plan)
    setPendingInstruction(NO_MERCHANT_INSTRUCTION)
    setIsPlanExecuting(true)
    onAgentRunningChange(true)

    try {
      const result = await executeApprovedAgentPlan(ticket.id, instruction, approvedToolCalls)
      setPlanExecutionState({ ...executionIdentity, outcome: result.outcome })
      const turn = createAgentTurn({ ...result.turn, instruction: NO_MERCHANT_INSTRUCTION })
      if (result.ok) {
        onAgentComplete(turn)
        successDismissTimer.current = setTimeout(() => {
          successDismissTimer.current = null
          setPendingPlan(null)
        }, SENT_CARD_LINGER_MS)
      } else {
        onAgentTurnAdd(turn)
      }
    } finally {
      onAgentRunningChange(false)
      setIsPlanExecuting(false)
      setPendingInstruction(null)
    }
  }

  const answerPrivateQuestion = async (instruction: string, echo: string = instruction) => {
    onReplyChange("")
    setPendingInstruction(echo)
    setIsPlanLoading(true)

    try {
      const result = await askAgentPrivately(ticket.id, instruction)
      const turn = createAgentTurn({ ...result.turn, instruction: echo })
      if (result.ok) {
        onAgentComplete(turn)
      } else {
        onAgentTurnAdd(turn)
      }
    } finally {
      setIsPlanLoading(false)
      setPendingInstruction(null)
    }
  }

  const handleSend = async (noteArg: boolean) => {
    if (isAgentMode && agentInstruction) {
      const instruction = agentInstruction

      if (shouldUsePrivateComposerAsk(instruction)) {
        await answerPrivateQuestion(instruction)
        return
      }

      onReplyChange("")
      setPendingInstruction(instruction)
      setIsPlanLoading(true)

      try {
        const plan = await fetchAgentPlan(ticket.id, instruction)
        const requiresApproval = planRequiresApproval(plan)

        if (!requiresApproval) {
          setIsPlanLoading(false)
          setPendingInstruction(null)
          await answerPrivateQuestion(instruction)
        } else {
          setIsPlanLoading(false)
          setPendingInstruction(null)
          setPendingPlan(resolvePendingPlan(plan, instruction))
        }
      } catch (err) {
        setIsPlanLoading(false)
        setPendingInstruction(null)
        onAgentTurnAdd(createAgentTurn(planRequestErrorTurn(instruction, err)))
      }

      return
    }

    onSend(noteArg)
  }

  const handlePlanApprove = async (approvedToolCalls: RawToolCall[]) => {
    if (!pendingPlan) return
    await executeApprovedPlan(pendingPlan, approvedToolCalls)
  }

  const handlePlanDismiss = async () => {
    if (!pendingPlan) return
    const dismissedPlan = pendingPlan
    if (dismissedPlan.planId) {
      try {
        await dismissAgentPlan(ticket.id, dismissedPlan.planId)
      } catch (error) {
        onAgentTurnAdd(createAgentTurn(planRequestErrorTurn(NO_MERCHANT_INSTRUCTION, error)))
        return
      }
    }
    if (!planExecutionOutcome && dismissedPlan.planId) {
      void captureClientProductEvent({
        event: "agent_plan_decided",
        decision: "dismissed",
        planId: dismissedPlan.planId,
      })
    }
    setPendingPlan(null)
    await onPlanCacheUpdated?.()
  }

  const handlePlanEdit = async () => {
    if (!pendingPlan) return
    const editedPlan = pendingPlan
    if (editedPlan.planId) {
      try {
        await dismissAgentPlan(ticket.id, editedPlan.planId)
      } catch (error) {
        onAgentTurnAdd(createAgentTurn(planRequestErrorTurn(NO_MERCHANT_INSTRUCTION, error)))
        return
      }
    }
    const text = editedPlan.validation?.status === "invalid" ? null : planReplyText(editedPlan)
    if (editedPlan.validation?.status === "invalid") onReplyChange("")
    if (text) onReplyChange(text)
    setPendingPlan(null)
    await onPlanCacheUpdated?.()
  }

  const handlePlanRegenerate = async () => {
    if (!pendingPlan || isRegenerating) return

    const instruction = REPLAN_CUSTOMER_REPLY_INSTRUCTION
    setIsRegenerating(true)

    try {
      const plan = await fetchAgentPlan(ticket.id, instruction, { force: true })
      const resolved = resolvePendingPlan(plan, instruction)
      if (resolved) {
        setPendingPlan(resolved)
        await onPlanCacheUpdated?.()
        return
      }

      setPendingPlan(null)
      onAgentTurnAdd(createAgentTurn({
        instruction: NO_MERCHANT_INSTRUCTION,
        actions: [],
        summary: plan.steps.length === 0
          ? "This ticket was already answered — there is no new draft to generate."
          : "Regeneration did not produce a reviewable plan. Try drafting again from the composer.",
        error: null,
      }))
    } catch (err) {
      onAgentTurnAdd(createAgentTurn(planRequestErrorTurn(NO_MERCHANT_INSTRUCTION, err)))
    } finally {
      setIsRegenerating(false)
    }
  }

  const requestAgentPlan = async (instruction: string, options: { force?: boolean } = {}) => {
    onReplyChange("")
    setPendingInstruction(NO_MERCHANT_INSTRUCTION)
    setIsPlanLoading(true)

    try {
      const plan = await fetchAgentPlan(ticket.id, instruction, options)
      const requiresApproval = planRequiresApproval(plan)

      if (!requiresApproval) {
        await answerPrivateQuestion(instruction, NO_MERCHANT_INSTRUCTION)
        return
      }

      setPendingPlan(resolvePendingPlan(plan, instruction))
    } catch (err) {
      onAgentTurnAdd(createAgentTurn(planRequestErrorTurn(NO_MERCHANT_INSTRUCTION, err)))
    } finally {
      setIsPlanLoading(false)
      setPendingInstruction(null)
    }
  }

  const requestDraftReply = async (instruction = "draft a reply") => {
    await requestAgentPlan(instruction)
  }

  const requestRefreshDraft = async () => {
    await requestAgentPlan(REPLAN_CUSTOMER_REPLY_INSTRUCTION, { force: true })
  }

  return {
    agentInstruction,
    handlePlanApprove,
    handlePlanDismiss,
    handlePlanEdit,
    handlePlanRegenerate,
    handleSend,
    isAgentMode,
    isPlanExecuting,
    isPlanLoading,
    isRegenerating,
    pendingInstruction,
    pendingPlan,
    planExecutionOutcome,
    requestDraftReply,
    requestRefreshDraft,
  }
}
