import { Loader2, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import type { KeyboardEvent } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatClockTime } from "@/lib/format/date"
import { cn } from "@/lib/ui/cn"
import AgentAvatar from "@/components/agent/AgentAvatar"
import AgentPanelBriefing from "@/app/dashboard/_components/agent-panel/AgentPanelBriefing"
import AgentPanelPendingLedger from "@/app/dashboard/_components/agent-panel/AgentPanelPendingLedger"
import AgentPanelTelegramNudge from "@/app/dashboard/_components/agent-panel/AgentPanelTelegramNudge"
import type { AgentPanelOpenContext } from "@/lib/agent/panel"
import { WalkthroughCard, WalkthroughNote } from "@/components/agent/WalkthroughBriefing"
import type { PanelSuggestionChip } from "@/lib/agent/panel-briefing"
import { AgentChatComposer } from "./AgentChatComposer"
import { AgentChatMessage } from "./AgentChatMessage"
import { useAgentWalkthrough } from "./useAgentWalkthrough"
import { messageKey, type AgentChatState } from "./useAgentChatState"

export interface AgentChatClientProps {
  agentName: string
  compact?: boolean
  embedded?: boolean
  headerSearchMode?: boolean
  onClose?: () => void
  restoreHistory?: boolean
  openContext?: AgentPanelOpenContext | null
}

