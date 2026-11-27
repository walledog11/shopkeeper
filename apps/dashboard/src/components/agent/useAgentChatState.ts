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
  type NavigateDashboardPayload,
} from "@/lib/agent/concierge-navigation"
import {
  fetchOperatorTranscript,
  canStopAgentRequest,
  stopAgentChatRequest,
  isAgentRequestActive,
  resumeAgentChatRequest,
  sendAgentChatInstruction,
  transcriptToChatMessages,
  type ChatMessage,
  type ChatResend,
  type AgentRequestControl,
} from "./agent-chat-session"
import { requestFailureMessage, type RequestFailureCopy } from "@/lib/api/client-error-message"

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
  if (message.role === "failure") return `failure-${index}-${time}`
  return message.role === "user"
    ? `user-${index}-${time}-${message.text}`
    : `agent-${index}-${time}-${message.summary}`
}

// A failed request as the panel shows it. Only an instruction this panel sent
// can be sent again; a request picked back up after a reload recovers by
// reloading, which picks it up again.
function failureMessage(failure: RequestFailureCopy, resend: ChatResend | null): ChatMessage {
  const recovery = failure.recovery === "retry" && resend
    ? { kind: "retry" as const, ...resend }
    : failure.recovery ? { kind: "reload" as const } : null
  return { role: "failure", detail: failure.detail, recovery, timestamp: new Date() }
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
  const [activeRequest, setActiveRequest] = useState<AgentRequestControl | null>(null)
  const [stopBusy, setStopBusy] = useState(false)
  const [stopError, setStopError] = useState<string | null>(null)
  const [fillerPhrases, setFillerPhrases] = useState<string[]>([...DEFAULT_FILLER_PHRASES])
  const fillerPhrase = useFillerPhrase(fillerPhrases, isRunning)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const restoreHistoryRef = useRef(restoreHistory)

  const updateRequest = useCallback((request: AgentRequestControl) => {
    setActiveRequest(request)
    setMessages(prev => prev.map((message, index) =>
      index === prev.length - 1 && message.role === "thinking"
        ? { ...message, status: request.cancelledAt
            ? "Stopping. Work already in progress may finish…"
            : taskStatusLabel(request.status) }
        : message))
  }, [])

  const handleStop = useCallback(async () => {
    if (!activeRequest || !canStopAgentRequest(activeRequest) || stopBusy) return
    setStopBusy(true)
    setStopError(null)
    try {
      const result = await stopAgentChatRequest(activeRequest)
      if (!result.ok) {
        setStopError(result.error)
        return
      }
      updateRequest(result.request)
      if (!isRunning) {
        setMessages(prev => [...prev, {
          role: "agent", actions: [], timestamp: new Date(),
          summary: result.request.status === "reconciling"
            ? "Stopped further work. An action had already started; check its outcome before continuing."
            : result.request.status === "cancelled"
              ? "Stopped. No further work will run for this instruction."
              : "This instruction had already finished.",
        }])
      }
    } catch {
      setStopError("Could not confirm the stop. Refresh to check the instruction.")
    } finally {
      setStopBusy(false)
    }
  }, [activeRequest, isRunning, stopBusy, updateRequest])

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
        const waiting = result.transcript.requests?.find(request => ["waiting_input", "waiting_approval"].includes(request.status))
        if (!active) {
          if (waiting?.taskRevision != null) updateRequest({ ...waiting, taskRevision: waiting.taskRevision })
          setMessages(restored)
          window.localStorage.removeItem(PENDING_REQUEST_STORAGE_KEY)
          return
        }
        window.localStorage.setItem(PENDING_REQUEST_STORAGE_KEY, active.requestId)
        if (active.taskRevision != null) updateRequest({ ...active, taskRevision: active.taskRevision })
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
        }, updateRequest).then((requestResult) => {
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
              : failureMessage(requestResult.failure, null),
          ])
        }).catch(() => {
          setMessages(prev => [
            ...prev.slice(0, -1),
            failureMessage({ detail: "Request status is temporarily unavailable.", recovery: "reload" }, null),
          ])
        }).finally(() => {
          window.localStorage.removeItem(PENDING_REQUEST_STORAGE_KEY)
          setIsRunning(false)
        })
      })
      .catch((err) => {
        console.error("[AgentChat] fetchOperatorTranscript failed:", err)
      })
  }, [updateRequest])

  const navigateConcierge = useCallback((navigation: NavigateDashboardPayload) => {
    if (navigation.href === pathname) return
    router.prefetch(navigation.href)
    dispatchNavProgressStart()
    router.push(navigation.href)
  }, [pathname, router])

  // Runs an instruction whose "thinking" row is the last message, and settles
  // that row with the answer or the failure.
  const runInstruction = useCallback(async ({ instruction, clientRequestId }: ChatResend) => {
    setFillerPhrases([...getConciergeFillerPhrases(instruction)])
    setIsRunning(true)
    setActiveRequest(null)
    setStopError(null)
    const settle = (message: ChatMessage) => setMessages(prev => [...prev.slice(0, -1), message])

    try {
      window.localStorage.setItem(PENDING_REQUEST_STORAGE_KEY, clientRequestId)
      const result = await sendAgentChatInstruction({
        instruction,
        clientRequestId,
        onRequest: updateRequest,
        onStatus: (status) => {
          setMessages(prev => prev.map((message, index) =>
            index === prev.length - 1 && message.role === "thinking"
              ? { ...message, status: taskStatusLabel(status) }
              : message))
        },
      })

      if (!result.ok) {
        settle(failureMessage(result.failure, { instruction, clientRequestId }))
        return
      }

      const navigation = extractConciergeNavigation(result.actionsPerformed)
      if (navigation) navigateConcierge(navigation)

      settle({
        role: "agent",
        summary: result.summary,
        actions: result.actionsPerformed,
        timestamp: new Date(),
        awaitingApproval: result.awaitingApproval,
      })
    } catch (error) {
      settle(failureMessage(requestFailureMessage(error), { instruction, clientRequestId }))
    } finally {
      window.localStorage.removeItem(PENDING_REQUEST_STORAGE_KEY)
      setIsRunning(false)
      textareaRef.current?.focus()
    }
  }, [navigateConcierge, updateRequest])

  const sendInstruction = useCallback(async (text: string, options: SendInstructionOptions = {}) => {
    const trimmed = text.trim()
    const displayText = (options.displayText ?? text).trim()
    if (!trimmed || !displayText || isRunning) return

    setMessages(prev => [
      ...prev,
      { role: "user", text: displayText, timestamp: new Date() },
      { role: "thinking" },
    ])
    await runInstruction({ instruction: trimmed, clientRequestId: crypto.randomUUID() })
  }, [isRunning, runInstruction])

  // Sends the latest failed instruction again under its first identity, so work
  // the first attempt already started is picked up, never run twice.
  const handleRetry = useCallback(async () => {
    const failed = messages.at(-1)
    if (isRunning || failed?.role !== "failure" || failed.recovery?.kind !== "retry") return
    const { instruction, clientRequestId } = failed.recovery
    setMessages(prev => [...prev.slice(0, -1), { role: "thinking" }])
    await runInstruction({ instruction, clientRequestId })
  }, [isRunning, messages, runInstruction])

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
    handleRetry,
    handleSend,
    handleSendText,
    initial,
    input,
    isRunning,
    canStop: canStopAgentRequest(activeRequest),
    isStopping: stopBusy || (isRunning && !!activeRequest?.cancelledAt),
    stopError,
    handleStop,
    messages,
    setInput,
    textareaRef,
  }
}

export type AgentChatState = ReturnType<typeof useAgentChatState>
