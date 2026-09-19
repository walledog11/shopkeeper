"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { KeyboardEvent } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import { useFillerPhrase } from "@/hooks/useFillerPhrase"
import { dispatchNavProgressStart } from "@/app/dashboard/_components/sidebar/sidebar-helpers"
import { getConciergeFillerPhrases } from "@/lib/agent/concierge-filler-phrases"
import {
  extractConciergeNavigation,
  isConciergeNavigationRequest,
  matchConciergeNavigationIntent,
  type NavigateDashboardPayload,
} from "@/lib/agent/concierge-navigation"
import {
  fetchOperatorTranscript,
  isAgentRequestActive,
  resumeAgentChatRequest,
  sendAgentChatInstruction,
  transcriptToChatMessages,
  type ChatMessage,
} from "./agent-chat-session"

const DEFAULT_FILLER_PHRASES = getConciergeFillerPhrases("")
const PENDING_REQUEST_STORAGE_KEY = "shopkeeper:agent:pending-request"

function taskStatusLabel(status: string): string {
  switch (status) {
    case "accepted":
    case "attached":
    case "queued": return "Queued — waiting for a worker…"
    case "running": return "Working on it…"
    case "waiting_input": return "Waiting for your answer…"
    case "waiting_approval": return "Waiting for your approval…"
    case "reconciling": return "Checking an interrupted action…"
    default: return "Working on it…"
  }
}

interface UseAgentChatStateProps {
  /** Load the operator thread's history on mount. Off for surfaces that open on a blank slate. */
  restoreHistory?: boolean
}

interface SendInstructionOptions {
  displayText?: string
}

// Restored history shares one load timestamp, so position is what actually
// distinguishes two identical lines in a transcript.
export function messageKey(message: ChatMessage, index: number): string {
  if (message.role === "thinking") return `thinking-${index}`
  const time = message.timestamp.toISOString()
  return message.role === "user"
    ? `user-${index}-${time}-${message.text}`
    : `agent-${index}-${time}-${message.summary}`
}

