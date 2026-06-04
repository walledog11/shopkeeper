"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useUser } from "@clerk/nextjs"
import { useFillerPhrase } from "@/hooks/useFillerPhrase"
import { ArrowUp, AlertCircle, Check, Loader2, Plus, X, Sparkles } from "lucide-react"
import type { ActionEntry } from "@/lib/agent/runner"
import { TOOL_LABELS } from "@/lib/agent/tools"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { AgentMessageMarkdown } from "@/components/agent/AgentMessageMarkdown"

const SESSION_KEY = "dashboard_agent_session"

type ChatMessage =
  | { role: "user"; text: string; timestamp: Date }
  | { role: "agent"; summary: string; actions: ActionEntry[]; timestamp: Date }
  | { role: "thinking" }

interface Props {
  agentName: string
  compact?: boolean
  embedded?: boolean
  onClose?: () => void
  restoreSession?: boolean
}

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

function getToolResultHint(tool: string, result: string): string | null {
  if (result.startsWith("Error")) return null
  const countMatch = result.match(/\b(\d+)\b/)
  if (!countMatch) return null
  const n = countMatch[1]
  const hints: Record<string, (n: string) => string> = {
    search_shopify_customers: (n) => `${n} customer${n === "1" ? "" : "s"}`,
    search_shopify_products: (n) => `${n} product${n === "1" ? "" : "s"}`,
    get_shopify_orders: (n) => `${n} order${n === "1" ? "" : "s"}`,
    search_kb: (n) => `from ${n} KB article${n === "1" ? "" : "s"}`,
  }
  return hints[tool]?.(n) ?? null
}

function messageKey(message: ChatMessage): string {
  if (message.role === "thinking") return "thinking"
  const time = message.timestamp.toISOString()
  return message.role === "user"
    ? `user-${time}-${message.text}`
    : `agent-${time}-${message.summary}`
}

