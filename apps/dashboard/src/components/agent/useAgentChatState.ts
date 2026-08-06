"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { KeyboardEvent } from "react"
import { useUser } from "@clerk/nextjs"
import { useFillerPhrase } from "@/hooks/useFillerPhrase"
import {
  fetchOperatorTranscript,
  sendAgentChatInstruction,
  transcriptToChatMessages,
  type ChatMessage,
} from "./agent-chat-session"

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
  if (message.role === "thinking") return "thinking"
  const time = message.timestamp.toISOString()
  return message.role === "user"
    ? `user-${index}-${time}-${message.text}`
    : `agent-${index}-${time}-${message.summary}`
}

export function useAgentChatState({ restoreHistory = true }: UseAgentChatStateProps) {
  const { user } = useUser()
  const firstName = user?.firstName ?? ""
  const initial = (user?.firstName?.[0] ?? user?.emailAddresses?.[0]?.emailAddress?.[0] ?? "U").toUpperCase()
  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [isRunning, setIsRunning] = useState(false)
  const fillerPhrase = useFillerPhrase([
    "Checking Shopify…",
    "Drafting reply…",
    "Looking up the order…",
    "Searching knowledge base…",
    "Pulling customer history…",
  ], isRunning)
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
        if (result.status !== "ok" || result.transcript.messages.length === 0) return
        setMessages(transcriptToChatMessages(result.transcript))
      })
      .catch((err) => {
        console.error("[AgentChat] fetchOperatorTranscript failed:", err)
      })
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const sendInstruction = useCallback(async (text: string, options: SendInstructionOptions = {}) => {
    const trimmed = text.trim()
    const displayText = (options.displayText ?? text).trim()
    if (!trimmed || !displayText || isRunning) return

    const sentAt = new Date()
    setIsRunning(true)
    setMessages(prev => [
      ...prev,
      { role: "user", text: displayText, timestamp: sentAt },
      { role: "thinking" },
    ])

    try {
      const result = await sendAgentChatInstruction({ instruction: trimmed })

      if (!result.ok) {
        setMessages(prev => [
          ...prev.slice(0, -1),
          { role: "agent", summary: result.error, actions: [], timestamp: new Date() },
        ])
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
      setIsRunning(false)
      textareaRef.current?.focus()
    }
  }, [isRunning])

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
