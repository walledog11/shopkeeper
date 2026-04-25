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
  hideHeader?: boolean
  onClose?: () => void
  pendingPrompt?: { text: string; seq: number }
  sessionResetKey?: number
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

export default function AgentChatClient({ agentName, compact, embedded, hideHeader, onClose, pendingPrompt, sessionResetKey }: Props) {
  const { user } = useUser()
  const firstName = user?.firstName ?? "there"
  const initial = (user?.firstName?.[0] ?? user?.emailAddresses?.[0]?.emailAddress?.[0] ?? "U").toUpperCase()
  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
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
  const prevPromptSeqRef = useRef(0)
  const prevResetKeyRef = useRef(sessionResetKey ?? 0)

  const fetchSessionDetail = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/agent/sessions/${id}`)
      if (!res.ok) {
        if (res.status === 404) {
          localStorage.removeItem(SESSION_KEY)
          setSessionId(null)
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
    setSessionId(null)
    setMessages([])
    localStorage.removeItem(SESSION_KEY)
    textareaRef.current?.focus()
  }, [])

  // Restore session from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(SESSION_KEY)
    if (!stored) return
    setSessionId(stored)
    void fetchSessionDetail(stored).then((session) => {
      if (!session) return
      setMessages(
        session.messages.map((m) =>
          m.role === "user"
            ? { role: "user" as const, text: m.text, timestamp: new Date(session.createdAt) }
            : { role: "agent" as const, summary: m.text, actions: [], timestamp: new Date(session.createdAt) }
        )
      )
    })
  }, [fetchSessionDetail])

  // Trigger new session when parent increments sessionResetKey
  useEffect(() => {
    if (sessionResetKey !== undefined && sessionResetKey !== prevResetKeyRef.current) {
      prevResetKeyRef.current = sessionResetKey
      handleNewSession()
    }
  }, [sessionResetKey, handleNewSession])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Fill input when a quick prompt is selected from the sidebar
  useEffect(() => {
    if (pendingPrompt && pendingPrompt.seq !== prevPromptSeqRef.current) {
      prevPromptSeqRef.current = pendingPrompt.seq
      setInput(pendingPrompt.text)
      setTimeout(() => textareaRef.current?.focus(), 0)
    }
  }, [pendingPrompt])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || isRunning) return

    const sentAt = new Date()
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
        setSessionId(null)
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

      setSessionId(data.sessionId)
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
  }, [input, isRunning, sessionId])

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

  return (
    <div className="flex flex-col h-full">

      {/* Compact mode header (shown in slide-in panel) */}
      {compact && (
        <div className="shrink-0 h-11 flex items-center justify-between px-4 bg-card border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
              <Plus className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold text-foreground">{agentName}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleNewSession}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
            >
              New session
            </button>
            {onClose && (
              <button
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
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
              <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center mb-3">
                <Plus className="w-4 h-4 text-white" />
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
            <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
              <Plus className="w-5 h-5 text-green-500" />
            </div>
            <p className="text-xs text-muted-foreground max-w-[200px]">
              Ask {agentName} to take actions on your store.
            </p>
          </div>
        )}

        {messages.map((msg, i) => {
          if (msg.role === "user") {
            return (
              <div key={i} className="flex justify-end items-end gap-2.5">
                <div className="flex flex-col items-end gap-1 max-w-[70%]">
                  <span className="text-[10px] text-muted-foreground">{formatTime(msg.timestamp)}</span>
                  <div className="bg-card border border-border text-foreground text-sm rounded-2xl rounded-tr-sm px-4 py-2.5 shadow-sm">
                    {msg.text}
                  </div>
                </div>
                <div className="shrink-0 w-7 h-7 rounded-full bg-muted border border-border flex items-center justify-center text-xs font-semibold text-foreground mb-0.5">
                  {initial}
                </div>
              </div>
            )
          }

          if (msg.role === "thinking") {
            return (
              <div key={i} className="flex items-start gap-3">
                <div className="shrink-0 w-7 h-7 rounded-full bg-green-500 flex items-center justify-center mt-0.5">
                  <Plus className="w-4 h-4 text-white" />
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground pt-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-green-500" />
                  {fillerPhrase}
                </div>
              </div>
            )
          }

          // Agent message
          const visibleActions = msg.actions.filter(a => a.tool !== "send_reply" && a.tool !== "add_internal_note")
          return (
            <div key={i} className="flex items-start gap-3">
              <div className="shrink-0 w-7 h-7 rounded-full bg-green-500 flex items-center justify-center mt-0.5">
                <Sparkles className="w-4 h-4 text-green-800" />
              </div>
              <div className="flex-1 min-w-0 max-w-[75%]">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-foreground">{agentName}</span>
                  <span className="text-[10px] text-muted-foreground">{formatTime(msg.timestamp)}</span>
                </div>
                {visibleActions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2.5">
                    {visibleActions.map((action, j) => {
                      const isError = action.result.startsWith("Error")
                      const hint = !isError ? getToolResultHint(action.tool, action.result) : null
                      return (
                        <span
                          key={j}
                          className={`inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 ${
                            isError
                              ? "bg-red-500/10 text-red-400"
                              : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          }`}
                        >
                          {isError
                            ? <AlertCircle className="w-3 h-3 shrink-0" />
                            : <Check className="w-3 h-3 shrink-0" />
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
              <span className="hidden md:block text-[11px] text-muted-foreground whitespace-nowrap">
                Shift + ↵ for new line
              </span>
              <button
                onClick={handleSend}
                disabled={!input.trim() || isRunning}
                className="flex items-center gap-1 text-xs font-medium bg-green-600 text-white rounded-lg px-3 py-1.5 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isRunning
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <ArrowUp className="w-3.5 h-3.5" />
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
