"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { AgentPanelOpenContext, WalkthroughItem } from "@/lib/agent/panel"
import {
  WALKTHROUGH_CLOSING,
  buildWalkthroughContextPrefix,
  buildWalkthroughOpening,
  isWalkthroughComplete,
  resolveWalkthroughDecision,
  type WalkthroughDecision,
} from "./walkthrough-briefing-logic"

type WalkthroughContext = NonNullable<AgentPanelOpenContext["walkthrough"]>

interface UseAgentWalkthroughProps {
  walkthrough: WalkthroughContext | null
}

interface WalkthroughInstruction {
  text: string
  displayText?: string
}

// The walkthrough is a list the merchant works through, not a conversation. Its
// commentary is derived from where the list stands — no line is written into the
// chat transcript, because none of it was ever said by the agent.
export function useAgentWalkthrough({ walkthrough }: UseAgentWalkthroughProps) {
  const walkthroughItems = useMemo(() => walkthrough?.items ?? [], [walkthrough])
  const walkthroughKey = useMemo(() => (
    walkthrough ? walkthroughItems.map(item => item.threadId).join("|") : null
  ), [walkthrough, walkthroughItems])
  const [walkthroughIndex, setWalkthroughIndex] = useState(0)
  const [decisionNotes, setDecisionNotes] = useState<string[]>([])
  const currentWalkthroughItem = walkthrough ? walkthroughItems[walkthroughIndex] ?? null : null
  const walkthroughDone = walkthrough != null && isWalkthroughComplete(walkthroughItems, walkthroughIndex)

  const previousWalkthroughKeyRef = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    if (previousWalkthroughKeyRef.current === walkthroughKey) return
    previousWalkthroughKeyRef.current = walkthroughKey
    setWalkthroughIndex(0)
    setDecisionNotes([])
  }, [walkthroughKey])

  const handleWalkthroughDecision = useCallback((item: WalkthroughItem, decision: WalkthroughDecision) => {
    const result = resolveWalkthroughDecision({ item, index: walkthroughIndex, decision })
    setDecisionNotes(prev => [...prev, result.agentLine])
    setWalkthroughIndex(result.nextIndex)
  }, [walkthroughIndex])

  const buildWalkthroughInstruction = useCallback((visibleText: string): WalkthroughInstruction => {
    if (!currentWalkthroughItem) return { text: visibleText }

    return {
      text: `${buildWalkthroughContextPrefix(currentWalkthroughItem)}\n${visibleText}`,
      displayText: visibleText,
    }
  }, [currentWalkthroughItem])

  return {
    buildWalkthroughInstruction,
    currentWalkthroughItem,
    decisionNotes,
    handleWalkthroughDecision,
    walkthroughClosing: walkthroughDone ? WALKTHROUGH_CLOSING : null,
    walkthroughIndex,
    walkthroughItems,
    walkthroughOpening: walkthrough ? buildWalkthroughOpening(walkthroughItems) : null,
  }
}
