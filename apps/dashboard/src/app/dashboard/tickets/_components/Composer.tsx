"use client"

import { Bot, Send, Loader2, Lock, MessageSquare } from "lucide-react"

interface Props {
  customerName: string
  value: string
  isNote: boolean
  isDrafting: boolean
  isSending: boolean
  error: string | null
  onChange: (text: string) => void
  onSend: (isNote: boolean) => void
  onDraft: () => void
  onToggleNote: (isNote: boolean) => void
}

export default function Composer({
  customerName,
  value,
  isNote,
  isDrafting,
  isSending,
  error,
  onChange,
  onSend,
  onDraft,
  onToggleNote,
}: Props) {
  return (
    <div className="px-5 pb-5 pt-4 bg-white border-t border-slate-100 shrink-0">
      {/* Mode toggle */}
      <div className="flex items-center gap-1 mb-2.5">
        <button
          onClick={() => onToggleNote(false)}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
            !isNote
              ? 'bg-slate-900 text-white'
              : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
          }`}
        >
          <MessageSquare className="w-3 h-3" />
          Reply
        </button>
        <button
          onClick={() => onToggleNote(true)}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
            isNote
              ? 'bg-amber-100 text-amber-800'
              : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Lock className="w-3 h-3" />
          Note
        </button>
        {isNote && (
          <span className="ml-1 text-[10px] text-amber-600 font-medium">
            Only visible to your team
          </span>
        )}
      </div>

      <div className={`border rounded-xl overflow-hidden transition-colors ${
        error
          ? 'border-red-200'
          : isNote
            ? 'border-amber-200 focus-within:border-amber-400 bg-amber-50/40'
            : 'border-slate-200 focus-within:border-slate-400 bg-white'
      }`}>
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={isSending}
          className={`w-full min-h-[88px] px-4 pt-3.5 pb-2 bg-transparent resize-none outline-none text-sm text-slate-900 placeholder:text-slate-400 disabled:opacity-60`}
          placeholder={isNote ? 'Add a private note for your team…' : `Reply to ${customerName}…`}
        />
        <div className="flex justify-between items-center px-3 pb-2.5">
          {!isNote ? (
            <button
              onClick={onDraft}
              disabled={isDrafting || isSending}
              className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 hover:text-slate-700 transition-colors disabled:opacity-40"
            >
              <Bot className={`w-3.5 h-3.5 ${isDrafting ? 'animate-pulse' : ''}`} />
              {isDrafting ? 'Drafting…' : 'Draft with Clerk'}
            </button>
          ) : (
            <span />
          )}
          <button
            disabled={!value.trim() || isSending}
            onClick={() => onSend(isNote)}
            className={`flex items-center gap-1.5 text-xs font-semibold disabled:bg-slate-100 disabled:text-slate-400 h-8 px-4 rounded-lg transition-colors ${
              isNote
                ? 'bg-amber-600 text-white hover:bg-amber-700'
                : 'bg-[#1c3b38] text-white hover:bg-[#163230]'
            }`}
          >
            {isSending ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
            ) : isNote ? (
              <><Lock className="w-3.5 h-3.5" /> Add Note</>
            ) : (
              <><Send className="w-3.5 h-3.5" /> Send</>
            )}
          </button>
        </div>
      </div>
      {error && (
        <p className="mt-1.5 text-[11px] text-red-500 font-medium px-1">{error}</p>
      )}
    </div>
  )
}