export function useAgentChatState({ restoreHistory = true }: UseAgentChatStateProps) {
  const { user } = useUser()
  const router = useRouter()
  const pathname = usePathname()
  const firstName = user?.firstName ?? ""
  const initial = (user?.firstName?.[0] ?? user?.emailAddresses?.[0]?.emailAddress?.[0] ?? "U").toUpperCase()
  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [isRunning, setIsRunning] = useState(false)
  const [fillerPhrases, setFillerPhrases] = useState<string[]>([...DEFAULT_FILLER_PHRASES])
  const fillerPhrase = useFillerPhrase(fillerPhrases, isRunning)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const restoreHistoryRef = useRef(restoreHistory)

  // Clears the panel only. The conversation itself is the merchant's durable
  // operator thread — shared with their phone — and is not something a button
  // here should end.
  const handleClearPanel = useCallback(() => {
    setMessages([])
    textareaRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!restoreHistoryRef.current) {
      textareaRef.current?.focus()
      return
    }

    void fetchOperatorTranscript()
      .then((result) => {
        if (result.status !== "ok") return
        const restored = transcriptToChatMessages(result.transcript)
        const active = result.transcript.requests?.find(isAgentRequestActive)
        if (!active) {
          setMessages(restored)
          window.localStorage.removeItem(PENDING_REQUEST_STORAGE_KEY)
          return
        }
        window.localStorage.setItem(PENDING_REQUEST_STORAGE_KEY, active.requestId)
        const last = restored.at(-1)
        const withRequest = last?.role === "user" && last.text === active.instruction
          ? restored
          : [...restored, { role: "user" as const, text: active.instruction, timestamp: new Date() }]
        setIsRunning(true)
        setMessages([...withRequest, { role: "thinking", status: taskStatusLabel(active.status) }])
        void resumeAgentChatRequest(active.requestId, fetch, 750, (status) => {
          setMessages(prev => prev.map((message, index) =>
            index === prev.length - 1 && message.role === "thinking"
              ? { ...message, status: taskStatusLabel(status) }
              : message))
        }).then((requestResult) => {
          setMessages(prev => [
            ...prev.slice(0, -1),
            requestResult.ok
              ? {
                  role: "agent" as const,
                  summary: requestResult.summary,
                  actions: requestResult.actionsPerformed,
                  timestamp: new Date(),
                  awaitingApproval: requestResult.awaitingApproval,
                }
              : { role: "agent" as const, summary: requestResult.error, actions: [], timestamp: new Date() },
          ])
        }).catch(() => {
          setMessages(prev => [
            ...prev.slice(0, -1),
            { role: "agent", summary: "Request status is temporarily unavailable.", actions: [], timestamp: new Date() },
          ])
        }).finally(() => {
          window.localStorage.removeItem(PENDING_REQUEST_STORAGE_KEY)
          setIsRunning(false)
        })
      })
      .catch((err) => {
        console.error("[AgentChat] fetchOperatorTranscript failed:", err)
      })
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const navigateConcierge = useCallback((navigation: NavigateDashboardPayload) => {
    if (navigation.href === pathname) return
    router.prefetch(navigation.href)
    dispatchNavProgressStart()
    router.push(navigation.href)
  }, [pathname, router])

  const sendInstruction = useCallback(async (text: string, options: SendInstructionOptions = {}) => {
    const trimmed = text.trim()
    const displayText = (options.displayText ?? text).trim()
    if (!trimmed || !displayText || isRunning) return

    const navIntent = matchConciergeNavigationIntent(trimmed)

    if (navIntent) {
      navigateConcierge(navIntent)
      textareaRef.current?.focus()
      return
    }

    const sentAt = new Date()
    setFillerPhrases([...getConciergeFillerPhrases(trimmed)])
    setIsRunning(true)
    setMessages(prev => [
      ...prev,
      { role: "user", text: displayText, timestamp: sentAt },
      { role: "thinking" },
    ])

    try {
      const clientRequestId = crypto.randomUUID()
      window.localStorage.setItem(PENDING_REQUEST_STORAGE_KEY, clientRequestId)
      const result = await sendAgentChatInstruction({
        instruction: trimmed,
        clientRequestId,
        onStatus: (status) => {
          setMessages(prev => prev.map((message, index) =>
            index === prev.length - 1 && message.role === "thinking"
              ? { ...message, status: taskStatusLabel(status) }
              : message))
        },
      })

      if (!result.ok) {
        setMessages(prev => [
          ...prev.slice(0, -1),
          { role: "agent", summary: result.error, actions: [], timestamp: new Date() },
        ])
        return
      }

      const navigation = extractConciergeNavigation(result.actionsPerformed)
      if (navigation && isConciergeNavigationRequest(trimmed)) {
        navigateConcierge(navigation)
        setMessages(prev => prev.slice(0, -2))
        return
      }

      setMessages(prev => [
        ...prev.slice(0, -1),
        {
          role: "agent",
          summary: result.summary,
          actions: result.actionsPerformed,
          timestamp: new Date(),
          awaitingApproval: result.awaitingApproval,
        },
      ])
    } catch {
      setMessages(prev => [
        ...prev.slice(0, -1),
        { role: "agent", summary: "Request failed. Please try again.", actions: [], timestamp: new Date() },
      ])
    } finally {
      window.localStorage.removeItem(PENDING_REQUEST_STORAGE_KEY)
      setIsRunning(false)
      textareaRef.current?.focus()
    }
  }, [isRunning, navigateConcierge])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || isRunning) return
    setInput("")
    await sendInstruction(text)
  }, [input, isRunning, sendInstruction])

  const handleSendText = useCallback(async (text: string, options?: SendInstructionOptions) => {
    await sendInstruction(text, options)
  }, [sendInstruction])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  return {
    fillerPhrase,
    firstName,
    greeting,
    handleKeyDown,
    handleClearPanel,
    handleSend,
    handleSendText,
    initial,
    input,
    isRunning,
    messages,
    messagesEndRef,
    setInput,
    textareaRef,
  }
}

export type AgentChatState = ReturnType<typeof useAgentChatState>
