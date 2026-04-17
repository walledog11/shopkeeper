"use client"

import { useState, useEffect, useRef } from "react"
import { useFillerPhrase } from "@/hooks/useFillerPhrase"
import { RefObject } from "react"
import { ArrowLeft, CheckCircle2, Users, RotateCcw, MessageSquare, Bot, Check, AlertCircle, RefreshCw, StickyNote, Smartphone, Info, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AnimatePresence, motion } from "motion/react"
import Composer from "./Composer"
import ActionPlanCard from "./ActionPlanCard"
import type { Ticket, SenderType, AgentTurn, AgentPlan, RawToolCall, FailedMessage } from "@/types"
import { TOOL_LABELS } from "@/lib/agent/tools"

interface Props {
  ticket: Ticket
  activeTab: 'open' | 'closed'
  agentName: string
  shopifyCustomerId?: string | null
  customerPlatformId?: string
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
  onOpenContext?: () => void
  failedMessages?: FailedMessage[]
  onRetry?: (id: string) => void
}

export default function ConversationView({
  ticket,
  activeTab,
  agentName,
  shopifyCustomerId,
  customerPlatformId,
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
  onOpenContext,
  failedMessages = [],
  onRetry,
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
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [presenceCount, setPresenceCount] = useState(0)

  const planPhrase = useFillerPhrase([
    'On it…',
    'Reading the room…',
    'Getting up to speed…',
    'Cooking up a plan…',
  ], isPlanLoading)

  const runPhrase = useFillerPhrase([
    'Making it happen…',
    'Doing the thing…',
    'Almost there…',
    'Just a sec…',
    'Finishing touches…',
  ], isAgentRunning)

  // Auto-plan: fire when a ticket is opened and the last chat message is from the customer
  useEffect(() => {
    if (activeTab !== 'open') return
    if (initialPlan) return  // cache hit with valid plan — skip fetch

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

  // Presence tracking: heartbeat PUT every 15s, poll GET every 15s
  useEffect(() => {
    const presenceUrl = `/api/threads/${ticket.id}/presence`
    const heartbeat = () => fetch(presenceUrl, { method: 'PUT' }).catch(() => {})
    const poll = () =>
      fetch(presenceUrl)
        .then(r => r.ok ? r.json() : { count: 0 })
        .then((d: { count: number }) => setPresenceCount(d.count))
        .catch(() => {})

    heartbeat()
    poll()

    const heartbeatTimer = setInterval(heartbeat, 15000)
    const pollTimer = setInterval(poll, 15000)

    return () => {
      clearInterval(heartbeatTimer)
      clearInterval(pollTimer)
      fetch(presenceUrl, { method: 'DELETE' }).catch(() => {})
    }
  }, [ticket.id])

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

  const handlePlanRegenerate = async () => {
    if (!pendingPlan || isRegenerating) return
    setIsRegenerating(true)
    const instruction = pendingPlan.instruction
    try {
      const res = await fetch('/api/agent/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: ticket.id, instruction, force: true }),
      })
      if (!res.ok) throw new Error()
      const plan: AgentPlan = await res.json()
      const resolved = plan.steps.length > 0 ? { ...plan, instruction } : null
      if (resolved) setPendingPlan(resolved)
      onPlanCached(resolved)
    } catch {
      // leave existing plan in place on failure
    } finally {
      setIsRegenerating(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background">

      {/* Header */}
      <div className="h-16 border-b border-border flex items-center justify-between px-3 md:px-6 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden shrink-0 -ml-2 text-white/40 hover:text-white/80 hover:bg-white/[0.06] h-8 w-8"
            onClick={onBack}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div
            className={`min-w-0 ${onOpenContext ? 'cursor-pointer xl:cursor-auto xl:pointer-events-none' : ''}`}
            onClick={onOpenContext}
          >
            <h3 className="text-[15px] font-semibold text-white/80 truncate leading-tight">
              {ticket.customer}
            </h3>
            <p className="text-xs text-white/35 font-medium capitalize">
              via {ticket.platform}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onOpenContext && (
            <Button
              variant="ghost"
              size="icon"
              className="xl:hidden shrink-0 text-white/40 hover:text-white/80 hover:bg-white/[0.06] h-8 w-8"
              onClick={onOpenContext}
            >
              <Info className="w-4 h-4" />
            </Button>
          )}
          {activeTab === 'open' && (
            <Button
              size="sm"
              onClick={onResolve}
              className="bg-white hover:bg-white/90 text-black text-xs font-semibold flex items-center gap-1.5 h-8"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /><span className="hidden sm:inline">Close Ticket</span>
            </Button>
          )}
          {activeTab === 'closed' && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-semibold bg-green-400/10 text-green-400 border-green-400/20 px-2.5 py-1 text-xs">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Closed
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={onReopen}
                className="text-white/50 border-border hover:bg-white/[0.06] hover:text-white/80 text-xs font-semibold flex items-center gap-1.5 h-8"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Reopen
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* View tab bar */}
      <div className="px-4 py-2 border-b border-border bg-background shrink-0">
        <Tabs value={viewTab} onValueChange={(v) => setViewTab(v as 'chat' | 'notes')}>
          <TabsList className="bg-transparent h-auto p-0 gap-1">
            <TabsTrigger
              value="chat"
              className="text-xs font-semibold rounded px-3 py-1.5 gap-1.5 h-auto data-[state=active]:bg-white/[0.10] data-[state=active]:text-white data-[state=active]:shadow-none data-[state=inactive]:text-white/35"
            >
              <MessageSquare className="w-3 h-3" />
              Conversation
            </TabsTrigger>
            <TabsTrigger
              value="notes"
              className="text-xs font-semibold rounded px-3 py-1.5 gap-1.5 h-auto data-[state=active]:bg-violet-500/15 data-[state=active]:text-violet-400 data-[state=active]:shadow-none data-[state=inactive]:text-white/35"
            >
              <Users className="w-3 h-3" />
              Internal
              {noteCount > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  viewTab === 'notes' ? 'bg-violet-500/20 text-violet-400' : 'bg-white/[0.08] text-white/35'
                }`}>
                  {noteCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>


      {/* Presence warning */}
      {presenceCount > 0 && (
        <div className="px-5 py-2 border-b border-amber-400/20 bg-amber-400/[0.04] flex items-center gap-2 shrink-0">
          <Users className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-xs text-amber-400 font-medium">
            {presenceCount === 1 ? 'Another agent is' : `${presenceCount} other agents are`} viewing this ticket
          </span>
        </div>
      )}

      {/* Messages */}
      <div className={`flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4 transition-colors ${
        viewTab === 'notes' ? 'bg-violet-500/[0.02]' : 'bg-background'
      }`}>
        {displayMessages.length === 0 && agentTurns.length === 0 && !isAgentRunning ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3">
            {viewTab === 'notes' ? (
              <>
                <div className="w-10 h-10 rounded-md bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                  <Users className="w-4 h-4 text-violet-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white/50">No internal activity yet</p>
                  <p className="text-xs text-white/30 mt-1">
                    Type <span className="font-mono font-semibold text-violet-400">@{agentName.toLowerCase()}</span> to ask the AI agent, or add a note for your team.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="w-10 h-10 rounded-md bg-white/[0.05] border border-border flex items-center justify-center">
                  <MessageSquare className="w-4 h-4 text-white/20" />
                </div>
                <p className="text-sm text-white/30">No messages yet</p>
              </>
            )}
          </div>
        ) : viewTab === 'notes' ? (
          <>
            {/* DB notes — inline comment style */}
            {displayMessages.map((msg: { sender: SenderType; text: string | null; time: string; author?: string; isAgentNote?: boolean }, i: number) => (
              <div key={i} className="w-full">
                <div className="flex gap-3">
                  {msg.isAgentNote ? (
                    <div className="w-7 h-7 rounded-full bg-violet-500/15 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="w-3.5 h-3.5 text-violet-400" />
                    </div>
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-amber-400/20 flex items-center justify-center shrink-0 mt-0.5 text-[11px] font-bold text-amber-400">
                      {(msg.author ?? 'Y')[0].toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5 mb-1.5">
                      <span className={`text-[12px] font-semibold ${msg.isAgentNote ? 'text-violet-400' : 'text-white/60'}`}>
                        {msg.author ?? 'You'}
                      </span>
                      <span className="text-[11px] text-white/30">added a note</span>
                      <span className="text-[11px] text-white/25 ml-auto">{msg.time}</span>
                    </div>
                    <div className={msg.isAgentNote
                      ? 'bg-violet-500/10 border border-violet-500/20 rounded-lg rounded-tl-sm px-3.5 py-2.5'
                      : 'bg-amber-400/10 border border-amber-400/20 rounded-lg rounded-tl-sm px-3.5 py-2.5'
                    }>
                      <p className="text-[13px] text-white/70 leading-relaxed">{msg.text}</p>
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
                  {turn.senderPhone && (
                    <div className="flex items-center gap-1 text-[10px] text-white/30 mr-1">
                      <Smartphone className="w-3 h-3" />
                      Via SMS · {turn.senderPhone}
                    </div>
                  )}
                  <div className="px-4 py-3.5 text-[14px] max-w-[80%] leading-relaxed bg-white/[0.08] text-white/70 rounded-md rounded-tr-sm">
                    <span className="text-violet-400 font-semibold">@{agentName.toLowerCase()}</span>{' '}
                    {turn.instruction}
                  </div>
                </div>
                {/* Agent response — left aligned */}
                <div className="flex flex-col gap-1 items-start">
                  <div className="flex items-center gap-1.5 mb-0.5 ml-1">
                    <Bot className="w-3 h-3 text-violet-400" />
                    <span className="text-[11px] font-semibold text-violet-400">{agentName}</span>
                  </div>
                  <div className="px-4 py-3 max-w-[80%] bg-violet-500/10 border border-violet-500/20 rounded-md rounded-tl-sm space-y-2">
                    {turn.error ? (
                      <p className="text-xs text-red-400">{turn.error}</p>
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
                                    : <Check className="w-3 h-3 text-green-400 shrink-0" />
                                  }
                                  <span className={`text-xs ${isErr ? 'text-red-400' : 'text-white/40'}`}>
                                    {isErr ? a.result : (TOOL_LABELS[a.tool] ?? a.tool)}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                        {turn.summary && (
                          <p className="text-[14px] text-white/70 leading-relaxed">{turn.summary}</p>
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
                    <div className="px-4 py-3.5 text-[14px] max-w-[80%] leading-relaxed bg-white/[0.08] text-white/70 rounded-md rounded-tr-sm">
                      <span className="text-violet-400 font-semibold">@{agentName.toLowerCase()}</span>{' '}
                      {pendingInstruction}
                    </div>
                  </div>
                )}
                <div className="flex flex-col gap-1 items-start">
                  <div className="flex items-center gap-1.5 mb-0.5 ml-1">
                    <Bot className="w-3 h-3 text-violet-400" />
                    <span className="text-[11px] font-semibold text-violet-400">{agentName}</span>
                  </div>
                  <div className="px-4 py-3 bg-violet-500/10 border border-violet-500/20 rounded-md rounded-tl-sm">
                    <div className="flex items-center gap-1.5 text-xs text-violet-400">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      {planPhrase}
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
                    <div className="px-4 py-3.5 text-[14px] max-w-[80%] leading-relaxed bg-white/[0.08] text-white/70 rounded-md rounded-tr-sm">
                      <span className="text-violet-400 font-semibold">@{agentName.toLowerCase()}</span>{' '}
                      {pendingInstruction}
                    </div>
                  </div>
                )}
                <div className="flex flex-col gap-1 items-start">
                  <div className="flex items-center gap-1.5 mb-0.5 ml-1">
                    <Bot className="w-3 h-3 text-violet-400" />
                    <span className="text-[11px] font-semibold text-violet-400">{agentName}</span>
                  </div>
                  <div className="px-4 py-3 bg-violet-500/10 border border-violet-500/20 rounded-md rounded-tl-sm">
                    <div className="flex items-center gap-1.5 text-xs text-violet-400">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      {runPhrase}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          displayMessages.map((msg: { sender: SenderType; text: string | null; time: string; attachments: string[] }, i: number) => (
            <div key={i} className={`flex flex-col gap-1 ${msg.sender === 'agent' || msg.sender === 'ai' ? 'items-end' : 'items-start'}`}>
              <div className={`px-4 py-3.5 text-[14px] max-w-[80%] leading-relaxed ${
                msg.sender === 'agent' || msg.sender === 'ai'
                  ? 'bg-white/[0.14] text-white rounded-md rounded-tr-sm'
                  : 'bg-white/[0.07] border border-white/[0.10] text-white/75 rounded-md rounded-tl-sm'
              }`}>
                {msg.text}
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {msg.attachments.map((url, j) => (
                      /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url)
                        ? <img key={j} src={url} alt="attachment" className="max-w-[240px] rounded-md border border-white/[0.10]" />
                        : <a key={j} href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 underline">Download attachment</a>
                    ))}
                  </div>
                )}
              </div>
              <span className="text-[10px] text-white/25 mx-1">{msg.time}</span>
            </div>
          ))
        )}
        {/* Failed messages */}
        {viewTab === 'chat' && failedMessages.map(fm => (
          <div key={fm.id} className="flex flex-col gap-1 items-end">
            <div className="px-4 py-3.5 text-[14px] max-w-[80%] leading-relaxed bg-red-500/10 border border-red-500/30 text-white/70 rounded-md rounded-tr-sm">
              {fm.text}
            </div>
            <div className="flex items-center gap-1.5 mx-1">
              <AlertTriangle className="w-3 h-3 text-red-400" />
              <span className="text-[10px] text-red-400">Failed to send</span>
              <span className="text-[10px] text-white/20">·</span>
              <button
                onClick={() => onRetry?.(fm.id)}
                className="text-[10px] font-semibold text-red-400 hover:text-red-300 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Auto-plan loading banner */}
      {activeTab === 'open' && isAutoPlanLoading && (
        <div className="px-5 py-3 border-t border-violet-500/15 bg-violet-500/[0.04] flex items-center gap-2 shrink-0">
          <Bot className="w-3.5 h-3.5 text-violet-400 animate-pulse shrink-0" />
          <span className="text-xs text-violet-400 font-medium">{agentName} is analyzing this ticket…</span>
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
                    isRegenerating={isRegenerating}
                    onApprove={handlePlanApprove}
                    onDismiss={handlePlanDismiss}
                    onRegenerate={handlePlanRegenerate}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <Composer
            customerName={ticket.customer}
            agentName={agentName}
            channelType={ticket.channelType}
            shopifyCustomerId={shopifyCustomerId}
            customerPlatformId={customerPlatformId}
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
