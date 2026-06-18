"use client"

import type { ReactNode } from "react"
import { Bot, Loader2 } from "lucide-react"
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
    showComposerInput = true,
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

  const focusRing = isAgentMode
    ? 'focus-within:border-violet-500/45'
    : isNoteTab
      ? 'focus-within:border-amber-500/45'
      : 'focus-within:border-emerald-500/40'

  return (
    <div className="bg-background shrink-0 px-4 pt-1 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
      {igWindowExpired && showComposerInput && (
        <div className="mb-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-200">
          Instagram only allows replies within 24 hours of the customer&apos;s last message. Wait
          for them to message again before you can reply here.
        </div>
      )}

      <div className={`rounded-2xl border border-border bg-card shadow-sm overflow-hidden transition-colors ${focusRing}`}>
        {/* Tabs */}
        <div className="flex items-center gap-1 px-2.5 pt-2">
          <TabButton
            active={!isNoteTab}
            onClick={() => handleViewTabSelect('chat')}
            onPointerDown={rememberTextareaFocus}
          >
            Reply
          </TabButton>
          <TabButton
            active={isNoteTab}
            onClick={() => handleViewTabSelect('notes')}
            onPointerDown={rememberTextareaFocus}
          >
            Internal note
            {noteCount > 0 && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[11px] font-bold tabular-nums ${
                isNoteTab ? 'bg-foreground/10 text-foreground/60' : 'bg-foreground/[0.06] text-foreground/35'
              }`}>
                {noteCount}
              </span>
            )}
          </TabButton>
        </div>

        {showComposerInput ? (
          <>
            <div className="px-3.5 pt-1.5">
              <div className="flex items-start gap-2">
                {isAgentMode && (
                  <span className="inline-flex items-center gap-1 bg-violet-500/15 text-violet-400 text-xs font-semibold px-2.5 py-[5px] rounded-full shrink-0 mt-1">
                    <Bot className="size-3" />
                    @{agentName.toLowerCase()}
                  </span>
                )}
                <textarea
                  aria-label="Reply composer"
                  data-testid="reply-composer-textarea"
                  ref={textareaRef}
                  value={value}
                  onChange={e => onChange(e.target.value)}
                  onKeyDown={e => {
                    // ⌘/Ctrl + Enter sends; plain Enter inserts newline (default).
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault()
                      if (!sendDisabled) onSend(isNoteTab)
                      return
                    }
                    if (e.key === 'Backspace' && value === '' && isAgentMode && onClearAgentMode) {
                      e.preventDefault()
                      onClearAgentMode()
                    }
                  }}
                  disabled={isSending}
                  rows={2}
                  className="flex-1 w-0 min-h-[80px] max-h-[40vh] overflow-y-auto custom-scrollbar bg-transparent resize-none outline-none text-base md:text-sm leading-relaxed text-foreground/90 placeholder:text-foreground/30 disabled:opacity-50"
                  placeholder={placeholder}
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 px-3.5 pb-2.5 pt-1.5">
              <span className="min-w-0 text-xs text-foreground/40">
                {isNoteTab ? (
                  <span className="hidden sm:inline">Private to your team</span>
                ) : isEmailLike && senderEmail && !isAgentMode ? (
                  <span className="hidden sm:inline truncate">
                    Replies as <span className="font-semibold text-foreground/65">{senderEmail}</span>
                  </span>
                ) : null}
              </span>
              <button type="button"
                data-testid="reply-composer-send"
                disabled={sendDisabled}
                onClick={() => onSend(isNoteTab)}
                className={`flex items-center gap-2 shrink-0 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed h-9 pl-3.5 pr-2.5 rounded-xl transition-colors ${
                  isAgentMode
                    ? 'bg-violet-500 text-white hover:bg-violet-400'
                    : isNoteTab
                      ? 'bg-amber-500 text-black hover:bg-amber-400'
                      : 'bg-emerald-500 text-white hover:bg-emerald-400'
                }`}
              >
                {isSending ? (
                  <><Loader2 className="size-3.5 animate-spin" /> {isAgentMode ? 'Running…' : 'Sending…'}</>
                ) : (
                  <>
                    <span className="flex items-center gap-1">
                      <span className="text-sm leading-none">↑</span>
                      {isAgentMode ? `Ask ${agentName}` : isNoteTab ? 'Save note' : 'Send'}
                    </span>
                    <kbd className="hidden md:inline bg-black/25 text-foreground/80 text-xs font-semibold rounded px-1.5 py-0.5 leading-none">
                      ⌘↵
                    </kbd>
                  </>
                )}
              </button>
            </div>

            {error && (
              <p className="px-3.5 pb-2.5 -mt-1 text-xs text-red-500 font-medium">{error}</p>
            )}
          </>
        ) : null}
      </div>
    </div>
  )
}

interface TabButtonProps {
  active: boolean
  onClick: () => void
  onPointerDown?: () => void
  children: ReactNode
}

function TabButton({ active, onClick, onPointerDown, children }: TabButtonProps) {
  return (
    <button type="button"
      onClick={onClick}
      onPointerDown={onPointerDown}
      className={`inline-flex items-center text-[13px] font-semibold px-2.5 py-1.5 rounded-lg transition-colors ${
        active
          ? 'bg-foreground/[0.07] text-foreground/90'
          : 'text-foreground/40 hover:bg-foreground/[0.04] hover:text-foreground/65'
      }`}
    >
      {children}
    </button>
  )
}
