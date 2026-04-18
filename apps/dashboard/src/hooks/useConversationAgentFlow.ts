"use client"

import { useEffect, useState } from "react"
import type { AgentPlan, AgentTurn, RawToolCall, Ticket } from "@/types"

interface UseConversationAgentFlowProps {
  activeTab: "open" | "closed"
  ticket: Ticket
  viewTab: "chat" | "notes"
  replyText: string
  agentName: string
  planRevisionKey?: string | null
  initialPlan?: AgentPlan | null
  onReplyChange: (text: string) => void
  onSend: (isNote: boolean) => void
  onAgentTurnAdd: (turn: AgentTurn) => void
  onAgentRunningChange: (running: boolean) => void
  onAgentComplete: (turn: AgentTurn) => void
  onPlanCached: (plan: AgentPlan | null) => void
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
  const isClerkMode = viewTab === "notes" && trimmedReply.toLowerCase().startsWith(triggerPrefix)
  const clerkInstruction = isClerkMode ? trimmedReply.slice(triggerPrefix.length).replace(/^ /, "") : ""

  return {
    clerkInstruction,
    isClerkMode,
    triggerPrefix,
  }
}

export function shouldHydratePlanOnOpen(args: {
  activeTab: "open" | "closed"
  hasPlanRevisionKey: boolean
  initialPlan: AgentPlan | null | undefined
  lastChatMessageSender?: Ticket["messages"][number]["sender"]
}) {
  return (
    args.activeTab === "open" &&
    args.hasPlanRevisionKey &&
    args.initialPlan === undefined &&
    args.lastChatMessageSender === "customer"
  )
}

export function resolvePendingPlan(plan: AgentPlan, instruction: string): AgentPlan | null {
  return plan.steps.length > 0 ? { ...plan, instruction } : null
}

export function useConversationAgentFlow({
  activeTab,
  ticket,
  viewTab,
  replyText,
  agentName,
  planRevisionKey,
  initialPlan,
  onReplyChange,
  onSend,
  onAgentTurnAdd,
  onAgentRunningChange,
  onAgentComplete,
  onPlanCached,
  onNoteModeReset,
}: UseConversationAgentFlowProps) {
  const [pendingInstruction, setPendingInstruction] = useState<string | null>(null)
  const [pendingPlan, setPendingPlan] = useState<AgentPlan | null>(initialPlan ?? null)
  const [isPlanLoading, setIsPlanLoading] = useState(false)
  const [isAutoPlanLoading, setIsAutoPlanLoading] = useState(false)
  const [isPlanExecuting, setIsPlanExecuting] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)

  const { clerkInstruction, isClerkMode } = getClerkCommandState(replyText, agentName, viewTab)

  const lastChatMessage = ticket.messages.filter(message => message.sender !== "note").at(-1)

  useEffect(() => {
    setPendingPlan(initialPlan ?? null)
  }, [planRevisionKey, initialPlan])

  useEffect(() => {
    if (!shouldHydratePlanOnOpen({
      activeTab,
      hasPlanRevisionKey: Boolean(planRevisionKey),
      initialPlan,
      lastChatMessageSender: lastChatMessage?.sender,
    })) return

    setIsAutoPlanLoading(true)

    const instruction = ticket.aiSummary || "Handle this customer's latest request"

    fetch("/api/agent/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId: ticket.id, instruction }),
    })
      .then(response => response.ok ? response.json() : Promise.reject())
      .then((plan: AgentPlan) => {
        const resolved = resolvePendingPlan(plan, instruction)
        if (resolved) setPendingPlan(resolved)
        onPlanCached(resolved)
      })
      .catch(() => {})
      .finally(() => setIsAutoPlanLoading(false))
  }, [activeTab, initialPlan, lastChatMessage?.sender, onPlanCached, planRevisionKey, ticket.aiSummary, ticket.id])

  const executeApprovedPlan = async (instruction: string, approvedToolCalls: RawToolCall[]) => {
    setPendingPlan(null)
    setPendingInstruction(instruction)
    setIsPlanExecuting(false)
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
        error: "Network error — please try again.",
      }))
    } finally {
      onAgentRunningChange(false)
      setPendingInstruction(null)
    }
  }

  const handleSend = async (noteArg: boolean) => {
    if (isClerkMode && clerkInstruction) {
      const instruction = clerkInstruction
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
          throw new Error("Plan request failed")
        }

        const plan: AgentPlan = await response.json()
        const hasActionStep = plan.steps.some(step => step.category === "action")

        if (!hasActionStep) {
          setIsPlanLoading(false)
          await executeApprovedPlan(instruction, plan.rawToolCalls)
        } else {
          setIsPlanLoading(false)
          setPendingInstruction(null)
          setPendingPlan(resolvePendingPlan(plan, instruction))
        }
      } catch {
        setIsPlanLoading(false)
        setPendingInstruction(null)
        onAgentTurnAdd(createAgentTurn({
          instruction,
          actions: [],
          summary: null,
          error: "Failed to generate plan — please try again.",
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
    setIsPlanExecuting(true)
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
      onPlanCached(resolved)
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
    isAutoPlanLoading,
    isClerkMode,
    isPlanExecuting,
    isPlanLoading,
    isRegenerating,
    pendingInstruction,
    pendingPlan,
  }
}
