"use client"

import { useState } from "react"
import Image from "next/image"
import { RefreshCw, Pencil } from "lucide-react"
import { getChannelInfo } from "@/lib/channels"
import { getCustomerName } from "@/lib/utils"
import { formatDate } from "@/lib/utils"
import type { Thread, Ticket } from "@/types"

interface Props {
  thread: Thread
  ticket: Ticket
  isRefreshingSummary: boolean
  onRefreshSummary: () => void
  onTagUpdate: (tag: string) => void
}

export default function ContextPanel({ thread, ticket, isRefreshingSummary, onRefreshSummary, onTagUpdate }: Props) {
  const channel = getChannelInfo(thread.channelType)
  const name = getCustomerName(thread.customer)
  const initials = name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
  const platformHandle = thread.customer?.platformId || '—'

  const [isEditingTag, setIsEditingTag] = useState(false)
  const [tagDraft, setTagDraft] = useState('')

  const startEditingTag = () => {
    setTagDraft(thread.tag || '')
    setIsEditingTag(true)
  }

  const saveTag = () => {
    setIsEditingTag(false)
    const trimmed = tagDraft.trim()
    if (trimmed !== (thread.tag ?? '')) {
      onTagUpdate(trimmed)
    }
  }

  return (
    <aside className="w-56 shrink-0 border-l border-slate-200 flex flex-col overflow-y-auto bg-white">

      {/* Customer identity */}
      <div className="flex flex-col items-center text-center px-4 pt-6 pb-5 border-b border-slate-100 gap-2.5">
        <div className="w-14 h-14 rounded-full overflow-hidden bg-slate-900 flex items-center justify-center text-white text-base font-bold shadow-sm shrink-0">
          {thread.customer?.profilePicUrl ? (
            <Image
              src={thread.customer.profilePicUrl}
              alt={name}
              width={56}
              height={56}
              className="w-full h-full object-cover"
            />
          ) : initials}
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900 tracking-tight leading-tight">{name}</p>
          <p className="text-[11px] text-slate-400 font-mono mt-0.5 truncate max-w-[160px]">
            {platformHandle.startsWith('@') ? platformHandle : `@${platformHandle}`}
          </p>
        </div>
        <div className="flex items-center gap-1.5 border border-slate-200 rounded-full px-2.5 py-1 bg-slate-50">
          <Image src={channel.logo} alt={channel.name} width={12} height={12} className="object-contain" />
          <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">{channel.name}</span>
        </div>
      </div>

      {/* Clerk Context */}
      <div className="px-4 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold text-yellow-600 uppercase tracking-widest">Clerk Context</p>
          <button
            onClick={onRefreshSummary}
            disabled={isRefreshingSummary}
            title="Refresh summary"
            className="text-slate-300 hover:text-slate-500 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-3 h-3 ${isRefreshingSummary ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          {ticket.aiSummary}
        </p>
      </div>

      {/* Conversation meta */}
      <div className="px-4 py-4">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Conversation</p>
        <div className="space-y-2.5">
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Topic</p>
            {isEditingTag ? (
              <input
                autoFocus
                value={tagDraft}
                onChange={e => setTagDraft(e.target.value)}
                onBlur={saveTag}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveTag()
                  if (e.key === 'Escape') setIsEditingTag(false)
                }}
                maxLength={40}
                className="mt-0.5 w-full text-xs font-medium text-slate-700 bg-slate-50 border border-slate-300 rounded px-1.5 py-0.5 outline-none focus:border-slate-500"
              />
            ) : (
              <button
                onClick={startEditingTag}
                className="mt-0.5 group flex items-center gap-1 text-xs font-medium text-slate-700 hover:text-slate-500 transition-colors text-left"
              >
                <span>{thread.tag || 'General'}</span>
                <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 text-slate-400 shrink-0" />
              </button>
            )}
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Status</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`w-1.5 h-1.5 rounded-full ${thread.status === 'open' ? 'bg-yellow-500' : 'bg-green-500'}`} />
              <span className={`text-xs font-semibold ${thread.status === 'open' ? 'text-yellow-700' : 'text-green-700'}`}>
                {thread.status.charAt(0).toUpperCase() + thread.status.slice(1)}
              </span>
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Date Ticket Opened</p>
            <p className="text-xs font-medium text-slate-700 mt-0.5">{formatDate(thread.createdAt)}</p>
          </div>
        </div>
      </div>

    </aside>
  )
}
