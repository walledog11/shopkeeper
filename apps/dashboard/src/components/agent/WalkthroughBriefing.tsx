"use client"

import Link from "next/link"
import { useState } from "react"
import { AlertCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import AgentAvatar from "@/app/dashboard/_components/agent-panel/AgentAvatar"
import { AgentMessageMarkdown } from "@/components/agent/AgentMessageMarkdown"
import type { WalkthroughItem } from "@/lib/agent/panel"
import { buildWalkthroughBriefing } from "./walkthrough-briefing-logic"

export function WalkthroughCard({
  item,
  agentName,
  position,
  total,
  disabled,
  onApproved,
  onSkip,
}: {
  item: WalkthroughItem
  agentName: string
  position: number
  total: number
  disabled: boolean
  onApproved: () => void
  onSkip: () => void
}) {
  const [isApproving, setIsApproving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const isConsequential = item.kind === "needs_review"

  const approve = async () => {
    if (isApproving) return
    setIsApproving(true)
    setError(null)
    try {
      const response = await fetch("/api/agent/quick-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: item.threadId }),
      })
      const data = await response.json().catch(() => null) as { error?: string } | null
      if (!response.ok) {
        setError(data?.error ?? "Could not complete this action.")
        return
      }
      onApproved()
    } catch {
      setError("Network error. Try again.")
    } finally {
      setIsApproving(false)
      setConfirming(false)
    }
  }

  const onApproveClick = () => {
    if (isConsequential && !confirming) {
      setConfirming(true)
      return
    }
    void approve()
  }

  return (
    <div className="flex items-start gap-3">
      <AgentAvatar agentName={agentName} size="md" className="mt-0.5" />
      <div className="flex-1 min-w-0 max-w-[75%]">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-medium text-foreground">{agentName}</span>
          <span className="text-xs text-muted-foreground tabular-nums">{position} of {total}</span>
          {item.isVip && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700/70">VIP</span>
          )}
        </div>

        <div className={
          isConsequential
            ? "bg-amber-600/[0.07] border border-amber-600/25 text-foreground text-sm rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm"
            : "bg-green-600/20 border border-border text-foreground text-sm rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm"
        }>
          <AgentMessageMarkdown text={buildWalkthroughBriefing(item)} />
        </div>

        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          {item.customerName && (
            <>
              <span className="font-medium text-foreground/70 truncate min-w-0">{item.customerName}</span>
              <span className="shrink-0 text-foreground/25">·</span>
            </>
          )}
          <span className="shrink-0">{item.channelName}</span>
          <span className="shrink-0 text-foreground/25">·</span>
          <span className="shrink-0 tabular-nums">{item.timeAgo}</span>
        </div>

        {item.customerMessage && (
          <p className="mt-2 text-xs text-foreground/55 leading-relaxed line-clamp-2 border-l-2 border-border pl-2.5">
            {item.customerMessage}
          </p>
        )}

        <div className="mt-2.5 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={disabled || isApproving}
            onClick={onApproveClick}
            className={
              confirming
                ? "rounded-full bg-amber-600 hover:bg-amber-700 text-white"
                : isConsequential
                  ? "rounded-full bg-green-600 hover:bg-green-700 text-primary-foreground ring-2 ring-amber-500/60 ring-offset-1 ring-offset-background"
                  : "rounded-full bg-green-600 hover:bg-green-700 text-primary-foreground"
            }
          >
            {isApproving && <Loader2 className="size-3.5 animate-spin" />}
            {isApproving ? "Approving" : confirming ? "Confirm approve" : "Approve"}
          </Button>

          {confirming ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isApproving}
              onClick={() => setConfirming(false)}
              className="rounded-full"
            >
              Cancel
            </Button>
          ) : (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled || isApproving}
                onClick={onSkip}
                className="rounded-full"
              >
                Skip
              </Button>
              <Button asChild size="sm" variant="ghost" className="rounded-full text-muted-foreground">
                <Link href={`/dashboard/tickets?thread=${item.threadId}`}>Open ticket</Link>
              </Button>
            </>
          )}
        </div>

        {error && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
            <AlertCircle aria-hidden className="size-3 shrink-0" />
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
