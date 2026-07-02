"use client"

import { AlertCircle, CheckCircle2, Inbox, Loader2 } from "lucide-react"

export function TicketsErrorState() {
  return (
    <div className="flex size-full items-center justify-center bg-background">
      <div className="text-red-400 text-sm font-medium">Failed to connect to database.</div>
    </div>
  )
}

export function ConversationLoadState({ error, compact = false }: {
  error: unknown
  compact?: boolean
}) {
  return (
    <div
      data-testid={compact ? "inline-ticket-conversation-state" : undefined}
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-background p-6 text-center"
    >
      {error ? (
        <>
          <AlertCircle className="size-5 text-red-500" />
          <div>
            <p className="text-sm font-semibold text-strong">Unable to load conversation</p>
            <p className="mt-1 text-xs text-faint">
              It may have been archived or is no longer available.
            </p>
          </div>
        </>
      ) : compact ? (
        <>
          <Loader2 className="size-5 animate-spin text-faint" />
          <p className="text-sm font-semibold text-muted-foreground">Loading conversation</p>
        </>
      ) : null}
    </div>
  )
}

export function NoConversationSelectedState({
  agentName,
  allCaughtUp,
}: {
  agentName: string
  allCaughtUp: boolean
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-background p-6 text-center">
      <span className="flex size-11 items-center justify-center rounded-full border border-border bg-foreground/[0.04]">
        {allCaughtUp
          ? <CheckCircle2 className="size-5 text-faint" />
          : <Inbox className="size-5 text-faint" />
        }
      </span>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">
          {allCaughtUp ? "You're all caught up" : "Pick a conversation"}
        </h2>
        <p className="max-w-[230px] text-sm text-muted-foreground">
          {allCaughtUp
            ? `${agentName} will flag anything that needs your eye.`
            : "Choose one from the list to jump in."}
        </p>
      </div>
    </div>
  )
}
