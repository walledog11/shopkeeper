"use client"

import { ArrowUp, Bot, Loader2, StickyNote } from "lucide-react"
import { useComposerState } from "./composer-state"
import type { ComposerProps } from "./composer-types"

export default function Composer(props: ComposerProps) {
  const {
    agentName = "Shopkeeper",
    error,
    isAgentMode = false,
    isSending,
    noteCount,
    onClearAgentMode,
    onSend,
    value,
  } = props
  const {
    handleViewTabSelect,
    igWindowExpired,
    isEmailLike,
    isNoteTab,
    onChange,
    placeholder,
    rememberTextareaFocus,
    senderEmail,
    sendDisabled,
    textareaRef,
  } = useComposerState(props)

  const barTone = isNoteTab
    ? "border-amber-500/35 bg-amber-500/[0.06] focus-within:border-amber-500/55"
    : "border-border bg-card focus-within:border-foreground/30"

  const sendTone = isNoteTab
    ? "bg-amber-500 text-black hover:bg-amber-400"
    : "bg-foreground text-background hover:bg-foreground/90"

  return (
    <div className="bg-background shrink-0 px-4 pt-1.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
      {igWindowExpired && (
        <div className="mb-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-700">
          Instagram only allows replies within 24 hours of the customer&apos;s last message. Wait
          for them to message again before you can reply here.
        </div>
      )}

      <div className={`flex items-end gap-2 rounded-[24px] border px-2 py-1.5 shadow-sm transition-colors ${barTone}`}>
        {isAgentMode ? (
          <span className="mb-1 inline-flex shrink-0 items-center gap-1 self-center rounded-full bg-foreground/[0.07] px-2.5 py-[5px] text-xs font-semibold text-strong">
            <Bot className="size-3" />
            @{agentName.toLowerCase()}
          </span>
        ) : (
          <button
            type="button"
            aria-label={isNoteTab ? "Switch to reply" : "Switch to internal note"}
            aria-pressed={isNoteTab}
            title={isNoteTab ? "Internal note — only your team sees this" : "Add an internal note"}
            onPointerDown={rememberTextareaFocus}
            onClick={() => handleViewTabSelect(isNoteTab ? "chat" : "notes")}
            className={`relative flex size-9 shrink-0 items-center justify-center rounded-full transition-colors ${
              isNoteTab
                ? "bg-amber-500/20 text-amber-700"
                : "text-faint hover:bg-foreground/[0.06] hover:text-strong"
            }`}
          >
            <StickyNote className="size-4" />
            {!isNoteTab && noteCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-bold text-background tabular-nums">
                {noteCount}
              </span>
            )}
          </button>
        )}

        <textarea
          aria-label="Reply composer"
          data-testid="reply-composer-textarea"
          ref={textareaRef}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            // ⌘/Ctrl + Enter sends; plain Enter inserts newline (default).
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              if (!sendDisabled) onSend(isNoteTab)
              return
            }
            if (e.key === "Backspace" && value === "" && isAgentMode && onClearAgentMode) {
              e.preventDefault()
              onClearAgentMode()
            }
          }}
          disabled={isSending}
          rows={1}
          className="custom-scrollbar w-0 min-h-[36px] max-h-[40vh] flex-1 resize-none overflow-y-auto bg-transparent py-1.5 text-base leading-relaxed text-strong outline-none placeholder:text-faint disabled:opacity-50 md:text-sm"
          placeholder={placeholder}
        />

        <button
          type="button"
          data-testid="reply-composer-send"
          disabled={sendDisabled}
          onClick={() => onSend(isNoteTab)}
          aria-label={isAgentMode ? `Ask ${agentName}` : isNoteTab ? "Save note" : "Send reply"}
          className={`flex size-9 shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${sendTone}`}
        >
          {isSending ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
        </button>
      </div>

      <div className="flex min-h-[16px] items-center px-3 pt-1">
        <span className="min-w-0 truncate text-[11px] text-faint">
          {error ? (
            <span className="font-medium text-red-500">{error}</span>
          ) : isNoteTab ? (
            "Private to your team"
          ) : isAgentMode ? (
            `${agentName} replies here — only you see this`
          ) : isEmailLike && senderEmail ? (
            <>Replies as <span className="font-semibold text-muted-foreground">{senderEmail}</span></>
          ) : null}
        </span>
      </div>
    </div>
  )
}
