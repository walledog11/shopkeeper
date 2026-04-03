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
    <div className="px-5 pb-5 pt-4 bg-white border-t border-slate-100 shrink-0">

      <div className={`border rounded-md overflow-hidden transition-colors ${
        error
          ? 'border-red-200'
          : isClerkMode
            ? 'border-violet-500 focus-within:border-violet-600 bg-white'
            : isNoteMode
              ? 'border-amber-400 focus-within:border-amber-500 bg-gradient-to-b from-amber-50/70 to-amber-50/30'
              : isNote
                ? 'border-violet-200 focus-within:border-violet-400 bg-white'
                : 'border-slate-200 focus-within:border-slate-400 bg-white'
      }`}>
        <div className="flex items-baseline gap-2 px-4 pt-3.5 pb-2 min-h-[48px]">
          {isClerkMode && (
            <span className="inline-flex items-center gap-1 bg-violet-100 text-violet-700 text-[11px] font-semibold px-2.5 py-[5px] rounded-full shrink-0">
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
            className="flex-1 w-0 bg-transparent resize-none outline-none text-sm text-slate-900 placeholder:text-slate-400 disabled:opacity-60"
            placeholder={isNoteMode ? 'Add a note for your team…' : placeholder ?? (isClerkMode ? `What should ${agentName} do?` : isNote ? 'Add a private note for your team…' : `Reply to ${customerName}…`)}
          />
        </div>
        <div className="flex justify-between items-center px-3 pb-2.5">
          {isNoteMode && onCancelNote ? (
            <button
              onClick={onCancelNote}
              className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-slate-600 transition-colors"
            >
              Cancel note
            </button>
          ) : onAddNote ? (
            <button
              onClick={onAddNote}
              className="flex items-center gap-1 text-[11px] font-semibold text-amber-600 hover:text-amber-700 transition-colors"
            >
              <StickyNote className="w-3 h-3" />
              Add note
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-300 hidden sm:block">↵ to send</span>
            <button
              disabled={!value.trim() || isSending}
              onClick={() => onSend(isNote)}
              className={`flex items-center gap-1.5 text-xs font-semibold disabled:bg-slate-100 disabled:text-slate-400 h-8 px-4 rounded-md transition-colors ${
                isClerkMode
                  ? 'bg-violet-600 text-white hover:bg-violet-700'
                  : isNoteMode
                    ? 'bg-amber-500 text-white hover:bg-amber-600'
                    : 'bg-slate-900 text-white hover:bg-slate-700'
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
        <p className="mt-1.5 text-[11px] text-red-500 font-medium px-1">{error}</p>
      )}
    </div>
  )
}
