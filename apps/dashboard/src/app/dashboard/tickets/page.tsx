"use client"

import { useState, useRef, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Image from "next/image"
import { Bot, ArrowLeft, Send, Clock, CheckCircle2, RefreshCw, PanelRight } from "lucide-react"
import { useThreads } from '@/hooks/useThreads'
import { formatTime, formatDate, getCustomerName } from '@/lib/utils'
import { getChannelInfo } from '@/lib/channels'
import type { Thread, Message, Ticket } from '@/types'

const FILTERS = ["All", "Shopify", "Instagram", "TikTok", "Gmail"]

function threadToTicket(thread: Thread): Ticket {
  const channel = getChannelInfo(thread.channelType);
  const lastMessage = thread.messages[thread.messages.length - 1];
  return {
    id: thread.id,
    platform: channel.name,
    logo: channel.logo,
    customer: getCustomerName(thread.customer),
    time: lastMessage ? formatTime(lastMessage.sentAt) : 'New',
    subject: thread.tag || "New Inquiry",
    preview: lastMessage?.contentText || "No messages yet.",
    tag: thread.tag || "Support",
    tagColor: "text-blue-700 bg-blue-100 border-blue-200",
    aiSummary: thread.aiSummary || "Clerk is analyzing this conversation...",
    messages: thread.messages.map((msg) => ({
      sender: msg.senderType,
      text: msg.contentText,
      time: formatTime(msg.sentAt)
    }))
  }
}


function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center gap-3">
      <span className="text-xs text-slate-400 shrink-0">{label}</span>
      <span className="text-xs font-medium text-slate-800 text-right">{value}</span>
    </div>
  )
}

