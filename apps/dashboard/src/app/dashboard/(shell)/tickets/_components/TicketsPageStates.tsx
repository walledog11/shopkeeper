"use client"

import { AlertCircle, Inbox, Loader2 } from "lucide-react"
import {
  conversationLoadErrorMessage,
  inboxListErrorMessage,
  type ClientErrorCopy,
} from "@/lib/api/client-error-message"

function ErrorPanel({ copy, onRetry }: { copy: ClientErrorCopy; onRetry?: () => void }) {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-3 bg-background p-6 text-center">
      <AlertCircle className="size-5 text-red-500" />
      <div>
        <p className="text-sm font-semibold text-strong">{copy.title}</p>
        <p className="mt-1 max-w-sm text-xs text-faint">{copy.detail}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 rounded-full border border-border bg-card px-4 py-2 text-xs font-medium text-foreground hover:bg-foreground/[0.04] transition-colors"
        >
          Try again
        </button>
      )}
    </div>
  )
}

export function TicketsErrorState({
  error,
  onRetry,
}: {
  error?: unknown
  onRetry?: () => void
}) {
  const copy = error ? inboxListErrorMessage(error) : {
    title: "Inbox unavailable",
    detail: "Check your connection and refresh the page.",
  }
  return <ErrorPanel copy={copy} onRetry={onRetry} />
}

export function ConversationLoadState({
  error,
  compact = false,
  onRetry,
}: {
  error: unknown
  compact?: boolean
  onRetry?: () => void
}) {
  if (!error) {
    if (!compact) return null
    return (
      <div
        data-testid="inline-ticket-conversation-state"
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-background p-6 text-center"
      >
        <Loader2 className="size-5 animate-spin text-faint" />
        <p className="text-sm font-semibold text-muted-foreground">Loading conversation</p>
      </div>
    )
  }

  const copy = conversationLoadErrorMessage(error)
  return (
    <div
      data-testid={compact ? "inline-ticket-conversation-state" : undefined}
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-background p-6 text-center"
    >
      <AlertCircle className="size-5 text-red-500" />
      <div>
        <p data-testid="conversation-load-error" className="text-sm font-semibold text-strong">{copy.title}</p>
        <p className="mt-1 max-w-sm text-xs text-faint">{copy.detail}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-1 rounded-full border border-border bg-card px-4 py-2 text-xs font-medium text-foreground hover:bg-foreground/[0.04] transition-colors"
        >
          Try again
        </button>
      )}
    </div>
  )
}
