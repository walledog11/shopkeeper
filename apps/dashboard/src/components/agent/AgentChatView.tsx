import { AlertCircle, ArrowUp, Check, Loader2, Plus, Sparkles, X } from "lucide-react"
import { TOOL_LABELS } from "@shopkeeper/agent/tools"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatClockTime } from "@/lib/format/date"
import { AgentMessageMarkdown } from "@/components/agent/AgentMessageMarkdown"
import type { ChatMessage } from "./agent-chat-session"
import { messageKey, type AgentChatState } from "./useAgentChatState"

export interface AgentChatClientProps {
  agentName: string
  compact?: boolean
  embedded?: boolean
  onClose?: () => void
  restoreSession?: boolean
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

function AgentMessage({
  agentName,
  message,
}: {
  agentName: string
  message: Extract<ChatMessage, { role: "agent" }>
}) {
  const visibleActions = message.actions.filter(a => a.tool !== "send_reply" && a.tool !== "add_internal_note")

  return (
    <div className="flex items-start gap-3">
      <div className="shrink-0 size-7 rounded-full bg-green-500 flex items-center justify-center mt-0.5">
        <Sparkles className="size-4 text-green-800" />
      </div>
      <div className="flex-1 min-w-0 max-w-[75%]">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-medium text-foreground">{agentName}</span>
          <span className="text-xs text-muted-foreground">{formatClockTime(message.timestamp)}</span>
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
          <AgentMessageMarkdown text={message.summary} />
        </div>
      </div>
    </div>
  )
}

export function AgentChatView({
  agentName,
  compact,
  embedded,
  onClose,
  state,
}: Omit<AgentChatClientProps, "restoreSession"> & { state: AgentChatState }) {
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
  } = state

  return (
    <div className="flex flex-col h-full">
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

      <div className="flex-1 overflow-y-auto px-5 md:px-6 py-6 space-y-6">
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
                  <span className="text-xs text-muted-foreground">{formatClockTime(msg.timestamp)}</span>
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

          return <AgentMessage key={messageKey(msg)} agentName={agentName} message={msg} />
        })}

        <div ref={messagesEndRef} />
      </div>

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