function CustomerContextPanel({
  thread,
  otherConversations,
}: {
  thread: Thread
  otherConversations: Thread[]
}) {
  const channel = getChannelInfo(thread.channelType)
  const name = getCustomerName(thread.customer)
  const initials = name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
  const platformHandle = thread.customer?.platformId || '—'
  const customerSince = thread.customer?.createdAt ? formatDate(thread.customer.createdAt) : '—'
  const threadStarted = formatDate(thread.createdAt)
  const customerMsgCount = thread.messages.filter(m => m.senderType === 'customer').length
  const agentMsgCount = thread.messages.filter(m => m.senderType === 'agent' || m.senderType === 'ai').length

  return (
    <aside className="w-64 shrink-0 border-l border-slate-100 flex flex-col overflow-y-auto bg-white">

      {/* Customer header */}
      <div className="p-5 flex flex-col items-center text-center gap-3 border-b border-slate-100">
        <div className="w-12 h-12 rounded-full bg-slate-900 flex items-center justify-center text-white text-sm font-semibold">
          {initials}
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900 leading-tight">{name}</p>
          <p className="text-[11px] text-slate-400 mt-0.5 font-mono truncate max-w-[180px]">{platformHandle}</p>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1">
          <Image src={channel.logo} alt={channel.name} width={12} height={12} className="object-contain" />
          <span className="text-[11px] font-medium text-slate-600">{channel.name}</span>
        </div>
      </div>

      {/* Conversation details */}
      <div className="p-5 border-b border-slate-100 space-y-3">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Conversation</p>
        <div className="space-y-2.5">
          <Row label="Topic" value={thread.tag || 'General'} />
          <div className="flex justify-between items-center gap-3">
            <span className="text-xs text-slate-400 shrink-0">Status</span>
            <span className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${thread.status === 'open' ? 'bg-yellow-500' : 'bg-green-500'}`} />
              <span className={`text-xs font-semibold ${thread.status === 'open' ? 'text-yellow-700' : 'text-green-700'}`}>
                {thread.status.charAt(0).toUpperCase() + thread.status.slice(1)}
              </span>
            </span>
          </div>
          <Row label="Started" value={threadStarted} />
          <Row
            label="From customer"
            value={`${customerMsgCount} message${customerMsgCount !== 1 ? 's' : ''}`}
          />
          <Row label="Replies sent" value={String(agentMsgCount)} />
        </div>
      </div>

      {/* Customer info */}
      <div className="p-5 border-b border-slate-100 space-y-3">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Customer</p>
        <div className="space-y-2.5">
          <Row label="First seen" value={customerSince} />
          <div className="flex justify-between items-center gap-2">
            <span className="text-xs text-slate-400 shrink-0">
              {thread.channelType === 'email' ? 'Email' : 'Platform ID'}
            </span>
            <span className="text-[11px] font-mono text-slate-700 truncate text-right">{platformHandle}</span>
          </div>
        </div>
      </div>

      {/* Conversation history */}
      {otherConversations.length > 0 && (
        <div className="p-5">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-3">
            History · {otherConversations.length} more
          </p>
          <div className="space-y-1">
            {otherConversations.slice(0, 4).map(t => (
              <div key={t.id} className="flex items-start justify-between gap-2 py-2 border-b border-slate-50 last:border-0">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-700 truncate">{t.tag || 'General'}</p>
                  <p className="text-[11px] text-slate-400">{formatDate(t.createdAt)}</p>
                </div>
                <span className={`text-[10px] font-semibold shrink-0 mt-0.5 ${t.status === 'open' ? 'text-yellow-600' : 'text-green-600'}`}>
                  {t.status.charAt(0).toUpperCase() + t.status.slice(1)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

    </aside>
  )
}

export default function InteractiveTicketsPage() {
  const [activeFilter, setActiveFilter] = useState("All")
  const [activeTab, setActiveTab] = useState<'open' | 'closed'>('open')
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null)
  const [replyText, setReplyText] = useState("")
  const [isDrafting, setIsDrafting] = useState(false)
  const [isRefreshingSummary, setIsRefreshingSummary] = useState(false)
  const [showSidebar, setShowSidebar] = useState(true)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { threads: openThreads, isLoading: openLoading, error, mutate: mutateOpen } = useThreads('open')
  const { threads: closedThreads, isLoading: closedLoading, mutate: mutateClosed } = useThreads('closed')

  const dbThreads = activeTab === 'open' ? openThreads : closedThreads
  const isLoading = activeTab === 'open' ? openLoading : closedLoading

  const liveTickets: Ticket[] = dbThreads.map(threadToTicket)

  const filteredTickets = liveTickets.filter((ticket: Ticket) =>
    activeFilter === "All" ? true : ticket.platform === activeFilter
  )

  const activeTicket = liveTickets.find((t: Ticket) => t.id === activeTicketId)
  const activeThread = dbThreads.find((t: Thread) => t.id === activeTicketId)

  // All loaded threads across both tabs, deduplicated by id
  const allLoadedThreads = [...openThreads, ...closedThreads].filter(
    (t, i, arr) => arr.findIndex(x => x.id === t.id) === i
  )
  const otherConversations = activeThread
    ? allLoadedThreads.filter(t => t.customerId === activeThread.customerId && t.id !== activeThread.id)
    : []

  const handleTabChange = (tab: 'open' | 'closed') => {
    setActiveTab(tab)
    setActiveTicketId(null)
    setReplyText("")
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [activeTicket?.messages?.length, activeTicketId])

  const handleSendMessage = async () => {
    if (!replyText.trim() || !activeTicketId) return;

    const textToSend = replyText;
    setReplyText("");

    const optimisticMessage: Message = {
      id: `temp-${Date.now()}`,
      threadId: activeTicketId,
      senderType: 'agent',
      contentText: textToSend,
      mediaUrl: null,
      sentAt: new Date().toISOString()
    };

    const optimisticData = openThreads.map((thread: Thread) => {
      if (thread.id === activeTicketId) {
        return { ...thread, messages: [...thread.messages, optimisticMessage] };
      }
      return thread;
    });
    await mutateOpen(optimisticData, false);

    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: activeTicketId, text: textToSend })
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      mutateOpen();
    } catch (error) {
      console.error("Failed to send message", error);
      setReplyText(textToSend);
      mutateOpen();
    }
  };

  const handleResolve = async () => {
    if (!activeTicketId) return;
    const resolvedId = activeTicketId;
    setActiveTicketId(null);
    try {
      await fetch(`/api/threads/${resolvedId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'closed' }),
      });
      mutateOpen();
      mutateClosed();
      setActiveTab('closed');
    } catch (error) {
      console.error('Failed to resolve ticket', error);
    }
  };

  const handleAiDraft = async () => {
    if (!activeTicketId) return;
    setIsDrafting(true);
    setReplyText("Clerk is thinking...");
    try {
      const res = await fetch('/api/ai/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: activeTicketId })
      });
      const data = await res.json();
      setReplyText(data.draft || "Failed to generate draft. Please try typing manually.");
    } catch (error) {
      console.error("AI Draft Error:", error);
      setReplyText("Failed to generate draft. Please try typing manually.");
    } finally {
      setIsDrafting(false);
    }
  }

  const handleRefreshSummary = async () => {
    if (!activeTicketId) return;
    setIsRefreshingSummary(true);
    try {
      const response = await fetch('/api/ai/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: activeTicketId }),
      });
      const data = await response.json();
      if (!response.ok) {
        alert(`Clerk Error: ${data.error || 'Check the console'}`);
        return;
      }
      if (data.summary) {
        const optimisticData = dbThreads.map((thread: Thread) => {
          if (thread.id === activeTicketId) return { ...thread, aiSummary: data.summary };
          return thread;
        });
        const mutateFn = activeTab === 'open' ? mutateOpen : mutateClosed;
        await mutateFn(optimisticData, false);
      } else {
        activeTab === 'open' ? mutateOpen() : mutateClosed();
      }
    } catch (error) {
      console.error("Network error:", error);
      alert("Network error: Failed to reach the AI endpoint.");
    } finally {
      setIsRefreshingSummary(false);
    }
  };

  if (isLoading && dbThreads.length === 0) {
    return (
      <div className="flex h-full min-h-[600px] w-full items-center justify-center bg-white rounded-[2rem] border border-slate-200">
        <div className="text-slate-400 text-sm animate-pulse">Loading Clerk Inbox...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full min-h-[600px] w-full items-center justify-center bg-white rounded-[2rem] border border-red-200">
        <div className="text-red-500 text-sm font-medium">Failed to connect to database.</div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-[600px] w-full overflow-hidden bg-white rounded-[2rem] border border-slate-200">

      {/* LEFT COLUMN: Ticket List */}
      <div className={`
        w-full md:w-1/3 md:min-w-[300px] md:max-w-[380px] border-r border-slate-200 flex-col bg-slate-50
        ${activeTicketId ? 'hidden md:flex' : 'flex'}
      `}>
        {/* Header */}
        <div className="p-5 border-b border-slate-200 bg-white space-y-3">
          <h2 className="text-base font-semibold text-slate-900">Inbox</h2>

          {/* Channel filters */}
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
            {FILTERS.map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`whitespace-nowrap px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  activeFilter === filter
                    ? "bg-slate-900 text-white"
                    : "bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                }`}
              >
                {filter}
              </button>
            ))}
          </div>

          {/* Open / Closed tabs */}
          <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
            <button
              onClick={() => handleTabChange('open')}
              className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === 'open'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${activeTab === 'open' ? 'bg-yellow-500' : 'bg-slate-300'}`} />
              Open
              {openThreads.length > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === 'open' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-500'}`}>
                  {openThreads.length}
                </span>
              )}
            </button>
            <button
              onClick={() => handleTabChange('closed')}
              className={`flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === 'closed'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${activeTab === 'closed' ? 'bg-green-500' : 'bg-slate-300'}`} />
              Closed
            </button>
          </div>
        </div>

        {/* Ticket list */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1.5">
          {filteredTickets.map((ticket: any) => (
            <Card
              key={ticket.id}
              onClick={() => setActiveTicketId(ticket.id)}
              className={`cursor-pointer transition-none border-none relative overflow-hidden rounded-2xl ${
                activeTicketId === ticket.id
                  ? "bg-white ring-1 ring-slate-200 shadow-sm"
                  : "bg-transparent hover:bg-white hover:ring-1 hover:ring-slate-200"
              }`}
            >
              <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                activeTab === 'closed' ? 'bg-green-400' :
                activeTicketId === ticket.id ? 'bg-yellow-400' : 'bg-transparent'
              }`} />
              <CardContent className="py-3 pl-4 pr-3">
                <div className="flex justify-between items-start mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 relative flex-shrink-0">
                      <Image src={ticket.logo} fill alt={ticket.platform} className="object-contain" />
                    </div>
                    <span className="font-semibold text-sm text-slate-900">{ticket.customer}</span>
                  </div>
                  {activeTab === 'closed' ? (
                    <span className="text-[10px] font-semibold text-green-600">Closed</span>
                  ) : (
                    <span className="text-[11px] text-slate-400">{ticket.time}</span>
                  )}
                </div>
                <p className="text-xs font-semibold text-slate-700 mb-0.5">{ticket.subject}</p>
                <p className="text-xs text-slate-400 line-clamp-1 mb-2">
                  {ticket.preview}
                </p>
                <Badge variant="outline" className={`text-[10px] font-semibold uppercase tracking-wide border ${ticket.tagColor}`}>
                  {ticket.tag}
                </Badge>
              </CardContent>
            </Card>
          ))}

          {filteredTickets.length === 0 && (
            <div className="text-center p-8 text-slate-400 text-sm">
              No {activeTab} tickets.
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANE: Conversation + Customer Context */}
      <div className={`
        flex-1 flex min-w-0 bg-white
        ${!activeTicketId ? 'hidden md:flex' : 'flex'}
      `}>
        {activeTicket ? (
          <>
            {/* Conversation column */}
            <div className="flex-1 flex flex-col min-w-0">

              {/* Chat Header */}
              <div className="h-16 border-b border-slate-100 flex items-center justify-between px-5 bg-white z-10 shrink-0">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden shrink-0 -ml-2 text-slate-500 h-8 w-8"
                    onClick={() => setActiveTicketId(null)}
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 leading-tight">
                      {activeTicket.customer}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      via {activeTicket.platform}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {activeTab === 'open' && (
                    <>
                      <Button variant="outline" size="sm" className="hidden sm:flex items-center gap-1.5 text-xs font-medium border-slate-200 h-8">
                        <Clock className="w-3.5 h-3.5" /> Snooze
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleResolve}
                        className="bg-slate-900 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-1.5 h-8"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Resolve
                      </Button>
                    </>
                  )}
                  {activeTab === 'closed' && (
                    <Badge variant="outline" className="font-semibold bg-green-50 text-green-700 border-green-200 px-2.5 py-1 text-xs">
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Closed
                    </Badge>
                  )}
                  {/* Sidebar toggle — desktop only */}
                  <button
                    onClick={() => setShowSidebar(s => !s)}
                    title="Toggle customer panel"
                    className={`hidden lg:flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${
                      showSidebar ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <PanelRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Chat Body */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-8 bg-slate-50/40">

                {/* AI Summary */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-md bg-yellow-200 flex items-center justify-center">
                        <Bot className="w-3.5 h-3.5 text-yellow-700" />
                      </div>
                      <h4 className="text-xs font-semibold text-yellow-900">Clerk Context</h4>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-yellow-600 hover:bg-yellow-200 hover:text-yellow-900 rounded-full"
                      onClick={handleRefreshSummary}
                      disabled={isRefreshingSummary}
                      title="Refresh AI Summary"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingSummary ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                  <p className="text-xs text-yellow-800 leading-relaxed">
                    {activeTicket.aiSummary}
                  </p>
                </div>

                {/* Message Thread */}
                <div className="space-y-5">
                  {activeTicket.messages.map((msg: any, i: number) => (
                    <div key={i} className={`flex flex-col gap-1 ${msg.sender === 'agent' ? 'items-end' : 'items-start'}`}>
                      <div className={`px-4 py-3 text-sm max-w-[85%] md:max-w-[75%] leading-relaxed ${
                        msg.sender === 'agent'
                          ? 'bg-slate-900 text-white rounded-2xl rounded-tr-sm'
                          : 'bg-white border border-slate-200 text-slate-900 rounded-2xl rounded-tl-sm'
                      }`}>
                        {msg.text}
                      </div>
                      <span className="text-[10px] text-slate-400 mx-2">{msg.time}</span>
                    </div>
                  ))}
                </div>
                <div ref={messagesEndRef} />
              </div>

              {/* Composer */}
              {activeTab === 'open' && (
                <div className="p-4 bg-white border-t border-slate-100 shrink-0">
                  <div className="border border-slate-200 rounded-2xl bg-white focus-within:ring-2 focus-within:ring-yellow-500/20 focus-within:border-yellow-400 overflow-hidden transition-all">
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      className="w-full min-h-[90px] p-4 bg-transparent resize-none outline-none text-sm text-slate-900 placeholder:text-slate-400"
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
                        <span className="hidden sm:inline">{isDrafting ? 'Drafting...' : 'Draft with Clerk'}</span>
                        <span className="sm:hidden">Draft</span>
                      </Button>
                      <Button
                        size="sm"
                        disabled={!replyText.trim()}
                        onClick={handleSendMessage}
                        className="text-xs font-semibold bg-slate-900 text-white hover:bg-slate-700 disabled:bg-slate-100 disabled:text-slate-400 h-8 px-4"
                      >
                        <span className="hidden sm:inline mr-1.5">Send</span>
                        <Send className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Customer context sidebar — desktop only */}
            {showSidebar && activeThread && (
              <div className="hidden lg:flex">
                <CustomerContextPanel
                  thread={activeThread}
                  otherConversations={otherConversations}
                />
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-6 text-center">
            <Bot className="w-9 h-9 text-slate-200 mb-3" />
            <h3 className="text-sm font-semibold text-slate-900 mb-1">
              {activeTab === 'open' && openThreads.length === 0 ? 'All caught up' : 'Select a conversation'}
            </h3>
            <p className="text-xs text-slate-400">
              {activeTab === 'open' && openThreads.length === 0
                ? 'No open tickets right now.'
                : 'Click a ticket on the left to view it here.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
