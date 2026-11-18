"use client"

import { AlertCircle, Bot, Check, RefreshCw, Smartphone } from "lucide-react"
import { AGENT_DISPLAY_NAME } from "@shopkeeper/agent/settings"
import { TOOL_LABELS } from "@shopkeeper/agent/tools"
import type { AgentTurn } from "@/types"
import type { AgentRequestFailure } from "../../../_hooks/useConversationAgentFlow"

interface Props {
  agentTurns: AgentTurn[]
  isAgentRunning: boolean
  isPlanLoading: boolean
  pendingInstruction: string | null
  planPhrase: string
  requestFailure: AgentRequestFailure | null
  runPhrase: string
}

/** The merchant's own `@agent` instruction, on their side of the timeline. */
function InstructionBubble({ instruction }: { instruction: string }) {
  return (
    <div className="px-4 py-3.5 text-[14px] max-w-[80%] leading-relaxed bg-foreground/[0.08] text-strong rounded-md rounded-tr-sm">
      <span className="text-violet-600 font-semibold">@{AGENT_DISPLAY_NAME.toLowerCase()}</span>{" "}
      {instruction}
    </div>
  )
}

// Not the agent speaking: the request failed before it could answer.
function RequestFailureNotice({ failure }: { failure: AgentRequestFailure }) {
  const { recovery } = failure
  return (
    <div
      role="alert"
      data-testid="agent-request-failure"
      className="flex w-fit max-w-[80%] items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-3.5 py-3"
    >
      <AlertCircle aria-hidden className="mt-px size-4 shrink-0 text-red-600" />
      <div className="min-w-0 text-[13px] leading-snug">
        <p className="font-semibold text-strong">{failure.title}</p>
        <p className="mt-0.5 text-muted-foreground">{failure.detail}</p>
        {recovery ? (
          <button
            type="button"
            onClick={recovery.kind === "retry" ? recovery.run : () => window.location.reload()}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-2.5 py-1 text-xs font-semibold text-strong transition-colors hover:bg-foreground/[0.04]"
          >
            <RefreshCw aria-hidden className="size-3" />
            {recovery.kind === "retry" ? "Try again" : "Reload"}
          </button>
        ) : null}
      </div>
    </div>
  )
}

export default function AgentPrivateTurns({
  agentTurns,
  isAgentRunning,
  isPlanLoading,
  pendingInstruction,
  planPhrase,
  requestFailure,
  runPhrase,
}: Props) {
  return (
    <>
      {agentTurns.map((turn, index) => (
        <div key={turn.id ?? `${turn.instruction}-${index}`} className="space-y-2">
          {/* No instruction means the merchant pressed a button rather than
              typing — there is no message of theirs to echo. */}
          {turn.instruction && (
            <div className="flex flex-col gap-1 items-end">
              {turn.senderPhone && (
                <div className="flex items-center gap-1 text-xs text-faint mr-1">
                  <Smartphone className="size-3" />
                  From your phone
                </div>
              )}
              <InstructionBubble instruction={turn.instruction} />
            </div>
          )}
          <div className="flex flex-col gap-1 items-start">
            <div className="flex items-center gap-1.5 mb-0.5 ml-1">
              <Bot className="size-3 text-violet-600" />
              <span className="text-xs font-semibold text-violet-600">{AGENT_DISPLAY_NAME}</span>
            </div>
            <div className="px-4 py-3 max-w-[80%] bg-violet-500/10 border border-violet-500/20 rounded-md rounded-tl-sm space-y-2">
              {turn.error ? (
                <p className="text-xs text-red-600">{turn.error}</p>
              ) : (
                <>
                  {turn.actions.length > 0 && (
                    <div className="space-y-1">
                      {turn.actions.map((action) => {
                        const isError = action.status === "error"
                          || action.status === "policy_block"
                          || action.status === "unknown"
                        return (
                          <div key={`${action.tool}-${action.result}`} className="flex items-center gap-1.5">
                            {isError
                              ? <AlertCircle className="size-3 text-red-600 shrink-0" />
                              : <Check className="size-3 text-green-600 shrink-0" />
                            }
                            <span className={`text-xs ${isError ? "text-red-600" : "text-faint"}`}>
                              {isError ? action.result : (TOOL_LABELS[action.tool] ?? action.tool)}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {turn.summary && (
                    <p className="text-[14px] text-strong leading-relaxed">{turn.summary}</p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      ))}

      {requestFailure && (
        <div className="space-y-2">
          {requestFailure.instruction && (
            <div className="flex flex-col gap-1 items-end">
              <InstructionBubble instruction={requestFailure.instruction} />
            </div>
          )}
          <RequestFailureNotice failure={requestFailure} />
        </div>
      )}

      {(isPlanLoading || isAgentRunning) && (
        <div className="space-y-2">
          {pendingInstruction && (
            <div className="flex flex-col gap-1 items-end">
              <InstructionBubble instruction={pendingInstruction} />
            </div>
          )}
          <div className="flex flex-col gap-1 items-start">
            <div className="flex items-center gap-1.5 mb-0.5 ml-1">
              <Bot className="size-3 text-violet-600" />
              <span className="text-xs font-semibold text-violet-600">{AGENT_DISPLAY_NAME}</span>
            </div>
            <div className="px-4 py-3 bg-violet-500/10 border border-violet-500/20 rounded-md rounded-tl-sm">
              <div className="flex items-center gap-1.5 text-xs text-violet-600">
                <RefreshCw className="size-3 animate-spin" />
                {isPlanLoading ? planPhrase : runPhrase}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
