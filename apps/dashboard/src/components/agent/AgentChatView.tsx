import { AlertCircle, ArrowUp, Check, Loader2, Search, X } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { KeyboardEvent } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatClockTime } from "@/lib/format/date"
import { AgentMessageMarkdown } from "@/components/agent/AgentMessageMarkdown"
import AgentAvatar from "@/app/dashboard/_components/agent-panel/AgentAvatar"
import AgentPanelBriefing from "@/app/dashboard/_components/agent-panel/AgentPanelBriefing"
import AgentPanelTelegramNudge from "@/app/dashboard/_components/agent-panel/AgentPanelTelegramNudge"
import type { AgentPanelOpenContext, WalkthroughItem } from "@/lib/agent/panel"
import {
  WalkthroughCard,
  WALKTHROUGH_CLOSING,
  buildWalkthroughContextPrefix,
  buildWalkthroughOpening,
  isWalkthroughComplete,
  resolveWalkthroughDecision,
} from "@/components/agent/WalkthroughBriefing"
import type { PanelSuggestionChip } from "@/lib/agent/panel-briefing"
import {
  getToolChipLabel,
  getToolChipVariant,
  TOOL_CHIP_CLASS,
} from "@/lib/agent/tool-action-display"
import type { AutonomyTier } from "@shopkeeper/agent/settings"
import type { ChatMessage } from "./agent-chat-session"
import { messageKey, type AgentChatState } from "./useAgentChatState"

