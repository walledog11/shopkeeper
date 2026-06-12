"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { KeyboardEvent } from "react"
import { useUser } from "@clerk/nextjs"
import { useFillerPhrase } from "@/hooks/useFillerPhrase"
import {
  deleteAgentSessionHistory,
  fetchAgentSessionDetail,
  sendAgentChatInstruction,
  sessionToChatMessages,
  SESSION_KEY,
  type ChatMessage,
} from "./agent-chat-session"

interface UseAgentChatStateProps {
  restoreSession?: boolean
}

export function messageKey(message: ChatMessage): string {
  if (message.role === "thinking") return "thinking"
  const time = message.timestamp.toISOString()
  return message.role === "user"
    ? `user-${time}-${message.text}`
    : `agent-${time}-${message.summary}`
}

export function useAgentChatState({ restoreSession = true }: UseAgentChatStateProps) {
  const { user } = useUser()
  const firstName = user?.firstName ?? "there"
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
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sessionIdRef = useRef<string | null>(null)
  const restoreSessionRef = useRef(restoreSession)

  const fetchSessionDetail = useCallback(async (id: string) => {
    try {
      const result = await fetchAgentSessionDetail(id)
      if (result.status === "missing") {
        localStorage.removeItem(SESSION_KEY)
        sessionIdRef.current = null
        return null
      }
      return result.status === "ok" ? result.session : null
    } catch (err) {
      console.error("[AgentChat] fetchSessionDetail failed:", err)
      return null
    }
  }, [])

  const handleNewSession = useCallback(() => {
    sessionIdRef.current = null
    setMessages([])
    localStorage.removeItem(SESSION_KEY)
    textareaRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!restoreSessionRef.current) {
      localStorage.removeItem(SESSION_KEY)
      textareaRef.current?.focus()
      return
    }

    const params = new URLSearchParams(window.location.search)
    const deepLinked = params.get("session")
    const stored = localStorage.getItem(SESSION_KEY)
    const target = deepLinked ?? stored
    if (!target) return

    void fetchSessionDetail(target).then((session) => {
      if (!session) {
        if (deepLinked && stored && stored !== deepLinked) {
          void fetchSessionDetail(stored).then((fallback) => {
            if (!fallback) return
            sessionIdRef.current = fallback.id
            setMessages(sessionToChatMessages(fallback))
          })
        }
        return
      }
      sessionIdRef.current = session.id
      localStorage.setItem(SESSION_KEY, session.id)
      setMessages(sessionToChatMessages(session))
    })

    if (deepLinked) {
      params.delete("session")
      const search = params.toString()
      const newUrl = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`
      window.history.replaceState(null, "", newUrl)
    }
  }, [fetchSessionDetail])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const sendInstruction = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isRunning) return

    const sentAt = new Date()
    const sessionId = sessionIdRef.current
    setIsRunning(true)
    setMessages(prev => [
      ...prev,
      { role: "user", text: trimmed, timestamp: sentAt },
      { role: "thinking" },
    ])

    try {
      const result = await sendAgentChatInstruction({
        instruction: trimmed,
        onStaleSession: () => {
          sessionIdRef.current = null
        },
        sessionId,
        storage: localStorage,
      })

      if (!result.ok) {
        setMessages(prev => [
          ...prev.slice(0, -1),
          { role: "agent", summary: result.error, actions: [], timestamp: new Date() },
        ])
        return
      }

      sessionIdRef.current = result.sessionId
      localStorage.setItem(SESSION_KEY, result.sessionId)

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

  const handleSendText = useCallback(async (text: string) => {
    await sendInstruction(text)
  }, [sendInstruction])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const handleClearHistory = useCallback(async () => {
    setShowClearConfirm(false)
    try {
      await deleteAgentSessionHistory()
      handleNewSession()
    } catch {
      // silent
    }
  }, [handleNewSession])

  return {
    fillerPhrase,
    firstName,
    greeting,
    handleClearHistory,
    handleKeyDown,
    handleNewSession,
    handleSend,
    handleSendText,
    initial,
    input,
    isRunning,
    messages,
    messagesEndRef,
    setInput,
    setShowClearConfirm,
    showClearConfirm,
    textareaRef,
  }
}

export type AgentChatState = ReturnType<typeof useAgentChatState>
