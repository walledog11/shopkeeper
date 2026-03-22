"use client"

import { useState, useRef, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Image from "next/image"
import { Bot, ArrowLeft, Send, CheckCircle2, RefreshCw, Inbox, Search } from "lucide-react"
import { useThreads } from '@/hooks/useThreads'
import { formatTime, formatDate, getCustomerName } from '@/lib/utils'
import { getChannelInfo } from '@/lib/channels'
import type { Thread, Message, Ticket } from '@/types'

const CHANNEL_FILTERS = [
  { id: 'Gmail',     logo: '/logos/gmail.png',           label: 'Gmail' },
  { id: 'Instagram', logo: '/logos/instagram-logo.png',  label: 'Instagram' },
  { id: 'Shopify',   logo: '/logos/shopify.svg',         label: 'Shopify' },
  { id: 'TikTok',    logo: '/logos/tiktok-logo.png',     label: 'TikTok' },
]

function threadToTicket(thread: Thread): Ticket {
  const channel = getChannelInfo(thread.channelType)
  const lastMessage = thread.messages[thread.messages.length - 1]
  return {
    id: thread.id,
    platform: channel.name,
    logo: channel.logo,
    customer: getCustomerName(thread.customer),
    time: lastMessage ? formatTime(lastMessage.sentAt) : 'New',
    subject: thread.tag || "New Inquiry",
    preview: lastMessage?.contentText || "No messages yet.",
    tag: thread.tag || "Support",
    tagColor: "text-slate-500 bg-slate-100 border-slate-200",
    aiSummary: thread.aiSummary || "Clerk is analyzing this conversation...",
    messages: thread.messages.map((msg) => ({
      sender: msg.senderType,
      text: msg.contentText,
      time: formatTime(msg.sentAt)
    }))
  }
}

// ── Right panel ────────────────────────────────────────────────────────────────

function ContextPanel({
  thread,
  ticket,
  isRefreshingSummary,
  onRefreshSummary,
}: {
  thread: Thread
  ticket: Ticket
  isRefreshingSummary: boolean
  onRefreshSummary: () => void
}) {
  const channel = getChannelInfo(thread.channelType)
  const name = getCustomerName(thread.customer)
  const initials = name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
  const platformHandle = thread.customer?.platformId || '—'

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
            <p className="text-xs font-medium text-slate-700 mt-0.5">{thread.tag || 'General'}</p>
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

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  initialOpenThreads: Thread[]
}

export default function TicketsPageClient({ initialOpenThreads }: Props) {
  const searchParams = useSearchParams()
  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'open' | 'closed'>('open')
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState("")
  const [isDrafting, setIsDrafting] = useState(false)
  const [isRefreshingSummary, setIsRefreshingSummary] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { threads: openThreads, isLoading: openLoading, error, mutate: mutateOpen } = useThreads('open', initialOpenThreads)
  const { threads: closedThreads, isLoading: closedLoading, mutate: mutateClosed } = useThreads('closed')

  const dbThreads = activeTab === 'open' ? openThreads : closedThreads
  const isLoading = activeTab === 'open' ? openLoading : closedLoading

  const liveTickets: Ticket[] = dbThreads.map(threadToTicket)

  const filteredTickets = activeFilter
    ? liveTickets.filter(t => t.platform === activeFilter)
    : liveTickets

  const activeTicket = liveTickets.find(t => t.id === activeTicketId)
  const activeThread = dbThreads.find(t => t.id === activeTicketId)

  // Pre-select thread from ?thread= query param
  useEffect(() => {
    const threadId = searchParams.get('thread')
    if (!threadId) return
    // Check open threads first
    if (openThreads.find(t => t.id === threadId)) {
      setActiveTab('open')
      setActiveTicketId(threadId)
    } else if (closedThreads.find(t => t.id === threadId)) {
      setActiveTab('closed')
      setActiveTicketId(threadId)
    }
  }, [searchParams, openThreads, closedThreads])

  const handleTabChange = (tab: 'open' | 'closed') => {
    setActiveTab(tab)
    setActiveTicketId(null)
    setReplyText("")
  }

  const toggleFilter = (id: string) =>
    setActiveFilter(prev => prev === id ? null : id)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [activeTicket?.messages?.length, activeTicketId])

  const handleSendMessage = async () => {
    if (!replyText.trim() || !activeTicketId) return
    const textToSend = replyText
    setReplyText("")

    const optimisticMessage: Message = {
      id: `temp-${Date.now()}`,
      threadId: activeTicketId,
      senderType: 'agent',
      contentText: textToSend,
      mediaUrl: null,
      sentAt: new Date().toISOString()
    }

    await mutateOpen(
      openThreads.map(t => t.id === activeTicketId
        ? { ...t, messages: [...t.messages, optimisticMessage] }
        : t),
      false
    )

    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: activeTicketId, text: textToSend })
      })
      if (!res.ok) throw new Error(`Server error: ${res.status}`)
      mutateOpen()
    } catch (err) {
      console.error("Failed to send message", err)
      setReplyText(textToSend)
      mutateOpen()
    }
  }

  const handleResolve = async () => {
    if (!activeTicketId) return
    const resolvedId = activeTicketId
    setActiveTicketId(null)
    try {
      await fetch(`/api/threads/${resolvedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'closed' }),
      })
      mutateOpen()
      mutateClosed()
      setActiveTab('closed')
    } catch (err) {
      console.error('Failed to resolve ticket', err)
    }
  }

  const handleAiDraft = async () => {
    if (!activeTicketId) return
    setIsDrafting(true)
    setReplyText("Clerk is thinking...")
    try {
      const res = await fetch('/api/ai/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: activeTicketId })
      })
      const data = await res.json()
      setReplyText(data.draft || "Failed to generate draft. Please try typing manually.")
    } catch (err) {
      console.error("AI Draft Error:", err)
      setReplyText("Failed to generate draft. Please try typing manually.")
    } finally {
      setIsDrafting(false)
    }
  }

  const handleRefreshSummary = async () => {
    if (!activeTicketId) return
    setIsRefreshingSummary(true)
    try {
      const response = await fetch('/api/ai/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: activeTicketId }),
      })
      const data = await response.json()
      if (!response.ok) {
        alert(`Clerk Error: ${data.error || 'Check the console'}`)
        return
      }
      const mutateFn = activeTab === 'open' ? mutateOpen : mutateClosed
      if (data.summary) {
        await mutateFn(dbThreads.map(t =>
          t.id === activeTicketId ? { ...t, aiSummary: data.summary } : t
        ), false)
      } else {
        mutateFn()
      }
    } catch (err) {
      console.error("Network error:", err)
      alert("Network error: Failed to reach the AI endpoint.")
    } finally {
      setIsRefreshingSummary(false)
    }
  }

  if (isLoading && dbThreads.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-white">
        <div className="text-slate-400 text-sm animate-pulse">Loading Clerk Inbox...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-white">
        <div className="text-red-500 text-sm font-medium">Failed to connect to database.</div>
      </div>
    )
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-white">

      {/* ── Col 1: Ticket list ────────────────────────────────────────────── */}
      <div className={`
        w-full md:w-72 md:min-w-[260px] md:max-w-[300px] shrink-0 border-r border-slate-200 flex-col bg-white
        ${activeTicketId ? 'hidden md:flex' : 'flex'}
      `}>
        {/* Filter bar */}
        <div className="px-3 pt-3 pb-2 border-b border-slate-100 bg-white space-y-2">
          {/* Search */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 h-9">
            <Search className="w-3.5 h-3.5 text-slate-300 shrink-0" />
            <span className="text-sm text-slate-400">Search tickets…</span>
          </div>

          {/* Open / Closed tabs */}
          <div className="flex bg-slate-100 rounded-lg p-0.5 gap-0.5">
            <button
              onClick={() => handleTabChange('open')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                activeTab === 'open'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${activeTab === 'open' ? 'bg-amber-500' : 'bg-slate-300'}`} />
              Open
              {openThreads.length > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === 'open' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500'}`}>
                  {openThreads.length}
                </span>
              )}
            </button>
            <button
              onClick={() => handleTabChange('closed')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                activeTab === 'closed'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${activeTab === 'closed' ? 'bg-green-500' : 'bg-slate-300'}`} />
              Closed
            </button>
          </div>

          {/* Channel filter — single scrollable row */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {/* All */}
            <button
              onClick={() => setActiveFilter(null)}
              className={`shrink-0 h-9 flex-1 rounded-lg border text-[11px] font-semibold transition-all ${
                activeFilter === null
                  ? 'bg-slate-900 border-slate-900 text-white'
                  : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'
              }`}
            >
              All
            </button>

            {/* Channel icon chips */}
            {CHANNEL_FILTERS.map(ch => {
              const isActive = activeFilter === ch.id
              return (
                <button
                  key={ch.id}
                  onClick={() => toggleFilter(ch.id)}
                  title={ch.label}
                  className={`shrink-0 w-8 h-8 rounded-lg border flex items-center justify-center transition-all ${
                    isActive
                      ? 'border-slate-900 ring-2 ring-slate-900/10 bg-slate-50'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Image src={ch.logo} alt={ch.label} width={16} height={16} className="object-contain" />
                </button>
              )
            })}
          </div>

          {/* Ticket count */}
          <p className="text-[11px] text-slate-400 font-medium px-0.5">
            {filteredTickets.length} ticket{filteredTickets.length !== 1 ? 's' : ''}
            {activeFilter ? ` · ${activeFilter}` : ''}
          </p>
        </div>

        {/* Ticket list */}
        <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-slate-50">
          {filteredTickets.map((ticket: any, idx: number) => {
            const ticketNumber = idx + 1
            return (
              <div
                key={ticket.id}
                onClick={() => setActiveTicketId(ticket.id)}
                className={`cursor-pointer relative px-4 py-3.5 transition-colors ${
                  activeTicketId === ticket.id
                    ? "bg-slate-50"
                    : "hover:bg-slate-50/70"
                }`}
              >
                {/* Active indicator */}
                <div className={`absolute left-0 top-0 bottom-0 w-0.5 rounded-r-full ${
                  activeTab === 'closed' ? 'bg-green-400' :
                  activeTicketId === ticket.id ? 'bg-amber-400' : 'bg-transparent'
                }`} />

                {/* Row top: channel icon + customer + time */}
                <div className="flex items-center justify-between mb-1 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-4 h-4 relative shrink-0">
                      <Image src={ticket.logo} fill alt={ticket.platform} className="object-contain" />
                    </div>
                    <span className="text-xs font-semibold text-slate-900 truncate">{ticket.customer}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 shrink-0">{ticket.time}</span>
                </div>

                {/* Subject */}
                <p className="text-[11px] font-medium text-slate-700 truncate mb-1">{ticket.subject}</p>

                {/* Preview */}
                <p className="text-[11px] text-slate-400 line-clamp-1 mb-2">{ticket.preview}</p>

                {/* Footer: status badge + ticket ID */}
                <div className="flex items-center justify-between">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    activeTab === 'closed'
                      ? 'bg-green-50 text-green-700'
                      : 'bg-amber-50 text-amber-700'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${activeTab === 'closed' ? 'bg-green-500' : 'bg-amber-500'}`} />
                    {activeTab === 'closed' ? 'Closed' : 'Open'}
                  </span>
                  <span className="text-[10px] text-slate-300 font-mono">#{ticketNumber}</span>
                </div>
              </div>
            )
          })}

          {filteredTickets.length === 0 && (
            <div className="text-center p-8 text-slate-400 text-sm">
              No {activeTab} tickets{activeFilter ? ` from ${activeFilter}` : ''}.
            </div>
          )}
        </div>
      </div>

      {/* ── Col 3 + 4: Conversation + Context panel ───────────────────────── */}
      <div className={`
        flex-1 flex min-w-0
        ${!activeTicketId ? 'hidden md:flex' : 'flex'}
      `}>
        {activeTicket && activeThread ? (
          <>
            {/* ── Col 3: Conversation ── */}
            <div className="flex-1 flex flex-col min-w-0 bg-white">

              {/* Header */}
              <div className="h-16 border-b border-slate-100 flex items-center justify-between px-6 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden shrink-0 -ml-2 text-slate-500 h-8 w-8"
                    onClick={() => setActiveTicketId(null)}
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                  <div className="min-w-0">
                    <h3 className="text-base font-bold tracking-tight text-slate-900 uppercase truncate leading-tight">
                      {activeTicket.customer}
                    </h3>
                    <p className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">
                      via {activeTicket.platform}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {activeTab === 'open' && (
                    <Button
                      size="sm"
                      onClick={handleResolve}
                      className="bg-slate-900 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-1.5 h-8"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Resolve
                    </Button>
                  )}
                  {activeTab === 'closed' && (
                    <Badge variant="outline" className="font-semibold bg-green-50 text-green-700 border-green-200 px-2.5 py-1 text-xs">
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Closed
                    </Badge>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5 bg-slate-50/40">
                {activeTicket.messages.map((msg: any, i: number) => (
                  <div key={i} className={`flex flex-col gap-1 ${msg.sender === 'agent' || msg.sender === 'ai' ? 'items-end' : 'items-start'}`}>
                    <div className={`px-4 py-3 text-sm max-w-[80%] leading-relaxed ${
                      msg.sender === 'agent' || msg.sender === 'ai'
                        ? 'bg-slate-900 text-white rounded-2xl rounded-tr-sm'
                        : 'bg-white border border-slate-200 text-slate-900 rounded-2xl rounded-tl-sm shadow-sm'
                    }`}>
                      {msg.text}
                    </div>
                    <span className="text-[10px] text-slate-400 mx-1">{msg.time}</span>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Composer */}
              {activeTab === 'open' && (
                <div className="px-4 pb-4 pt-3 bg-white border-t border-slate-100 shrink-0">
                  <div className="border border-slate-200 rounded-2xl bg-white focus-within:ring-2 focus-within:ring-yellow-500/20 focus-within:border-yellow-400 overflow-hidden transition-all">
                    <textarea
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      className="w-full min-h-[80px] p-4 bg-transparent resize-none outline-none text-sm text-slate-900 placeholder:text-slate-400"
                      placeholder={`Reply to ${activeTicket.customer}...`}
                    />
                    <div className="flex justify-between items-center px-3 py-2 bg-slate-50/80 border-t border-slate-100">
                      <Button
                        onClick={handleAiDraft}
                        disabled={isDrafting}
                        variant="ghost"
                        size="sm"
                        className="text-yellow-700 hover:text-yellow-800 hover:bg-yellow-100 font-semibold text-xs h-8 disabled:opacity-50"
                      >
                        <Bot className={`w-3.5 h-3.5 mr-1.5 ${isDrafting ? 'animate-pulse' : ''}`} />
                        {isDrafting ? 'Drafting...' : 'Draft with Clerk'}
                      </Button>
                      <Button
                        size="sm"
                        disabled={!replyText.trim()}
                        onClick={handleSendMessage}
                        className="text-xs font-semibold bg-slate-900 text-white hover:bg-slate-700 disabled:bg-slate-100 disabled:text-slate-400 h-8 px-4"
                      >
                        <Send className="w-3.5 h-3.5 mr-1.5" /> Send
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Col 4: Context panel — desktop only ── */}
            <div className="hidden lg:flex">
              <ContextPanel
                thread={activeThread}
                ticket={activeTicket}
                isRefreshingSummary={isRefreshingSummary}
                onRefreshSummary={handleRefreshSummary}
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-slate-50/60 p-6 text-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center">
              {activeTab === 'open' && openThreads.length === 0
                ? <CheckCircle2 className="w-6 h-6 text-green-400" />
                : <Inbox className="w-6 h-6 text-slate-300" />
              }
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">
                {activeTab === 'open' && openThreads.length === 0 ? 'All caught up' : 'No conversation open'}
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-[200px]">
                {activeTab === 'open' && openThreads.length === 0
                  ? 'No open tickets right now. Check back soon.'
                  : 'Select a thread from the list to start replying.'}
              </p>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
