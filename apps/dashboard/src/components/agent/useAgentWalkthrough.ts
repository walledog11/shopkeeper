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
  appendAgentLine: (summary: string) => void
}

interface WalkthroughInstruction {
  text: string
  displayText?: string
}

export function useAgentWalkthrough({
  walkthrough,
  appendAgentLine,
}: UseAgentWalkthroughProps) {
  const walkthroughItems = useMemo(() => walkthrough?.items ?? [], [walkthrough])
  const walkthroughKey = useMemo(() => (
    walkthrough ? walkthroughItems.map(item => item.threadId).join("|") : null
  ), [walkthrough, walkthroughItems])
  const [walkthroughIndex, setWalkthroughIndex] = useState(0)
  const currentWalkthroughItem = walkthrough ? walkthroughItems[walkthroughIndex] ?? null : null
  const walkthroughDone = walkthrough != null && isWalkthroughComplete(walkthroughItems, walkthroughIndex)

  const openedRef = useRef(false)
  const closedRef = useRef(false)
  const previousWalkthroughKeyRef = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    if (previousWalkthroughKeyRef.current === walkthroughKey) return
    previousWalkthroughKeyRef.current = walkthroughKey
    openedRef.current = false
    closedRef.current = false
    setWalkthroughIndex(0)
  }, [walkthroughKey])

  useEffect(() => {
    if (!walkthrough || openedRef.current) return
    openedRef.current = true
    appendAgentLine(buildWalkthroughOpening(walkthroughItems))
  }, [walkthrough, walkthroughItems, appendAgentLine])

  useEffect(() => {
    if (!walkthrough || !walkthroughDone || closedRef.current) return
    closedRef.current = true
    appendAgentLine(WALKTHROUGH_CLOSING)
  }, [walkthrough, walkthroughDone, appendAgentLine])

  const handleWalkthroughDecision = useCallback((item: WalkthroughItem, decision: WalkthroughDecision) => {
    const result = resolveWalkthroughDecision({ item, index: walkthroughIndex, decision })
    appendAgentLine(result.agentLine)
    setWalkthroughIndex(result.nextIndex)
  }, [appendAgentLine, walkthroughIndex])

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
    handleWalkthroughDecision,
    walkthroughIndex,
    walkthroughItems,
  }
}
