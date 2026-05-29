"use client"

import { useReducer, useState } from "react"
import type { AgentPlan, AgentTurn, RawToolCall, Ticket } from "@/types"

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

function createAgentTurn(turn: Omit<AgentTurn, "id">): AgentTurn {
  return { id: crypto.randomUUID(), ...turn }
}

export function getClerkCommandState(
  replyText: string,
  agentName: string,
  viewTab: "chat" | "notes",
) {
  const triggerPrefix = `@${agentName.toLowerCase()}`
  const trimmedReply = replyText.trimStart()
  const isSupportedComposerTab = viewTab === "chat" || viewTab === "notes"
  const isClerkMode = isSupportedComposerTab && trimmedReply.toLowerCase().startsWith(triggerPrefix)
  const clerkInstruction = isClerkMode ? trimmedReply.slice(triggerPrefix.length).replace(/^ /, "") : ""

  return {
    clerkInstruction,
    isClerkMode,
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

  const { clerkInstruction, isClerkMode } = getClerkCommandState(replyText, agentName, viewTab)
  const pendingPlan = pendingPlanState.ticketId === ticket.id && pendingPlanState.hasOverride
    ? pendingPlanState.plan
    : initialPlan ?? null
  const setPendingPlan = (plan: AgentPlan | null) => {
    dispatchPendingPlan({ type: "set", ticketId: ticket.id, plan })
  }

  const executeApprovedPlan = async (instruction: string, approvedToolCalls: RawToolCall[]) => {
    setPendingPlan(null)
    setPendingInstruction(instruction)
    setIsPlanExecuting(true)
    onAgentRunningChange(true)

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: ticket.id, instruction, approvedToolCalls }),
      })
      const data = await response.json()
      const turn = createAgentTurn({
        instruction,
        actions: data.actionsPerformed ?? [],
        summary: data.summary ?? null,
        error: response.ok ? null : (data.error ?? "Agent failed."),
      })

      if (response.ok) {
        onAgentComplete(turn)
      } else {
        onAgentTurnAdd(turn)
      }
    } catch {
      onAgentTurnAdd(createAgentTurn({
        instruction,
        actions: [],
        summary: null,
        error: "Network error , please try again.",
      }))
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
      const response = await fetch("/api/agent/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: ticket.id, instruction }),
      })
      const data = await response.json()
      const turn = createAgentTurn({
        instruction,
        actions: data.actionsPerformed ?? [],
        summary: data.summary ?? null,
        error: response.ok ? null : (data.error ?? "Agent failed."),
      })

      if (response.ok) {
        onAgentComplete(turn)
      } else {
        onAgentTurnAdd(turn)
      }
    } catch {
      onAgentTurnAdd(createAgentTurn({
        instruction,
        actions: [],
        summary: null,
        error: "Network error , please try again.",
      }))
    } finally {
      setIsPlanLoading(false)
      setPendingInstruction(null)
    }
  }

  const handleSend = async (noteArg: boolean) => {
    if (isClerkMode && clerkInstruction) {
      const instruction = clerkInstruction

      if (shouldUsePrivateComposerAsk(instruction)) {
        await answerPrivateQuestion(instruction)
        return
      }

      onReplyChange("")
      setPendingInstruction(instruction)
      setIsPlanLoading(true)

      try {
        const response = await fetch("/api/agent/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ threadId: ticket.id, instruction }),
        })
        if (!response.ok) {
          const errData = await response.json().catch(() => null) as { error?: string } | null
          throw new Error(errData?.error ?? "Plan request failed")
        }

        const plan: AgentPlan = await response.json()
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
        onAgentTurnAdd(createAgentTurn({
          instruction,
          actions: [],
          summary: null,
          error: err instanceof Error ? err.message : "Failed to generate plan , please try again.",
        }))
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

  const handlePlanRegenerate = async () => {
    if (!pendingPlan || isRegenerating) return

    setIsRegenerating(true)
    const instruction = pendingPlan.instruction

    try {
      const response = await fetch("/api/agent/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: ticket.id, instruction, force: true }),
      })
      if (!response.ok) {
        throw new Error()
      }

      const plan: AgentPlan = await response.json()
      const resolved = resolvePendingPlan(plan, instruction)
      if (resolved) setPendingPlan(resolved)
    } catch {
      // Keep the current plan in place on failure.
    } finally {
      setIsRegenerating(false)
    }
  }

  return {
    clerkInstruction,
    handlePlanApprove,
    handlePlanDismiss,
    handlePlanRegenerate,
    handleSend,
    isClerkMode,
    isPlanExecuting,
    isPlanLoading,
    isRegenerating,
    pendingInstruction,
    pendingPlan,
  }
}
