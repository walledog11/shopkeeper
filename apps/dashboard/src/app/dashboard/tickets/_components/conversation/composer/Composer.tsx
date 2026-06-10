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

  return (
    <div className="bg-background border-t border-border shrink-0 pb-[max(0rem,env(safe-area-inset-bottom))]">
      {/* Tabs */}
      <div className="flex items-center gap-1 px-5 border-b border-border">
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
            <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-xs font-bold ${
              isNoteTab ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/[0.08] text-white/35'
            }`}>
              {noteCount}
            </span>
          )}
        </TabButton>
      </div>

      {igWindowExpired && (
        <div className="mx-5 mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Instagram only allows replies within 24 hours of the customer&apos;s last message. Wait
          for them to message again before you can reply here.
        </div>
      )}

      <div className="relative px-5 pt-3">
        <div className="flex items-start gap-2">
          {isAgentMode && (
            <span className="inline-flex items-center gap-1 bg-violet-500/15 text-violet-400 text-xs font-semibold px-2.5 py-[5px] rounded-full shrink-0 mt-0.5">
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
            className="flex-1 w-0 min-h-[85px] max-h-[40vh] overflow-y-auto bg-transparent resize-none outline-none text-base md:text-sm text-white/80 placeholder:text-white/30 disabled:opacity-50"
            placeholder={placeholder}
          />
        </div>

        <div className="flex items-center justify-between pt-3 pb-3">
          <div />
          <div className="flex items-center gap-3">
            {isEmailLike && senderEmail && !isNoteTab && !isAgentMode && (
              <span className="text-xs text-white/40 hidden sm:block">
                Replies as <span className="font-semibold text-white/70">{senderEmail}</span>
              </span>
            )}
            <button type="button"
              data-testid="reply-composer-send"
              disabled={sendDisabled}
              onClick={() => onSend(isNoteTab)}
              className={`flex items-center gap-2 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed h-8 pl-3 pr-2 rounded-md transition-colors ${
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
                  <kbd className="hidden md:inline bg-black/25 text-white/80 text-xs font-semibold rounded px-1.5 py-0.5 leading-none">
                    ⌘↵
                  </kbd>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
      {error && (
        <p className="mt-1 mb-2 text-xs text-red-400 font-medium px-5">{error}</p>
      )}
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
      className={`relative inline-flex items-center text-sm font-semibold px-3 py-2 transition-colors ${
        active ? 'text-white' : 'text-white/35 hover:text-white/60'
      }`}
    >
      {children}
      {active && (
        <span className="absolute left-2 right-2 -bottom-px h-0.5 bg-emerald-500 rounded-t-sm" />
      )}
    </button>
  )
}
