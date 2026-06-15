import { Loader2, X } from "lucide-react"
import { useCallback, useState } from "react"
import type { KeyboardEvent } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatClockTime } from "@/lib/format/date"
import AgentAvatar from "@/app/dashboard/_components/agent-panel/AgentAvatar"
import AgentPanelBriefing from "@/app/dashboard/_components/agent-panel/AgentPanelBriefing"
import AgentPanelTelegramNudge from "@/app/dashboard/_components/agent-panel/AgentPanelTelegramNudge"
import type { AgentPanelOpenContext } from "@/lib/agent/panel"
import { WalkthroughCard } from "@/components/agent/WalkthroughBriefing"
import type { PanelSuggestionChip } from "@/lib/agent/panel-briefing"
import { AgentChatComposer } from "./AgentChatComposer"
import { AgentChatMessage } from "./AgentChatMessage"
import { useAgentWalkthrough } from "./useAgentWalkthrough"
import { messageKey, type AgentChatState } from "./useAgentChatState"

export interface AgentChatClientProps {
  agentName: string
  compact?: boolean
  embedded?: boolean
  onClose?: () => void
  restoreSession?: boolean
  openContext?: AgentPanelOpenContext | null
}

export function AgentChatView({
  agentName,
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

  const {
    buildWalkthroughInstruction,
    currentWalkthroughItem,
    handleWalkthroughDecision,
    walkthroughIndex,
    walkthroughItems,
  } = useAgentWalkthrough({
    walkthrough,
    appendAgentLine,
  })

  const handleSendInput = useCallback(async () => {
    const visibleText = input.trim()
    if (!visibleText || isRunning) return

    setInput("")
    const instruction = buildWalkthroughInstruction(visibleText)
    await handleSendText(
      instruction.text,
      instruction.displayText ? { displayText: instruction.displayText } : undefined,
    )
  }, [buildWalkthroughInstruction, handleSendText, input, isRunning, setInput])

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
            <AgentChatMessage
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

      <AgentChatComposer
        compact={compact}
        currentWalkthroughItem={currentWalkthroughItem}
        input={input}
        isRunning={isRunning}
        onComposerKeyDown={handleComposerKeyDown}
        onSend={() => void handleSendInput()}
        onStartFresh={() => setShowStartFreshConfirm(true)}
        setInput={setInput}
        textareaRef={textareaRef}
      />

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
