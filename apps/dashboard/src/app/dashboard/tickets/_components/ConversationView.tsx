"use client"

import { useState, useEffect, useRef } from "react"
import { RefObject } from "react"
import { ArrowLeft, CheckCircle2, Users, RotateCcw, MessageSquare, Bot, Check, AlertCircle, RefreshCw, StickyNote } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AnimatePresence, motion } from "motion/react"
import Composer from "./Composer"
import ActionPlanCard from "./ActionPlanCard"
import type { Ticket, SenderType, AgentTurn, AgentPlan, RawToolCall } from "@/types"

const TOOL_LABELS: Record<string, string> = {
  get_shopify_customer:         "Fetched Shopify customer",
  update_shopify_customer_info: "Updated customer info",
  get_shopify_orders:           "Fetched orders",
  get_order_by_name:            "Looked up order",
  update_shopify_order_address: "Updated shipping address",
  create_refund:                "Issued refund",
  cancel_order:                 "Cancelled order",
  add_shopify_customer_note:    "Added Shopify note",
  add_internal_note:            "Added internal note",
  send_reply:                   "Sent reply to customer",
  update_thread_status:         "Updated thread status",
  update_thread_tag:            "Updated thread tag",
}

interface Props {
  ticket: Ticket
  activeTab: 'open' | 'closed'
  agentName: string
  replyText: string
  isDrafting: boolean
  isSending: boolean
  sendError: string | null
  messagesEndRef: RefObject<HTMLDivElement | null>
  agentTurns: AgentTurn[]
  isAgentRunning: boolean
  onAgentTurnAdd: (turn: AgentTurn) => void
  onAgentRunningChange: (running: boolean) => void
  onBack: () => void
  onResolve: () => void
  onReopen: () => void
  onReplyChange: (text: string) => void
  onSend: (isNote: boolean) => void
  onDraft: () => void
  onSendNote: (text: string) => void
  onAgentComplete: (turn: AgentTurn) => void
  initialPlan?: AgentPlan | null
  onPlanCached: (plan: AgentPlan | null) => void
}