export function AgentChatView({
  agentName,
  compact,
  embedded,
  headerSearchMode,
  onClose,
  openContext,
  state,
}: Omit<AgentChatClientProps, "restoreHistory"> & { state: AgentChatState }) {
  const {
    fillerPhrase,
    firstName,
    greeting,
    handleClearPanel,
    handleSendText,
    initial,
    input,
    isRunning,
    messages,
    messagesEndRef,
    setInput,
    textareaRef,
  } = state

  const [showStartFreshConfirm, setShowStartFreshConfirm] = useState(false)
  const walkthrough = openContext?.walkthrough ?? null
  // The bottom-anchored layout belongs to the briefing. A walkthrough fills the
  // panel from the top, and no longer pads itself with chat lines to get there.
  const isEmptyBriefing = messages.length === 0 && !walkthrough && (compact || embedded) && !headerSearchMode

  const {
    buildWalkthroughInstruction,
    currentWalkthroughItem,
    decisionNotes,
    handleWalkthroughDecision,
    walkthroughClosing,
    walkthroughIndex,
    walkthroughItems,
    walkthroughOpening,
  } = useAgentWalkthrough({ walkthrough })

  // An instruction carried in from another surface lands in the composer rather
  // than sending itself — the merchant still chooses when to send.
  const seededInstructionRef = useRef<string | null>(null)
  useEffect(() => {
    const instruction = openContext?.instruction?.trim()
    if (!instruction || seededInstructionRef.current === instruction) return
    seededInstructionRef.current = instruction
    setInput(instruction)
    textareaRef.current?.focus()
  }, [openContext?.instruction, setInput, textareaRef])

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

  const scrollAreaClass = headerSearchMode
    ? "min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pt-2 pb-2 space-y-2"
    : "min-h-0 flex-1 overflow-y-auto overflow-x-hidden"

  const defaultScrollInnerClass = `px-5 md:px-6 ${
    compact
      ? `pb-6 ${onClose ? "pt-14" : "pt-4"}`
      : "py-6"
  } ${isEmptyBriefing ? "flex min-h-full flex-col justify-end" : "space-y-6"}`

  const messageBody = (
    <>
      {!walkthrough && !headerSearchMode && (
        <div className={isEmptyBriefing ? "mb-8" : undefined}>
          <AgentPanelPendingLedger />
        </div>
      )}

      {messages.length === 0 && !compact && !embedded && (
        <div className="max-w-xl mx-auto">
          <div className="bg-card border border-border rounded-xl p-5">
            <AgentAvatar agentName={agentName} size="lg" className="mb-3" />
            <h2 className="text-base font-semibold text-foreground mb-1">
              {greeting}{firstName ? `, ${firstName}` : ""}.
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Ask me to look up orders, issue refunds, search your knowledge base, draft customer replies, or open any page in the dashboard.
            </p>
          </div>
        </div>
      )}

      {messages.length === 0 && (compact || embedded) && !walkthrough && !headerSearchMode && (
        <AgentPanelBriefing
          greeting={greeting}
          firstName={firstName}
          openContext={openContext}
          onChipSelect={handleChipSelect}
        />
      )}

      {messages.map((msg, index) => {
        if (msg.role === "user") {
          if (headerSearchMode) {
            return (
              <div key={messageKey(msg, index)} className="flex justify-end">
                <div className="max-w-[90%] rounded-2xl rounded-tr-sm border border-border bg-card px-3 py-2 text-sm text-foreground break-words">
                  {msg.text}
                </div>
              </div>
            )
          }

          return (
            <div key={messageKey(msg, index)} className="flex justify-end items-end gap-2.5">
              <div className="flex flex-col items-end gap-1 max-w-[70%]">
                <span className="text-xs text-muted-foreground">{formatClockTime(msg.timestamp)}</span>
                <div className="bg-card border border-border text-foreground text-sm rounded-2xl rounded-tr-sm px-4 py-2.5 shadow-sm break-words">
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
          if (headerSearchMode) {
            return (
              <div key={messageKey(msg, index)} className="w-full">
                <div className="rounded-2xl rounded-tl-sm border border-border bg-green-600/15 px-3 py-2.5">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-3.5 shrink-0 animate-spin text-foreground/45" />
                    <span>{fillerPhrase}</span>
                  </div>
                </div>
              </div>
            )
          }

          return (
            <div key={messageKey(msg, index)} className="flex items-start gap-3">
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
            key={messageKey(msg, index)}
            agentName={agentName}
            message={msg}
            isRunning={isRunning}
            hideAvatar={headerSearchMode}
            onApprove={() => void handleSendText("Yes, do it")}
            onDismiss={() => void handleSendText("No")}
          />
        )
      })}

      {walkthrough && (
        <div className="space-y-6">
          {walkthroughOpening && <WalkthroughNote agentName={agentName} text={walkthroughOpening} />}
          {decisionNotes.map((note, index) => (
            <WalkthroughNote key={`${index}-${note}`} agentName={agentName} text={note} />
          ))}
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
          {walkthroughClosing && <WalkthroughNote agentName={agentName} text={walkthroughClosing} />}
        </div>
      )}

      <div ref={messagesEndRef} />
    </>
  )

  return (
    <div className={cn(
      "w-full min-w-0",
      headerSearchMode ? "flex h-full min-h-0 flex-col" : "relative flex h-full flex-col overflow-hidden",
    )}>
      {compact && onClose && !headerSearchMode && (
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

      <div className={scrollAreaClass}>
        {headerSearchMode ? messageBody : (
          <div className={defaultScrollInnerClass}>
            {messageBody}
          </div>
        )}
      </div>

      {compact && !headerSearchMode && (
        <AgentPanelTelegramNudge
          agentName={agentName}
          enabled
          showConnectBanner={messages.length === 0 && !walkthrough}
        />
      )}

      {headerSearchMode ? (
        <AgentChatComposer
          compact={compact}
          pill
          currentWalkthroughItem={currentWalkthroughItem}
          input={input}
          isRunning={isRunning}
          onComposerKeyDown={handleComposerKeyDown}
          onSend={() => void handleSendInput()}
          onStartFresh={() => setShowStartFreshConfirm(true)}
          setInput={setInput}
          textareaRef={textareaRef}
        />
      ) : (
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
      )}

      <Dialog open={showStartFreshConfirm} onOpenChange={setShowStartFreshConfirm}>
        <DialogContent showCloseButton={false} className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Start fresh?</DialogTitle>
            <DialogDescription>
              Same person, clean slate for a new task. This just clears the panel.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setShowStartFreshConfirm(false)}>Cancel</Button>
            <Button
              size="sm"
              onClick={() => {
                setShowStartFreshConfirm(false)
                handleClearPanel()
              }}
            >
              Start fresh
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
