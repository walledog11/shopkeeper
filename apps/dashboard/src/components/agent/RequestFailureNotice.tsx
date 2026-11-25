"use client"

import { AlertCircle, RefreshCw } from "lucide-react"

/** What fixes a failed request: the same request again, or a fresh session. */
export type RequestFailureRecovery = { kind: "retry"; run: () => void } | { kind: "reload" } | null

// Not the agent speaking: a request the merchant started failed before the
// agent could answer, so this reads as an error, never as a reply.
export function RequestFailureNotice({
  title,
  detail,
  recovery,
}: {
  title: string
  detail: string
  recovery: RequestFailureRecovery
}) {
  return (
    <div
      role="alert"
      data-testid="agent-request-failure"
      className="flex w-fit max-w-[80%] items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-3.5 py-3"
    >
      <AlertCircle aria-hidden className="mt-px size-4 shrink-0 text-red-600" />
      <div className="min-w-0 text-[13px] leading-snug">
        <p className="font-semibold text-strong">{title}</p>
        <p className="mt-0.5 text-muted-foreground">{detail}</p>
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
