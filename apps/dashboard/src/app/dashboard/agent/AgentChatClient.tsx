"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Bot, Send, Loader2, Plus, Check, AlertCircle, Trash2, X } from "lucide-react"
import type { ActionEntry } from "@/lib/agent/runner"
import { TOOL_LABELS } from "@/lib/agent/tools"

const SESSION_KEY = "dashboard_agent_session"

const QUICK_CHIPS = [
  "Look up all orders for [email]",
  "Find customer [email]",
  "Refund the most recent order for [email]",
  "Issue a refund for order [order number]",
  "Get order details for [order number]",
  "Update shipping address on order [order number]",
  "Cancel order [order number]",
  "Add a note to customer [email]",
]

type ChatMessage =
  | { role: "user"; text: string }
  | { role: "agent"; summary: string; actions: ActionEntry[] }
  | { role: "thinking" }

interface SessionEntry {
  id: string
  createdAt: string
  preview: string
  messages: Array<{ role: "user" | "agent"; text: string }>
}

interface Props {
  agentName: string
  compact?: boolean
  embedded?: boolean
  hideHeader?: boolean
  onClose?: () => void
  pendingPrompt?: { text: string; seq: number }
}

function formatSessionDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "long" })
  return d.toLocaleDateString([], { month: "short", day: "numeric" })
}

function ClearHistoryModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl shadow-xl px-6 py-5 w-80">
        <h3 className="text-sm font-semibold text-slate-800 mb-1">Clear all history?</h3>
        <p className="text-xs text-slate-500 mb-5">
          All past sessions will be permanently deleted and cannot be recovered.
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
          >
            Delete all
          </button>
        </div>
      </div>
    </div>
  )
}

interface SessionSidebarProps {
  sessions: SessionEntry[]
  sessionId: string | null
  isClearing: boolean
  onNewSession: () => void
  onLoadSession: (session: SessionEntry) => void
  onClearRequest: () => void
}

