"use client"

import { useReducer, useState } from "react"
import { planReplyText } from "@shopkeeper/agent/plan-preview"
import type { AgentPlan, AgentTurn, RawToolCall, Ticket } from "@/types"
import {
  askAgentPrivately,
  executeApprovedAgentPlan,
  fetchAgentPlan,
  planRequestErrorTurn,
  regenerateAgentPlan,
} from "./conversation-agent-requests"

interface UseConversationAgentFlowProps {
  ticket: Ticket
  viewTab: "chat" | "notes"
  replyText: string
  agentName: string
  initialPlan?: AgentPlan | null
  onReplyChange: (text: string) => void
  onSend: (isNote: boolean) => void
  onAgentTurnAdd: (turn: AgentTurn) => void
  onAgentRunningChange: (running: boolean) => void
  onAgentComplete: (turn: AgentTurn) => void
  onPrivateAnswerStart?: () => void
  onNoteModeReset: () => void
}

// How long the approved plan card lingers on its "Sent ✓" confirmation before it
// slides away. The run fires immediately; this only delays dismissing the card.
const SENT_CARD_LINGER_MS = 500

function createAgentTurn(turn: Omit<AgentTurn, "id">): AgentTurn {
  return { id: crypto.randomUUID(), ...turn }
}

export function getAgentCommandState(
  replyText: string,
  agentName: string,
  viewTab: "chat" | "notes",
) {
  const triggerPrefix = `@${agentName.toLowerCase()}`
  const trimmedReply = replyText.trimStart()
  const isSupportedComposerTab = viewTab === "chat" || viewTab === "notes"
  const isAgentMode = isSupportedComposerTab && trimmedReply.toLowerCase().startsWith(triggerPrefix)
  const agentInstruction = isAgentMode ? trimmedReply.slice(triggerPrefix.length).replace(/^ /, "") : ""

  return {
    agentInstruction,
    isAgentMode,
    triggerPrefix,
  }
}

export function resolvePendingPlan(plan: AgentPlan, instruction: string): AgentPlan | null {
  return plan.steps.length > 0 ? { ...plan, instruction } : null
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
  return plan.steps.some(step => step.category === "action" || step.category === "communication" || step.category === "internal")
}

interface PendingPlanState {
  ticketId: string
  hasOverride: boolean
  plan: AgentPlan | null
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
  viewTab,
  replyText,
  agentName,
  initialPlan,
  onReplyChange,
  onSend,
  onAgentTurnAdd,
  onAgentRunningChange,
  onAgentComplete,
  onPrivateAnswerStart,
  onNoteModeReset,
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

  const { agentInstruction, isAgentMode } = getAgentCommandState(replyText, agentName, viewTab)
  const pendingPlan = pendingPlanState.ticketId === ticket.id && pendingPlanState.hasOverride
    ? pendingPlanState.plan
    : initialPlan ?? null
  const setPendingPlan = (plan: AgentPlan | null) => {
    dispatchPendingPlan({ type: "set", ticketId: ticket.id, plan })
  }

  const executeApprovedPlan = async (instruction: string, approvedToolCalls: RawToolCall[]) => {
    // Keep the card mounted briefly so it shows its "Sent ✓" confirmation before
    // dismissing; the run itself starts immediately below.
    setTimeout(() => setPendingPlan(null), SENT_CARD_LINGER_MS)
    setPendingInstruction(instruction)
    setIsPlanExecuting(true)
    onAgentRunningChange(true)

    try {
      const result = await executeApprovedAgentPlan(ticket.id, instruction, approvedToolCalls)
      const turn = createAgentTurn(result.turn)
      if (result.ok) {
        onAgentComplete(turn)
      } else {
        onAgentTurnAdd(turn)
      }
    } finally {
      onAgentRunningChange(false)
      setIsPlanExecuting(false)
      setPendingInstruction(null)
    }
  }

  const answerPrivateQuestion = async (instruction: string) => {
    onReplyChange("")
    setPendingInstruction(instruction)
    setIsPlanLoading(true)
    onPrivateAnswerStart?.()

    try {
      const result = await askAgentPrivately(ticket.id, instruction)
      const turn = createAgentTurn(result.turn)
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

    onSend(viewTab === "notes" ? true : noteArg)
    if (viewTab === "notes") {
      onNoteModeReset()
    }
  }

  const handlePlanApprove = async (approvedToolCalls: RawToolCall[]) => {
    if (!pendingPlan) return
    await executeApprovedPlan(pendingPlan.instruction, approvedToolCalls)
  }

  const handlePlanDismiss = () => {
    setPendingPlan(null)
  }

  const handlePlanEdit = () => {
    if (!pendingPlan) return
    const text = planReplyText(pendingPlan)
    if (text) onReplyChange(text)
    setPendingPlan(null)
  }

  const handlePlanRegenerate = async () => {
    if (!pendingPlan || isRegenerating) return

    setIsRegenerating(true)
    const instruction = pendingPlan.instruction

    try {
      const plan = await regenerateAgentPlan(ticket.id, instruction)
      const resolved = plan ? resolvePendingPlan(plan, instruction) : null
      if (resolved) setPendingPlan(resolved)
    } finally {
      setIsRegenerating(false)
    }
  }

  const requestAgentPlan = async (instruction: string, options: { force?: boolean } = {}) => {
    onReplyChange("")
    setPendingInstruction(instruction)
    setIsPlanLoading(true)

    try {
      const plan = await fetchAgentPlan(ticket.id, instruction, options)
      const requiresApproval = planRequiresApproval(plan)

      if (!requiresApproval) {
        await answerPrivateQuestion(instruction)
        return
      }

      setPendingPlan(resolvePendingPlan(plan, instruction))
    } catch (err) {
      onAgentTurnAdd(createAgentTurn(planRequestErrorTurn(instruction, err)))
    } finally {
      setIsPlanLoading(false)
      setPendingInstruction(null)
    }
  }

  const requestDraftReply = async (instruction = "draft a reply") => {
    await requestAgentPlan(instruction)
  }

  const requestRefreshDraft = async (instruction = "draft a reply") => {
    await requestAgentPlan(instruction, { force: true })
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
    requestDraftReply,
    requestRefreshDraft,
  }
}