export default function ConversationView({
  ticket,
  activeTab,
  agentName,
  replyText,
  isDrafting,
  isSending,
  sendError,
  messagesEndRef,
  agentTurns,
  isAgentRunning,
  onAgentTurnAdd,
  onAgentRunningChange,
  onBack,
  onResolve,
  onReopen,
  onReplyChange,
  onSend,
  onSendNote,
  onDraft,
  onAgentComplete,
  initialPlan,
  onPlanCached,
}: Props) {
  const [viewTab, setViewTab] = useState<'chat' | 'notes'>('chat')
  const [isNoteMode, setIsNoteMode] = useState(false)
  const [pendingInstruction, setPendingInstruction] = useState<string | null>(null)
  const [pendingPlan, setPendingPlan] = useState<AgentPlan | null>(
    initialPlan === undefined ? null : initialPlan
  )
  const [isPlanLoading, setIsPlanLoading] = useState(false)     // manual @clerk trigger
  const [isAutoPlanLoading, setIsAutoPlanLoading] = useState(false) // auto trigger
  const [isPlanExecuting, setIsPlanExecuting] = useState(false)

  // Auto-plan: fire when a ticket is opened and the last chat message is from the customer
  useEffect(() => {
    if (activeTab !== 'open') return
    if (initialPlan !== undefined) return  // cache hit or confirmed miss — skip fetch

    const chatMessages = ticket.messages.filter(m => m.sender !== 'note')
    const lastMsg = chatMessages[chatMessages.length - 1]
    if (lastMsg?.sender !== 'customer') return

    setIsAutoPlanLoading(true)

    const instruction = ticket.aiSummary || "Handle this customer's latest request"

    fetch('/api/agent/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: ticket.id, instruction }),
    })
      .then(res => res.ok ? res.json() : Promise.reject())
      .then((plan: AgentPlan) => {
        const resolved = plan.steps.length > 0 ? { ...plan, instruction } : null
        if (resolved) setPendingPlan(resolved)
        onPlanCached(resolved)
      })
      .catch(() => {}) // silently fail — agent can still work manually
      .finally(() => setIsAutoPlanLoading(false))
  }, [ticket.id, activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  const chatMessages = ticket.messages.filter((m: { sender: SenderType }) => m.sender !== 'note')
  const noteMessages = ticket.messages.filter((m: { sender: SenderType }) => m.sender === 'note')
  const displayMessages = viewTab === 'chat' ? chatMessages : noteMessages
  const noteCount = noteMessages.length

  const effectiveIsNote = viewTab === 'notes'

  // @{agentName} detection
  const triggerPrefix = `@${agentName.toLowerCase()}`
  const trimmed = replyText.trimStart()
  const isClerkMode = viewTab === 'notes' && trimmed.toLowerCase().startsWith(triggerPrefix)
  const clerkInstruction = isClerkMode ? trimmed.slice(triggerPrefix.length).replace(/^ /, '') : ''

  const executeApprovedPlan = async (instruction: string, approvedToolCalls: RawToolCall[]) => {
    setPendingPlan(null)
    setPendingInstruction(instruction)
    setIsPlanExecuting(false)
    onAgentRunningChange(true)
    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: ticket.id, instruction, approvedToolCalls }),
      })
      const data = await res.json()
      const turn: AgentTurn = {
        instruction,
        actions: data.actionsPerformed ?? [],
        summary: data.summary ?? null,
        error: res.ok ? null : (data.error ?? 'Agent failed.'),
      }
      if (res.ok) {
        onAgentComplete(turn)
      } else {
        onAgentTurnAdd(turn)
      }
    } catch {
      onAgentTurnAdd({ instruction, actions: [], summary: null, error: 'Network error — please try again.' })
    } finally {
      onAgentRunningChange(false)
      setPendingInstruction(null)
    }
  }

  const handleSend = async (noteArg: boolean) => {
    if (isClerkMode && clerkInstruction) {
      const instruction = clerkInstruction
      onReplyChange('')
      setPendingInstruction(instruction)
      setIsPlanLoading(true)
      try {
        const res = await fetch('/api/agent/plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ threadId: ticket.id, instruction }),
        })
        if (!res.ok) throw new Error('Plan request failed')
        const plan: AgentPlan = await res.json()

        // Auto-skip plan screen if no external write steps
        const hasActionStep = plan.steps.some(s => s.category === 'action')
        if (!hasActionStep) {
          setIsPlanLoading(false)
          await executeApprovedPlan(instruction, plan.rawToolCalls)
        } else {
          setIsPlanLoading(false)
          setPendingInstruction(null)
          setPendingPlan({ ...plan, instruction })
        }
      } catch {
        setIsPlanLoading(false)
        setPendingInstruction(null)
        onAgentTurnAdd({ instruction, actions: [], summary: null, error: 'Failed to generate plan — please try again.' })
      }
    } else {
      // Internal tab always sends as note regardless of Composer's isNote value
      onSend(viewTab === 'notes' ? true : noteArg)
      if (viewTab === 'notes') setIsNoteMode(false)
    }
  }

  const handlePlanApprove = async (approvedToolCalls: RawToolCall[]) => {
    if (!pendingPlan) return
    setIsPlanExecuting(true)
    await executeApprovedPlan(pendingPlan.instruction, approvedToolCalls)
  }

  const handlePlanDismiss = () => {
    setPendingPlan(null)
  }

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
            <h3 className="text-[15px] font-semibold text-slate-900 truncate leading-tight">
              {ticket.customer}
            </h3>
            <p className="text-xs text-slate-400 font-medium capitalize">
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
              <CheckCircle2 className="w-3.5 h-3.5" /> Close Ticket
            </Button>
          )}
          {activeTab === 'closed' && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-semibold bg-green-50 text-green-700 border-green-200 px-2.5 py-1 text-xs">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Closed
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={onReopen}
                className="text-slate-600 border-slate-200 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1.5 h-8"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reopen
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* View tab bar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-slate-100 bg-white shrink-0">
        <button
          onClick={() => setViewTab('chat')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
            viewTab === 'chat'
              ? 'bg-slate-900 text-white'
              : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
          }`}
        >
          <MessageSquare className="w-3 h-3" />
          Conversation
        </button>
        <button
          onClick={() => setViewTab('notes')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
            viewTab === 'notes'
              ? 'bg-violet-100 text-violet-800'
              : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Users className="w-3 h-3" />
          Internal
          {noteCount > 0 && (
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
              viewTab === 'notes' ? 'bg-violet-200 text-violet-800' : 'bg-slate-100 text-slate-500'
            }`}>
              {noteCount}
            </span>
          )}
        </button>
      </div>


      {/* Messages */}
      <div className={`flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4 transition-colors ${
        viewTab === 'notes' ? 'bg-violet-50/30' : 'bg-slate-50/40'
      }`}>
        {displayMessages.length === 0 && agentTurns.length === 0 && !isAgentRunning ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3">
            {viewTab === 'notes' ? (
              <>
                <div className="w-10 h-10 rounded-md bg-violet-50 border border-violet-200 flex items-center justify-center">
                  <Users className="w-4 h-4 text-violet-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-600">No internal activity yet</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Type <span className="font-mono font-semibold text-violet-600">@{agentName.toLowerCase()}</span> to ask the AI agent, or add a note for your team.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="w-10 h-10 rounded-md bg-slate-50 border border-slate-200 flex items-center justify-center">
                  <MessageSquare className="w-4 h-4 text-slate-300" />
                </div>
                <p className="text-sm text-slate-400">No messages yet</p>
              </>
            )}
          </div>
        ) : viewTab === 'notes' ? (
          <>
            {/* DB notes — inline comment style */}
            {displayMessages.map((msg: { sender: SenderType; text: string | null; time: string; author?: string }, i: number) => (
              <div key={i} className="w-full">
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-amber-200 flex items-center justify-center shrink-0 mt-0.5 text-[11px] font-bold text-amber-700">
                    {(msg.author ?? 'Y')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5 mb-1.5">
                      <span className="text-[12px] font-semibold text-slate-700">{msg.author ?? 'You'}</span>
                      <span className="text-[11px] text-slate-400">left a note</span>
                      <span className="text-[11px] text-slate-400 ml-auto">{msg.time}</span>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg rounded-tl-sm px-3.5 py-2.5">
                      <p className="text-[13px] text-slate-700 leading-relaxed">{msg.text}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Agent turns */}
            {agentTurns.map((turn, i) => (
              <div key={`agent-${i}`} className="space-y-2">
                {/* User instruction — right aligned */}
                <div className="flex flex-col gap-1 items-end">
                  <div className="px-4 py-3.5 text-[14px] max-w-[80%] leading-relaxed bg-slate-100 text-slate-700 rounded-md rounded-tr-sm">
                    <span className="text-violet-600 font-semibold">@{agentName.toLowerCase()}</span>{' '}
                    {turn.instruction}
                  </div>
                </div>
                {/* Agent response — left aligned */}
                <div className="flex flex-col gap-1 items-start">
                  <div className="flex items-center gap-1.5 mb-0.5 ml-1">
                    <Bot className="w-3 h-3 text-violet-500" />
                    <span className="text-[11px] font-semibold text-violet-600">{agentName}</span>
                  </div>
                  <div className="px-4 py-3 max-w-[80%] bg-violet-50 border border-violet-200 rounded-md rounded-tl-sm shadow-sm space-y-2">
                    {turn.error ? (
                      <p className="text-xs text-red-500">{turn.error}</p>
                    ) : (
                      <>
                        {turn.actions.length > 0 && (
                          <div className="space-y-1">
                            {turn.actions.map((a, j) => {
                              const isErr = a.result.startsWith("Error:")
                              return (
                                <div key={j} className="flex items-center gap-1.5">
                                  {isErr
                                    ? <AlertCircle className="w-3 h-3 text-red-400 shrink-0" />
                                    : <Check className="w-3 h-3 text-green-500 shrink-0" />
                                  }
                                  <span className={`text-xs ${isErr ? 'text-red-500' : 'text-slate-500'}`}>
                                    {isErr ? a.result : (TOOL_LABELS[a.tool] ?? a.tool)}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                        {turn.summary && (
                          <p className="text-[14px] text-slate-700 leading-relaxed">{turn.summary}</p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Plan loading indicator */}
            {isPlanLoading && (
              <div className="space-y-2">
                {pendingInstruction && (
                  <div className="flex flex-col gap-1 items-end">
                    <div className="px-4 py-3.5 text-[14px] max-w-[80%] leading-relaxed bg-slate-100 text-slate-700 rounded-md rounded-tr-sm">
                      <span className="text-violet-600 font-semibold">@{agentName.toLowerCase()}</span>{' '}
                      {pendingInstruction}
                    </div>
                  </div>
                )}
                <div className="flex flex-col gap-1 items-start">
                  <div className="flex items-center gap-1.5 mb-0.5 ml-1">
                    <Bot className="w-3 h-3 text-violet-500" />
                    <span className="text-[11px] font-semibold text-violet-600">{agentName}</span>
                  </div>
                  <div className="px-4 py-3 bg-violet-50 border border-violet-200 rounded-md rounded-tl-sm shadow-sm">
                    <div className="flex items-center gap-1.5 text-xs text-violet-500">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      Thinking…
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Running indicator */}
            {isAgentRunning && (
              <div className="space-y-2">
                {pendingInstruction && (
                  <div className="flex flex-col gap-1 items-end">
                    <div className="px-4 py-3.5 text-[14px] max-w-[80%] leading-relaxed bg-slate-100 text-slate-700 rounded-md rounded-tr-sm">
                      <span className="text-violet-600 font-semibold">@{agentName.toLowerCase()}</span>{' '}
                      {pendingInstruction}
                    </div>
                  </div>
                )}
                <div className="flex flex-col gap-1 items-start">
                  <div className="flex items-center gap-1.5 mb-0.5 ml-1">
                    <Bot className="w-3 h-3 text-violet-500" />
                    <span className="text-[11px] font-semibold text-violet-600">{agentName}</span>
                  </div>
                  <div className="px-4 py-3 bg-violet-50 border border-violet-200 rounded-md rounded-tl-sm shadow-sm">
                    <div className="flex items-center gap-1.5 text-xs text-violet-500">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      Working on it…
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          displayMessages.map((msg: { sender: SenderType; text: string | null; time: string }, i: number) => (
            <div key={i} className={`flex flex-col gap-1 ${msg.sender === 'agent' || msg.sender === 'ai' ? 'items-end' : 'items-start'}`}>
              <div className={`px-4 py-3.5 text-[14px] max-w-[80%] leading-relaxed ${
                msg.sender === 'agent' || msg.sender === 'ai'
                  ? 'bg-slate-900 text-white rounded-md rounded-tr-sm shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-800 rounded-md rounded-tl-sm shadow-sm'
              }`}>
                {msg.text}
              </div>
              <span className="text-[10px] text-slate-400 mx-1">{msg.time}</span>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Auto-plan loading banner */}
      {activeTab === 'open' && isAutoPlanLoading && (
        <div className="px-5 py-3 border-t border-violet-100 bg-violet-50/50 flex items-center gap-2 shrink-0">
          <Bot className="w-3.5 h-3.5 text-violet-400 animate-pulse shrink-0" />
          <span className="text-xs text-violet-600 font-medium">{agentName} is analyzing this ticket…</span>
        </div>
      )}

      {/* Composer + floating plan card */}
      {activeTab === 'open' && (
        <div className="relative shrink-0">
          {/* Floating plan card */}
          <AnimatePresence>
            {pendingPlan && !isAutoPlanLoading && viewTab === 'chat' && (
              <motion.div
                className="absolute bottom-full left-0 right-0 px-5 pb-2 pointer-events-none"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6, transition: { duration: 0.18 } }}
                transition={{ duration: 0.22, ease: "easeOut" }}
              >
                <div className="pointer-events-auto">
                  <ActionPlanCard
                    plan={pendingPlan}
                    isExecuting={isPlanExecuting}
                    onApprove={handlePlanApprove}
                    onDismiss={handlePlanDismiss}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <Composer
            customerName={ticket.customer}
            agentName={agentName}
            value={isClerkMode ? clerkInstruction : replyText}
            isNote={viewTab === 'notes' ? false : effectiveIsNote}
            isClerkMode={isClerkMode}
            isNoteMode={isNoteMode}
            hideToggle={true}
            placeholder={viewTab === 'notes' && !isClerkMode ? `Message team… or @${agentName.toLowerCase()} for AI` : undefined}
            isDrafting={isDrafting}
            isSending={isSending || isAgentRunning || isPlanLoading || isAutoPlanLoading}
            error={sendError}
            onChange={text => onReplyChange(isClerkMode ? `@${agentName.toLowerCase()} ` + text : text)}
            onClearClerk={() => onReplyChange('')}
            onSend={handleSend}
            onDraft={onDraft}
            onAddNote={viewTab === 'notes' ? () => setIsNoteMode(true) : undefined}
            onCancelNote={viewTab === 'notes' ? () => setIsNoteMode(false) : undefined}
          />
        </div>
      )}
    </div>
  )
}