function useAgentChatState({ restoreSession = true }: Pick<Props, "restoreSession">) {
  const { user } = useUser()
  const firstName = user?.firstName ?? "there"
  const initial = (user?.firstName?.[0] ?? user?.emailAddresses?.[0]?.emailAddress?.[0] ?? "U").toUpperCase()
  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [isRunning, setIsRunning] = useState(false)
  const fillerPhrase = useFillerPhrase([
    'Making it happen…',
    'Doing the thing…',
    'Almost there…',
    'Just a sec…',
    'Finishing touches…',
  ], isRunning)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sessionIdRef = useRef<string | null>(null)
  const restoreSessionRef = useRef(restoreSession)

  const fetchSessionDetail = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/agent/sessions/${id}`)
      if (!res.ok) {
        if (res.status === 404) {
          localStorage.removeItem(SESSION_KEY)
          sessionIdRef.current = null
        }
        return null
      }
      return await res.json() as { id: string; createdAt: string; messages: Array<{ role: "user" | "agent"; text: string }> }
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

  // Restore session on mount: deep-link `?session=ID` wins over localStorage.
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
            setMessages(
              fallback.messages.map((m) =>
                m.role === "user"
                  ? { role: "user" as const, text: m.text, timestamp: new Date(fallback.createdAt) }
                  : { role: "agent" as const, summary: m.text, actions: [], timestamp: new Date(fallback.createdAt) }
              )
            )
          })
        }
        return
      }
      sessionIdRef.current = session.id
      localStorage.setItem(SESSION_KEY, session.id)
      setMessages(
        session.messages.map((m) =>
          m.role === "user"
            ? { role: "user" as const, text: m.text, timestamp: new Date(session.createdAt) }
            : { role: "agent" as const, summary: m.text, actions: [], timestamp: new Date(session.createdAt) }
        )
      )
    })

    if (deepLinked) {
      params.delete("session")
      const search = params.toString()
      const newUrl = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`
      window.history.replaceState(null, "", newUrl)
    }
  }, [fetchSessionDetail])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || isRunning) return

    const sentAt = new Date()
    const sessionId = sessionIdRef.current
    setInput("")
    setIsRunning(true)
    setMessages(prev => [
      ...prev,
      { role: "user", text, timestamp: sentAt },
      { role: "thinking" },
    ])

    try {
      let res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: text, sessionId }),
      })

      if (res.status === 404 && sessionId) {
        sessionIdRef.current = null
        localStorage.removeItem(SESSION_KEY)
        res = await fetch("/api/agent/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instruction: text }),
        })
      }

      const data = await res.json()

      if (!res.ok) {
        setMessages(prev => [
          ...prev.slice(0, -1),
          { role: "agent", summary: data.error ?? "Something went wrong.", actions: [], timestamp: new Date() },
        ])
        return
      }

      sessionIdRef.current = data.sessionId
      localStorage.setItem(SESSION_KEY, data.sessionId)

      setMessages(prev => [
        ...prev.slice(0, -1),
        { role: "agent", summary: data.summary, actions: data.actionsPerformed ?? [], timestamp: new Date() },
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
  }, [input, isRunning])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const handleClearHistory = useCallback(async () => {
    setShowClearConfirm(false)
    try {
      await fetch("/api/agent/sessions", { method: "DELETE" })
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

export default function AgentChatClient({ agentName, compact, embedded, onClose, restoreSession = true }: Props) {
  const {
    fillerPhrase,
    firstName,
    greeting,
    handleClearHistory,
    handleKeyDown,
    handleNewSession,
    handleSend,
    initial,
    input,
    isRunning,
    messages,
    messagesEndRef,
    setInput,
    setShowClearConfirm,
    showClearConfirm,
    textareaRef,
  } = useAgentChatState({ restoreSession })

  return (
    <div className="flex flex-col h-full">

      {/* Compact mode header (shown in slide-in panel) */}
      {compact && (
        <div className="shrink-0 h-11 flex items-center justify-between px-4 bg-card border-b border-border">
          <div className="flex items-center gap-2">
            <div className="size-6 rounded-full bg-green-500 flex items-center justify-center">
              <Plus className="size-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold text-foreground">{agentName}</span>
          </div>
          <div className="flex items-center gap-1">
            <button type="button"
              onClick={handleNewSession}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
            >
              New session
            </button>
            {onClose && (
              <button type="button"
                onClick={onClose}
                className="size-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 md:px-6 py-6 space-y-6">

        {/* Welcome state */}
        {messages.length === 0 && !compact && !embedded && (
          <div className="max-w-xl mx-auto">
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="size-8 rounded-full bg-green-500 flex items-center justify-center mb-3">
                <Plus className="size-4 text-white" />
              </div>
              <h2 className="text-base font-semibold text-foreground mb-1">
                {greeting}, {firstName}.
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Ask me to look up orders, issue refunds, search your knowledge base, or draft customer replies.
              </p>
            </div>
          </div>
        )}

        {/* Compact empty state */}
        {messages.length === 0 && (compact || embedded) && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-2 pb-8">
            <div className="size-10 rounded-full bg-green-500/10 flex items-center justify-center">
              <Plus className="size-5 text-green-500" />
            </div>
            <p className="text-xs text-muted-foreground max-w-[200px]">
              Ask {agentName} to take actions on your store.
            </p>
          </div>
        )}

        {messages.map((msg) => {
          if (msg.role === "user") {
            return (
              <div key={messageKey(msg)} className="flex justify-end items-end gap-2.5">
                <div className="flex flex-col items-end gap-1 max-w-[70%]">
                  <span className="text-xs text-muted-foreground">{formatTime(msg.timestamp)}</span>
                  <div className="bg-card border border-border text-foreground text-sm rounded-2xl rounded-tr-sm px-4 py-2.5 shadow-sm">
                    {msg.text}
                  </div>
                </div>
                <div className="shrink-0 size-7 rounded-full bg-muted border border-border flex items-center justify-center text-xs font-semibold text-foreground mb-0.5">
                  {initial}
                </div>
              </div>
            )
          }

          if (msg.role === "thinking") {
            return (
              <div key={messageKey(msg)} className="flex items-start gap-3">
                <div className="shrink-0 size-7 rounded-full bg-green-500 flex items-center justify-center mt-0.5">
                  <Plus className="size-4 text-white" />
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground pt-1">
                  <Loader2 className="size-3.5 animate-spin text-green-500" />
                  {fillerPhrase}
                </div>
              </div>
            )
          }

          // Agent message
          const visibleActions = msg.actions.filter(a => a.tool !== "send_reply" && a.tool !== "add_internal_note")
          return (
            <div key={messageKey(msg)} className="flex items-start gap-3">
              <div className="shrink-0 size-7 rounded-full bg-green-500 flex items-center justify-center mt-0.5">
                <Sparkles className="size-4 text-green-800" />
              </div>
              <div className="flex-1 min-w-0 max-w-[75%]">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-foreground">{agentName}</span>
                  <span className="text-xs text-muted-foreground">{formatTime(msg.timestamp)}</span>
                </div>
                {visibleActions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2.5">
                    {visibleActions.map((action) => {
                      const isError = action.result.startsWith("Error")
                      const hint = !isError ? getToolResultHint(action.tool, action.result) : null
                      return (
                        <span
                          key={`${action.tool}-${action.result}`}
                          className={`inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 ${
                            isError
                              ? "bg-red-500/10 text-red-400"
                              : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          }`}
                        >
                          {isError
                            ? <AlertCircle className="size-3 shrink-0" />
                            : <Check className="size-3 shrink-0" />
                          }
                          {TOOL_LABELS[action.tool] ?? action.tool}
                          {hint && <span className="text-muted-foreground">· {hint}</span>}
                        </span>
                      )
                    })}
                  </div>
                )}
                <div className="bg-green-600/20 border border-border text-foreground text-sm rounded-2xl rounded-tl-sm pl-4 py-2.5 shadow-sm">
                  <AgentMessageMarkdown text={msg.summary} />
                </div>
              </div>
            </div>
          )
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="shrink-0 px-5 md:px-6 pt-3 pb-5 md:pb-4 space-y-2.5">
        <div className="bg-card border border-border rounded-xl px-4 pt-3 pb-3 focus-within:border-green-400/50 focus-within:ring-1 focus-within:ring-violet-400/20 transition-all">
          <textarea
            aria-label="Agent message"
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isRunning}
            placeholder="Ask about orders, draft replies, update customers…"
            className="w-full bg-transparent text-base md:text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none min-h-[40px] max-h-50"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          <div className="flex items-center justify-end mt-2.5 gap-2">
            <div className="flex items-center gap-2 shrink-0">
              <span className="hidden md:block text-xs text-muted-foreground whitespace-nowrap">
                Shift + ↵ for new line
              </span>
              <button type="button"
                onClick={handleSend}
                disabled={!input.trim() || isRunning}
                className="flex items-center gap-1 text-xs font-medium bg-green-600 text-white rounded-lg px-3 py-1.5 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isRunning
                  ? <Loader2 className="size-3.5 animate-spin" />
                  : <ArrowUp className="size-3.5" />
                }
                Send
              </button>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={showClearConfirm} onOpenChange={(open) => !open && setShowClearConfirm(false)}>
        <DialogContent showCloseButton={false} className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Clear all history?</DialogTitle>
            <DialogDescription>
              All past sessions will be permanently deleted and cannot be recovered.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setShowClearConfirm(false)}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={handleClearHistory}>Delete all</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
