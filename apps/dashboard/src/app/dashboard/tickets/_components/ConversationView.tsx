"use client"

import { RefObject } from "react"
import { ArrowLeft, CheckCircle2, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import Composer from "./Composer"
import type { Ticket, SenderType } from "@/types"

interface Props {
  ticket: Ticket
  activeTab: 'open' | 'closed'
  replyText: string
  isNote: boolean
  isDrafting: boolean
  isSending: boolean
  sendError: string | null
  messagesEndRef: RefObject<HTMLDivElement | null>
  onBack: () => void
  onResolve: () => void
  onReplyChange: (text: string) => void
  onSend: (isNote: boolean) => void
  onDraft: () => void
  onToggleNote: (isNote: boolean) => void
}

export default function ConversationView({
  ticket,
  activeTab,
  replyText,
  isNote,
  isDrafting,
  isSending,
  sendError,
  messagesEndRef,
  onBack,
  onResolve,
  onReplyChange,
  onSend,
  onDraft,
  onToggleNote,
}: Props) {
  return (
    <div className="flex-1 flex flex-col min-w-0 bg-white">

      {/* Header */}
      <div className="h-16 border-b border-slate-100 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden shrink-0 -ml-2 text-slate-500 h-8 w-8"
            onClick={onBack}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="min-w-0">
            <h3 className="text-base font-bold tracking-tight text-slate-900 uppercase truncate leading-tight">
              {ticket.customer}
            </h3>
            <p className="text-[11px] text-slate-400 uppercase tracking-wider font-medium">
              via {ticket.platform}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'open' && (
            <Button
              size="sm"
              onClick={onResolve}
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
        {ticket.messages.map((msg: { sender: SenderType; text: string | null; time: string }, i: number) => {
          if (msg.sender === 'note') {
            return (
              <div key={i} className="flex justify-center">
                <div className="max-w-[85%] w-full">
                  <div className="flex items-center gap-1.5 mb-1 justify-center">
                    <Lock className="w-2.5 h-2.5 text-amber-500" />
                    <span className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide">Private Note</span>
                  </div>
                  <div className="px-4 py-3 text-sm leading-relaxed bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-center">
                    {msg.text}
                  </div>
                  <div className="text-[10px] text-slate-400 mx-1 mt-1 text-center">{msg.time}</div>
                </div>
              </div>
            )
          }

          return (
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
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      {activeTab === 'open' && (
        <Composer
          customerName={ticket.customer}
          value={replyText}
          isNote={isNote}
          isDrafting={isDrafting}
          isSending={isSending}
          error={sendError}
          onChange={onReplyChange}
          onSend={onSend}
          onDraft={onDraft}
          onToggleNote={onToggleNote}
        />
      )}
    </div>
  )
}
