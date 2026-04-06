"use client"

import { Bot, Send, Loader2, Lock, StickyNote } from "lucide-react"

interface Props {
  customerName: string
  agentName?: string
  value: string
  isNote: boolean
  isClerkMode?: boolean
  isNoteMode?: boolean
  hideToggle?: boolean
  placeholder?: string
  isDrafting: boolean
  isSending: boolean
  error: string | null
  onChange: (text: string) => void
  onClearClerk?: () => void
  onSend: (isNote: boolean) => void
  onDraft: () => void
  onToggleNote?: (isNote: boolean) => void
  onAddNote?: () => void
  onCancelNote?: () => void
}

export default function Composer({
  customerName,
  agentName = "Clerk",
  value,
  isNote,
  isClerkMode = false,
  isNoteMode = false,
  hideToggle = false,
  placeholder,
  isDrafting,
  isSending,
  error,
  onChange,
  onClearClerk,
  onSend,
  onDraft,
  onToggleNote,
  onAddNote,
  onCancelNote,
}: Props) {
  return (
    <div className="px-5 pb-5 pt-4 bg-background border-t border-border shrink-0">
      <div className={`border rounded-md overflow-hidden transition-colors ${
        error
          ? 'border-red-500/40'
          : isClerkMode
            ? 'border-violet-500 focus-within:border-violet-400'
            : isNoteMode
              ? 'border-amber-400/50 focus-within:border-amber-400/80'
              : isNote
                ? 'border-violet-400/30 focus-within:border-violet-400/60'
                : 'border-white/[0.12] focus-within:border-white/[0.25]'
      }`}>
        <div className="flex items-baseline gap-2 px-4 pt-3.5 pb-2 min-h-[48px]">
          {isClerkMode && (
            <span className="inline-flex items-center gap-1 bg-violet-500/15 text-violet-400 text-[11px] font-semibold px-2.5 py-[5px] rounded-full shrink-0">
              <Bot className="w-3 h-3" />
              @{agentName.toLowerCase()}
            </span>
          )}
          <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                e.preventDefault()
                if (value.trim() && !isSending) onSend(isNote)
              }
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                const target = e.target as HTMLTextAreaElement
                const start = target.selectionStart
                const end = target.selectionEnd
                const newValue = value.substring(0, start) + '\n' + value.substring(end)
                onChange(newValue)
                setTimeout(() => {
                  target.selectionStart = start + 1
                  target.selectionEnd = start + 1
                }, 0)
              }
              if (e.key === 'Backspace' && value === '' && isClerkMode && onClearClerk) {
                e.preventDefault()
                onClearClerk()
              }
            }}
            disabled={isSending}
            className="flex-1 w-0 bg-transparent resize-none outline-none text-base md:text-sm text-white/80 placeholder:text-white/25 disabled:opacity-50"
            placeholder={isNoteMode ? 'Add a note for your team…' : placeholder ?? (isClerkMode ? `What should ${agentName} do?` : isNote ? 'Add a private note for your team…' : `Reply to ${customerName}…`)}
          />
        </div>
        <div className="flex justify-between items-center px-3 pb-2.5">
          {isNoteMode && onCancelNote ? (
            <button
              onClick={onCancelNote}
              className="flex items-center gap-1 text-[11px] font-semibold text-white/30 hover:text-white/60 transition-colors"
            >
              Cancel note
            </button>
          ) : onAddNote ? (
            <button
              onClick={onAddNote}
              className="flex items-center gap-1 text-[11px] font-semibold text-amber-400/70 hover:text-amber-400 transition-colors"
            >
              <StickyNote className="w-3 h-3" />
              Add note
            </button>
          ) : <span />}

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-white/20 hidden sm:block">↵ to send</span>
            <button
              disabled={!value.trim() || isSending}
              onClick={() => onSend(isNote)}
              className={`flex items-center gap-1.5 text-xs font-semibold disabled:bg-white/[0.06] disabled:text-white/25 h-8 px-4 rounded-md transition-colors ${
                isClerkMode
                  ? 'bg-violet-600 text-white hover:bg-violet-500'
                  : isNoteMode
                    ? 'bg-amber-500 text-white hover:bg-amber-400'
                    : 'bg-white text-black hover:bg-white/90'
              }`}
            >
              {isSending ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {isClerkMode ? 'Running…' : 'Saving…'}</>
              ) : isClerkMode ? (
                <><Bot className="w-3.5 h-3.5" /> Ask Clerk</>
              ) : isNoteMode ? (
                <><StickyNote className="w-3.5 h-3.5" /> Save note</>
              ) : isNote ? (
                <><Lock className="w-3.5 h-3.5" /> Add Note</>
              ) : (
                <><Send className="w-3.5 h-3.5" /> Send</>
              )}
            </button>
          </div>
        </div>
      </div>
      {error && (
        <p className="mt-1.5 text-[11px] text-red-400 font-medium px-1">{error}</p>
      )}
    </div>
  )
}