function SessionSidebar({ sessions, sessionId, isClearing, onNewSession, onLoadSession, onClearRequest }: SessionSidebarProps) {
  return (
    <div className="shrink-0 bg-white border-t border-slate-100 sm:border-t-0 sm:border-l flex flex-col sm:w-60 h-48 sm:h-auto">
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-100">
        <span className="text-sm font-semibold text-slate-700">History</span>
        <div className="flex items-center gap-1">
          <button
            onClick={onNewSession}
            title="New session"
            className="p-1 text-slate-400 hover:text-slate-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
          {sessions.length > 0 && (
            <button
              onClick={onClearRequest}
              disabled={isClearing}
              title="Clear all history"
              className="p-1 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-40"
            >
              {isClearing
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Trash2 className="w-4 h-4" />
              }
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {sessions.length === 0 ? (
          <p className="text-xs text-slate-400 text-center mt-6 px-4">No past sessions</p>
        ) : (
          sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => onLoadSession(s)}
              className={`w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors border-r-2 ${
                sessionId === s.id ? "border-violet-500 bg-violet-50/50" : "border-transparent"
              }`}
            >
              <div className="text-xs text-slate-400 mb-0.5">{formatSessionDate(s.createdAt)}</div>
              <div className="text-xs text-slate-600 truncate">{s.preview}</div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

export default function AgentChatClient({ agentName, compact, embedded, hideHeader, onClose, pendingPrompt }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [input, setInput] = useState("")
  const [isRunning, setIsRunning] = useState(false)
  const [sessions, setSessions] = useState<SessionEntry[]>([])
  const [isClearing, setIsClearing] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const prevPromptSeqRef = useRef(0)

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/agent/sessions")
      if (res.ok) setSessions(await res.json())
    } catch (err) {
      console.error("[AgentChat] fetchSessions failed:", err)
    }
  }, [])

  // Restore sessionId from localStorage and load session history on mount
  useEffect(() => {
    const stored = localStorage.getItem(SESSION_KEY)
    if (stored) setSessionId(stored)
    fetchSessions()
  }, [fetchSessions])

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

  const loadSession = useCallback((session: SessionEntry) => {
    setSessionId(session.id)
    localStorage.setItem(SESSION_KEY, session.id)
    setMessages(
      session.messages.map((m) =>
        m.role === "user"
          ? { role: "user" as const, text: m.text }
          : { role: "agent" as const, summary: m.text, actions: [] }
      )
    )
    textareaRef.current?.focus()
  }, [])

  const handleNewSession = useCallback(() => {
    setSessionId(null)
    setMessages([])
    localStorage.removeItem(SESSION_KEY)
    fetchSessions()
    textareaRef.current?.focus()
  }, [fetchSessions])

  const handleClearHistory = useCallback(async () => {
    setShowClearConfirm(false)
    setIsClearing(true)
    try {
      await fetch("/api/agent/sessions", { method: "DELETE" })
      setSessions([])
      setSessionId(null)
      setMessages([])
      localStorage.removeItem(SESSION_KEY)
    } finally {
      setIsClearing(false)
    }
  }, [])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || isRunning) return

    setInput("")
    setIsRunning(true)
    setMessages(prev => [
      ...prev,
      { role: "user", text },
      { role: "thinking" },
    ])

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: text, sessionId }),
      })

      const data = await res.json()

      if (!res.ok) {
        setMessages(prev => [
          ...prev.slice(0, -1),
          { role: "agent", summary: data.error ?? "Something went wrong.", actions: [] },
        ])
        return
      }

      setSessionId(data.sessionId)
      localStorage.setItem(SESSION_KEY, data.sessionId)

      setMessages(prev => [
        ...prev.slice(0, -1),
        { role: "agent", summary: data.summary, actions: data.actionsPerformed ?? [] },
      ])

      // Refresh session list after each completed turn
      fetchSessions()
    } catch {
      setMessages(prev => [
        ...prev.slice(0, -1),
        { role: "agent", summary: "Request failed. Please try again.", actions: [] },
      ])
    } finally {
      setIsRunning(false)
      textareaRef.current?.focus()
    }
  }, [input, isRunning, sessionId, fetchSessions])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  return (
    <div className="flex flex-col sm:flex-row h-full">
      {/* Main chat area */}
      <div className="flex flex-col flex-1 bg-slate-50 min-w-0">
        {/* Header */}
        {embedded ? (
          <div className="h-11 flex items-center justify-end px-5 bg-white border-b border-slate-100 shrink-0">
            <button
              onClick={handleNewSession}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New session
            </button>
          </div>
        ) : !hideHeader ? (
        <div className="h-16 flex items-center justify-between px-6 bg-white border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-violet-600 flex items-center justify-center">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-slate-800">{agentName}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleNewSession}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New session
            </button>
            {compact && onClose && (
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-full border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:border-slate-300 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        ) : null}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3 pb-16">
              <div className="w-12 h-12 rounded-full bg-violet-100 flex items-center justify-center">
                <Bot className="w-6 h-6 text-violet-600" />
              </div>
              <p className="text-slate-500 text-sm max-w-xs">
                Ask {agentName} to take actions — create orders, issue refunds, look up customers, and more.
              </p>
            </div>
          )}

          {messages.map((msg, i) => {
            if (msg.role === "user") {
              return (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[70%] bg-slate-800 text-white text-sm rounded-2xl rounded-tr-sm px-4 py-2.5">
                    {msg.text}
                  </div>
                </div>
              )
            }

            if (msg.role === "thinking") {
              return (
                <div key={i} className="flex justify-start">
                  <div className="flex items-center gap-2 bg-white border border-violet-100 text-slate-500 text-sm rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-500" />
                    Working…
                  </div>
                </div>
              )
            }

            // agent message
            const visibleActions = msg.actions.filter(a => a.tool !== "send_reply" && a.tool !== "add_internal_note")
            return (
              <div key={i} className="flex justify-start">
                <div className="max-w-[75%] bg-white border border-violet-100 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm space-y-2.5">
                  <p className="text-sm text-slate-800">{msg.summary}</p>
                  {visibleActions.length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-slate-100">
                      {visibleActions.map((action, j) => {
                        const isError = action.result.startsWith("Error")
                        return (
                          <div key={j} className="flex items-start gap-1.5 text-xs text-slate-500">
                            {isError
                              ? <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                              : <Check className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                            }
                            <span className={isError ? "text-red-500" : ""}>
                              {TOOL_LABELS[action.tool] ?? action.tool}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick action chips — full page only, not in embedded (sidebar handles prompts) */}
        {!compact && !embedded && (
          <div className="shrink-0 px-6 pt-3 pb-0">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {QUICK_CHIPS.map((chip) => (
                <button
                  key={chip}
                  onClick={() => {
                    setInput(chip)
                    textareaRef.current?.focus()
                  }}
                  className="shrink-0 text-xs bg-white border border-slate-200 hover:border-violet-300 hover:text-violet-700 text-slate-600 rounded-full px-3 py-1.5 transition-colors whitespace-nowrap"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="shrink-0 bg-white border-t border-slate-100 px-6 py-4">
          <div className="flex items-end gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus-within:border-violet-300 focus-within:ring-1 focus-within:ring-violet-200 transition-all">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isRunning}
              placeholder={`Message ${agentName}…`}
              className="flex-1 bg-transparent text-sm text-slate-800 placeholder-slate-400 resize-none outline-none min-h-[24px] max-h-40"
              style={{ fieldSizing: "content" } as React.CSSProperties}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isRunning}
              className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isRunning
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Send className="w-4 h-4" />
              }
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-2 text-center">
            Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>

      {/* Sidebar — session history (right on sm+, bottom on mobile), hidden in compact/panel mode and embedded mode */}
      {!compact && !embedded && (
        <SessionSidebar
          sessions={sessions}
          sessionId={sessionId}
          isClearing={isClearing}
          onNewSession={handleNewSession}
          onLoadSession={loadSession}
          onClearRequest={() => setShowClearConfirm(true)}
        />
      )}
      {/* Confirm clear modal */}
      {showClearConfirm && (
        <ClearHistoryModal
          onConfirm={handleClearHistory}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}
    </div>
  )
}
