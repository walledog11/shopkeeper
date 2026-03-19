"use client"

import { useState, useRef, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Image from "next/image"
import { Bot, ArrowLeft, Sparkles, Send, Clock, CheckCircle2, RefreshCw } from "lucide-react"
import { useOpenThreads } from '@/hooks/useOpenThreads'
import { formatTime } from '@/lib/utils'
import type { Thread, Message, Ticket } from '@/types'

const FILTERS = ["All", "Shopify", "Instagram", "TikTok", "Gmail"]

export default function InteractiveTicketsPage() {
  const [activeFilter, setActiveFilter] = useState("All")
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null) 
  const [replyText, setReplyText] = useState("")
  const [isDrafting, setIsDrafting] = useState(false)
  const [isRefreshingSummary, setIsRefreshingSummary] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  const { threads: dbThreads, error, isLoading, mutate } = useOpenThreads()

  const liveTickets: Ticket[] = dbThreads.map((thread: Thread) => {
    let platformName = "Unknown";
    let logoPath = "/logos/default.png";
    if (thread.channelType === 'ig_dm') {
      platformName = "Instagram";
      logoPath = "/logos/instagram-logo.png";
    }

    const lastMessage = thread.messages[thread.messages.length - 1];

    return {
      id: thread.id,
      platform: platformName,
      logo: logoPath,
      customer: thread.customer?.name || `Shopper_${thread.customer?.platformId.substring(0, 5)}`,
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
  })

  const filteredTickets = liveTickets.filter((ticket: Ticket) =>
    activeFilter === "All" ? true : ticket.platform === activeFilter
  )

  const activeTicket = liveTickets.find((t: Ticket) => t.id === activeTicketId)

  useEffect(() => {
    // This runs every time a new message is added OR when you click a different ticket
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [activeTicket?.messages?.length, activeTicketId])

  // --- NEW FEATURE: Optimistic Sending ---
  const handleSendMessage = async () => {
    if (!replyText.trim() || !activeTicketId) return;

    const textToSend = replyText;
    setReplyText(""); 

    // 1. Create a fake message bubble mimicking the database structure
    const optimisticMessage: Message = {
      id: `temp-${Date.now()}`,
      threadId: activeTicketId,
      senderType: 'agent',
      contentText: textToSend,
      mediaUrl: null,
      sentAt: new Date().toISOString()
    };

    // 2. Instantly update the SWR cache so the UI re-renders immediately
    const optimisticData = dbThreads.map((thread: Thread) => {
      if (thread.id === activeTicketId) {
        return { ...thread, messages: [...thread.messages, optimisticMessage] };
      }
      return thread;
    });
    // `false` tells SWR not to re-fetch from the server immediately, holding our fake data
    await mutate(optimisticData, false);

    try {
      // 3. Fire the real request to the server in the background
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: activeTicketId,
          text: textToSend
        })
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);

      // 4. Force SWR to fetch the real data once the server is done to get the real DB IDs
      mutate();
    } catch (error) {
      console.error("Failed to send message", error);
      // Restore the failed message text so the user can retry
      setReplyText(textToSend);
      mutate();
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

      if (data.draft) {
        setReplyText(data.draft);
      } else {
        setReplyText("Failed to generate draft. Please try typing manually.");
      }
    } catch (error) {
      console.error("AI Draft Error:", error);
      setReplyText("Failed to generate draft. Please try typing manually.");
    } finally {
      setIsDrafting(false);
    }
  }

  // --- NEW FEATURE: Refresh AI Summary ---
  const handleRefreshSummary = async () => {
  if (!activeTicketId) return;
  setIsRefreshingSummary(true);

  try {
    const response = await fetch('/api/ai/summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: activeTicketId }),
    });
    
    // Parse the response so we can read the error message if it failed
    const data = await response.json();

    if (!response.ok) {
      console.error("Backend Error:", data.error);
      alert(`Clerk Error: ${data.error || 'Check the console'}`);
      return;
    }
    
    // --- OPTIMISTIC UI UPDATE ---
    // Instantly inject the new summary into the UI without waiting for a database re-fetch
    if (data.summary) {
      const optimisticData = dbThreads.map((thread: Thread) => {
        if (thread.id === activeTicketId) {
          return { ...thread, aiSummary: data.summary };
        }
        return thread;
      });
      await mutate(optimisticData, false);
    } else {
      // Fallback: force SWR to fetch fresh data
      mutate();
    }

  } catch (error) {
    console.error("Network error:", error);
    alert("Network error: Failed to reach the AI endpoint.");
  } finally {
    setIsRefreshingSummary(false);
  }
};

  if (isLoading) {
    return (
      <div className="flex h-full min-h-[600px] w-full items-center justify-center bg-white rounded-[2rem] border border-slate-200">
        <div className="text-slate-500 font-bold animate-pulse">Loading Clerk Inbox...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full min-h-[600px] w-full items-center justify-center bg-white rounded-[2rem] border border-red-200">
        <div className="text-red-500 font-bold">Failed to connect to database.</div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-[600px] w-full overflow-hidden bg-white rounded-[2rem] border border-slate-200">
      
      {/* LEFT COLUMN: Ticket List */}
      <div className={`
        w-full md:w-1/3 md:min-w-[340px] md:max-w-[420px] border-r border-slate-200 flex-col bg-slate-50
        ${activeTicketId ? 'hidden md:flex' : 'flex'}
      `}>
        <div className="p-6 border-b border-slate-200 bg-white">
          <h2 className="text-2xl font-extrabold tracking-tight mb-4 text-slate-900">Inbox</h2>
          
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {FILTERS.map((filter) => (
              <Badge 
                key={filter}
                variant={activeFilter === filter ? "default" : "secondary"}
                className={`cursor-pointer whitespace-nowrap px-3 py-1 font-bold ${
                  activeFilter === filter 
                    ? "bg-slate-900 text-white hover:bg-slate-800" 
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
                onClick={() => setActiveFilter(filter)}
              >
                {filter}
              </Badge>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
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
              {activeTicketId === ticket.id && (
                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-yellow-500" />
              )}
              <CardContent className="py-1 pl-5 mt-4">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 relative flex-shrink-0">
                       <Image src={ticket.logo} fill alt={ticket.platform} className="object-contain" />
                    </div>
                    <span className="font-extrabold text-sm text-slate-900">{ticket.customer}</span>
                  </div>
                  <span className="text-xs font-bold text-slate-400">{ticket.time}</span>
                </div>
                <p className="text-sm font-bold text-slate-700 mb-1">{ticket.subject}</p>
                <p className="text-xs font-medium text-slate-500 line-clamp-1 mb-3">
                  {ticket.preview}
                </p>
                <Badge variant="outline" className={`text-[10px] font-extrabold uppercase tracking-wider border ${ticket.tagColor}`}>
                  {ticket.tag}
                </Badge>
              </CardContent>
            </Card>
          ))}
          
          {filteredTickets.length === 0 && (
              <div className="text-center p-8 text-slate-400 font-bold text-sm">
                  No open tickets.
              </div>
          )}
        </div>
      </div>

      {/* RIGHT PANE: Conversation & AI Workspace */}
      <div className={`
        flex-1 flex-col bg-white
        ${!activeTicketId ? 'hidden md:flex' : 'flex'}
      `}>
        {activeTicket ? (
          <>
            {/* Chat Header */}
            <div className="h-20 border-b border-slate-200 flex items-center justify-between px-6 bg-white z-10">
              <div className="flex items-center gap-4">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="md:hidden shrink-0 -ml-2 text-slate-500" 
                  onClick={() => setActiveTicketId(null)}
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <div>
                  <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">
                    {activeTicket.customer}
                  </h3>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-1">
                    via {activeTicket.platform}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="hidden sm:flex items-center gap-2 font-bold border-slate-200">
                  <Clock className="w-4 h-4" /> Snooze
                </Button>
                <Button size="sm" className="bg-slate-900 hover:bg-slate-800 text-white font-bold items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> Resolve
                </Button>
              </div>
            </div>

            {/* Chat Body */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8 bg-slate-50/50">
              
              {/* --- UPDATED: Interactive AI Summary Box --- */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-5 relative group">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-yellow-200 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-yellow-700" />
                    </div>
                    <h4 className="text-sm font-extrabold text-yellow-900">Clerk Context</h4>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7 text-yellow-700 hover:bg-yellow-200 hover:text-yellow-900 rounded-full"
                    onClick={handleRefreshSummary}
                    disabled={isRefreshingSummary}
                    title="Refresh AI Summary"
                  >
                    <RefreshCw className={`w-4 h-4 ${isRefreshingSummary ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
                <p className="text-sm font-medium text-yellow-800 leading-relaxed">
                  {activeTicket.aiSummary}
                </p>
              </div>

              {/* Message Thread */}
              <div className="space-y-6">
                {activeTicket.messages.map((msg: any, i: number) => (
                  <div key={i} className={`flex flex-col gap-1.5 ${msg.sender === 'agent' ? 'items-end' : 'items-start'}`}>
                    <div className={`p-4 text-sm max-w-[85%] md:max-w-[75%] font-medium leading-relaxed ${
                      msg.sender === 'agent' 
                        ? 'bg-slate-900 text-white rounded-[1.5rem] rounded-tr-sm' 
                        : 'bg-white border border-slate-200 text-slate-900 rounded-[1.5rem] rounded-tl-sm'
                    }`}>
                      {msg.text}
                    </div>
                    <span className="text-[11px] font-bold text-slate-400 mx-2 uppercase tracking-wide">{msg.time}</span>
                  </div>
                ))}
              </div>
              <div ref={messagesEndRef} />
            </div>

            {/* Flat, structured Composer */}
            <div className="p-4 bg-white border-t border-slate-200">
              <div className="border border-slate-200 rounded-2xl bg-white focus-within:ring-2 focus-within:ring-yellow-500/20 focus-within:border-yellow-500 overflow-hidden">
                <textarea 
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="w-full min-h-[100px] p-4 bg-transparent resize-none outline-none text-sm font-medium text-slate-900 placeholder:text-slate-400" 
                  placeholder={`Reply to ${activeTicket.customer}...`}
                />
                
                <div className="flex justify-between items-center p-3 bg-slate-50 border-t border-slate-200">
                  <Button 
                    onClick={handleAiDraft} 
                    disabled={isDrafting}
                    variant="ghost" 
                    size="sm" 
                    className="text-yellow-700 hover:text-yellow-800 hover:bg-yellow-100 font-bold disabled:opacity-50"
                  >
                    <Bot className={`w-4 h-4 mr-2 ${isDrafting ? 'animate-pulse' : ''}`} />
                    <span className="hidden sm:inline">
                      {isDrafting ? 'Drafting...' : 'Draft with Clerk'}
                    </span>
                    <span className="sm:hidden">Draft</span>
                  </Button>
                  
                  <Button 
                    size="sm" 
                    disabled={!replyText.trim()}
                    onClick={handleSendMessage}
                    className="font-bold bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-100 disabled:text-slate-400 px-6"
                  >
                    <span className="hidden sm:inline mr-2">Send</span>
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-6 text-center">
            <Bot className="w-10 h-10 text-slate-300 mb-4" />
            <h3 className="text-xl font-extrabold text-slate-900 mb-1">Inbox Zero</h3>
            <p className="text-sm font-medium">Select a conversation to view details.</p>
          </div>
        )}
      </div>
    </div>
  )
}