export interface AgentChatClientProps {
  agentName: string
  autonomyTier?: AutonomyTier
  compact?: boolean
  embedded?: boolean
  onClose?: () => void
  restoreSession?: boolean
  openContext?: AgentPanelOpenContext | null
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
  onApprove,
  onDismiss,
  isRunning,
}: {
  agentName: string
  message: Extract<ChatMessage, { role: "agent" }>
  onApprove: () => void
  onDismiss: () => void
  isRunning: boolean
}) {
  const visibleActions = message.actions.filter(a => a.tool !== "send_reply" && a.tool !== "add_internal_note")
  const awaitingApproval = message.awaitingApproval === true

  return (
    <div className="flex items-start gap-3">
      <AgentAvatar agentName={agentName} size="md" className="mt-0.5" />
      <div className="flex-1 min-w-0 max-w-[75%]">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-medium text-foreground">{agentName}</span>
          <span className="text-xs text-muted-foreground">{formatClockTime(message.timestamp)}</span>
        </div>
        {visibleActions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2.5">
            {visibleActions.map((action) => {
              const variant = getToolChipVariant(action)
              const hint = variant !== "error" ? getToolResultHint(action.tool, action.result) : null
              return (
                <span
                  key={`${action.tool}-${action.result}`}
                  className={`inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 ${TOOL_CHIP_CLASS[variant]}`}
                >
                  {variant === "error" && <AlertCircle className="size-3 shrink-0" />}
                  {variant === "executed" && <Check className="size-3 shrink-0" />}
                  {variant === "read" && <Search className="size-3 shrink-0 opacity-70" />}
                  {variant === "pending" && <AlertCircle className="size-3 shrink-0" />}
                  {getToolChipLabel(action)}
                  {hint && <span className="opacity-70">· {hint}</span>}
                </span>
              )
            })}
          </div>
        )}
        <div className={
          awaitingApproval
            ? "bg-amber-600/[0.07] border border-amber-600/25 text-foreground text-sm rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm"
            : "bg-green-600/20 border border-border text-foreground text-sm rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm"
        }>
          <AgentMessageMarkdown text={message.summary} />
        </div>
        {awaitingApproval && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={isRunning}
              onClick={onApprove}
              className="rounded-full bg-green-600 hover:bg-green-700 text-primary-foreground"
            >
              Send as-is
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isRunning}
              onClick={onDismiss}
              className="rounded-full"
            >
              Not now
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

export function AgentChatView({
  agentName,
  autonomyTier,
  compact,
  embedded,
  onClose,
  openContext,
  state,
}: Omit<AgentChatClientProps, "restoreSession"> & { state: AgentChatState }) {
  const {
    appendAgentLine,
    fillerPhrase,
    firstName,
    greeting,
    handleClearHistory,
    handleNewSession,
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
  } = state

  const [showStartFreshConfirm, setShowStartFreshConfirm] = useState(false)
  const isEmptyBriefing = messages.length === 0 && (compact || embedded)

  const walkthrough = openContext?.walkthrough ?? null
  const walkthroughItems = useMemo(() => walkthrough?.items ?? [], [walkthrough])
  const [walkthroughIndex, setWalkthroughIndex] = useState(0)
  const currentWalkthroughItem = walkthrough ? walkthroughItems[walkthroughIndex] ?? null : null
  const walkthroughDone = walkthrough != null && isWalkthroughComplete(walkthroughItems, walkthroughIndex)

  const openedRef = useRef(false)
  useEffect(() => {
    if (!walkthrough || openedRef.current) return
    openedRef.current = true
    appendAgentLine(buildWalkthroughOpening(walkthroughItems))
  }, [walkthrough, walkthroughItems, appendAgentLine])

  const closedRef = useRef(false)
  useEffect(() => {
    if (!walkthrough || !walkthroughDone || closedRef.current) return
    closedRef.current = true
    appendAgentLine(WALKTHROUGH_CLOSING)
  }, [walkthrough, walkthroughDone, appendAgentLine])

  const handleWalkthroughDecision = useCallback((item: WalkthroughItem, decision: "approved" | "skipped") => {
    const result = resolveWalkthroughDecision({ item, index: walkthroughIndex, decision })
    appendAgentLine(result.agentLine)
    setWalkthroughIndex(result.nextIndex)
  }, [appendAgentLine, walkthroughIndex])

  const handleSendInput = useCallback(async () => {
    const visibleText = input.trim()
    if (!visibleText || isRunning) return

    setInput("")
    if (!currentWalkthroughItem) {
      await handleSendText(visibleText)
      return
    }

    await handleSendText(
      `${buildWalkthroughContextPrefix(currentWalkthroughItem)}\n${visibleText}`,
      { displayText: visibleText },
    )
  }, [currentWalkthroughItem, handleSendText, input, isRunning, setInput])

  const handleComposerKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      void handleSendInput()
    }
  }, [handleSendInput])

  const handleChipSelect = (chip: PanelSuggestionChip) => {
    if (chip.autoSend) {
      void handleSendText(chip.prompt)
      return
    }
    setInput(chip.prompt)
    textareaRef.current?.focus()
  }

  return (
    <div className="relative flex h-full w-full min-w-0 flex-col overflow-hidden">
      {compact && onClose && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-end p-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close desk chat"
            className="pointer-events-auto size-8 rounded-full border border-border bg-background/95 backdrop-blur-sm flex items-center justify-center text-muted-foreground shadow-sm transition-colors hover:bg-background hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div
          className={`px-5 md:px-6 ${
            compact ? "pb-6 pt-14" : "py-6"
          } ${isEmptyBriefing ? "flex min-h-full flex-col justify-center" : "space-y-6"}`}
        >
        {messages.length === 0 && !compact && !embedded && (
          <div className="max-w-xl mx-auto">
            <div className="bg-card border border-border rounded-xl p-5">
              <AgentAvatar agentName={agentName} size="lg" className="mb-3" />
              <h2 className="text-base font-semibold text-foreground mb-1">
                {greeting}, {firstName}.
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Ask me to look up orders, issue refunds, search your knowledge base, or draft customer replies.
              </p>
            </div>
          </div>
        )}

        {messages.length === 0 && (compact || embedded) && !walkthrough && (
          <AgentPanelBriefing
            greeting={greeting}
            firstName={firstName}
            openContext={openContext}
            onChipSelect={handleChipSelect}
          />
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
                <AgentAvatar agentName={agentName} size="md" className="mt-0.5" />
                <div className="flex items-center gap-2 text-sm text-muted-foreground pt-1">
                  <Loader2 className="size-3.5 animate-spin text-green-500" />
                  {fillerPhrase}
                </div>
              </div>
            )
          }

          return (
            <AgentMessage
              key={messageKey(msg)}
              agentName={agentName}
              message={msg}
              isRunning={isRunning}
              onApprove={() => void handleSendText("Yes, do it")}
              onDismiss={() => void handleSendText("No")}
            />
          )
        })}

        {currentWalkthroughItem && (
          <WalkthroughCard
            key={currentWalkthroughItem.threadId}
            item={currentWalkthroughItem}
            agentName={agentName}
            position={walkthroughIndex + 1}
            total={walkthroughItems.length}
            disabled={isRunning}
            onApproved={() => handleWalkthroughDecision(currentWalkthroughItem, "approved")}
            onSkip={() => handleWalkthroughDecision(currentWalkthroughItem, "skipped")}
          />
        )}

        <div ref={messagesEndRef} />
        </div>
      </div>

      {compact && (
        <AgentPanelTelegramNudge
          agentName={agentName}
          enabled
          showConnectBanner={messages.length === 0}
        />
      )}

      <div className="shrink-0 min-w-0 px-5 md:px-6 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:pb-4">
        <div className="min-w-0 w-full rounded-xl border border-border bg-card px-4 pt-3 pb-3 transition-all focus-within:border-green-400/50 focus-within:ring-1 focus-within:ring-violet-400/20">
          <textarea
            aria-label="Agent message"
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleComposerKeyDown}
            disabled={isRunning}
            placeholder={currentWalkthroughItem
              ? "Ask about this ticket…"
              : compact
              ? "Check order #1042, draft a reply to Sarah…"
              : "Ask about orders, draft replies, update customers…"
            }
            className="w-full min-w-0 max-w-full bg-transparent text-base md:text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none min-h-[40px] max-h-50"
            style={{ fieldSizing: "content" } as React.CSSProperties}
          />
          <div className={`flex min-w-0 items-center mt-2.5 gap-2 ${compact ? "justify-between" : "justify-end"}`}>
            {compact && (
              <button
                type="button"
                onClick={() => setShowStartFreshConfirm(true)}
                disabled={isRunning}
                className="shrink-0 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Start fresh
              </button>
            )}
            <div className="flex shrink-0 items-center gap-2">
              {!compact && (
                <span className="hidden md:block text-xs text-muted-foreground whitespace-nowrap">
                  Shift + ↵ for new line
                </span>
              )}
              <button type="button"
                onClick={() => void handleSendInput()}
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

      <Dialog open={showStartFreshConfirm} onOpenChange={setShowStartFreshConfirm}>
        <DialogContent showCloseButton={false} className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Start fresh?</DialogTitle>
            <DialogDescription>
              Same person, clean slate for a new task. Your previous desk thread stays in history — this just clears the panel.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setShowStartFreshConfirm(false)}>Cancel</Button>
            <Button
              size="sm"
              onClick={() => {
                setShowStartFreshConfirm(false)
                handleNewSession()
              }}
            >
              Start fresh
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
