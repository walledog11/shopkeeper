"use client"

import Link from "next/link"
import { AlertCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import AgentAvatar from "@/components/agent/AgentAvatar"
import { AGENT_DISPLAY_NAME } from "@shopkeeper/agent/settings"
import { AgentMessageMarkdown } from "@/components/agent/AgentMessageMarkdown"
import type { WalkthroughItem } from "@/lib/agent/panel"
import { canQuickApprove } from "@/lib/home/walkthrough"
import { useNeedsYouActions } from "@/app/dashboard/_components/home/useNeedsYouActions"
import { buildWalkthroughBriefing } from "./walkthrough-briefing-logic"

// Opening, per-item outcome, and closing lines. Rendered inside the walkthrough
// region rather than pushed into the message stream: they are the state of a
// list, not turns in a conversation, and they must not survive it.
export function WalkthroughNote({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3">
      <AgentAvatar size="md" className="mt-0.5" />
      <div className="min-w-0 max-w-[75%] flex-1">
        <span className="mb-2 block text-xs font-medium text-foreground">{AGENT_DISPLAY_NAME}</span>
        <div className="rounded-2xl rounded-tl-sm border border-border bg-green-600/20 px-4 py-2.5 text-sm text-foreground shadow-sm break-words">
          <AgentMessageMarkdown text={text} />
        </div>
      </div>
    </div>
  )
}

export function WalkthroughCard({
  item,
  position,
  total,
  disabled,
  onApproved,
  onClosed,
  onSkip,
}: {
  item: WalkthroughItem
  position: number
  total: number
  disabled: boolean
  onApproved: () => void
  onClosed: () => void
  onSkip: () => void
}) {
  const actions = useNeedsYouActions(item, { onApproved, onClosed })
  const busy = disabled || actions.pending !== null
  const approvable = canQuickApprove(item)
  const isConsequential = item.kind === "needs_review"

  return (
    <div className="flex items-start gap-3">
      <AgentAvatar size="md" className="mt-0.5" />
      <div className="flex-1 min-w-0 max-w-[75%]">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-medium text-foreground">{AGENT_DISPLAY_NAME}</span>
          <span className="text-xs text-muted-foreground tabular-nums">{position} of {total}</span>
          {item.isVip && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700/70">VIP</span>
          )}
        </div>

        <div className={
          isConsequential || !approvable
            ? "bg-amber-600/[0.07] border border-amber-600/25 text-foreground text-sm rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm"
            : "bg-green-600/20 border border-border text-foreground text-sm rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm"
        }>
          <AgentMessageMarkdown text={buildWalkthroughBriefing(item)} />
        </div>

        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          {item.headline && (
            <>
              <span className="font-medium text-foreground/70 truncate min-w-0">{item.headline}</span>
              <span className="shrink-0 text-foreground/25">·</span>
            </>
          )}
          {item.customerName && (
            <>
              <span className="truncate min-w-0">{item.customerName}</span>
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
          {approvable && (
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={actions.approve}
              className={
                actions.confirming
                  ? "rounded-full bg-amber-600 hover:bg-amber-700 text-foreground"
                  : isConsequential
                    ? "rounded-full bg-green-600 hover:bg-green-700 text-primary-foreground ring-2 ring-amber-500/60 ring-offset-1 ring-offset-background"
                    : "rounded-full bg-green-600 hover:bg-green-700 text-primary-foreground"
              }
            >
              {actions.pending === "approve" && <Loader2 className="size-3.5 animate-spin" />}
              {actions.pending === "approve" ? "Approving" : actions.confirming ? "Confirm approve" : "Approve"}
            </Button>
          )}

          {actions.confirming ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={actions.cancelConfirm}
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
                disabled={busy}
                onClick={onSkip}
                className="rounded-full"
              >
                Skip
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={actions.close}
                className="rounded-full"
              >
                {actions.pending === "close" && <Loader2 className="size-3.5 animate-spin" />}
                Close ticket
              </Button>
              <Button asChild size="sm" variant="ghost" className="rounded-full text-muted-foreground">
                <Link href={`/dashboard/tickets?thread=${item.threadId}`}>Open ticket</Link>
              </Button>
            </>
          )}
        </div>

        {actions.error && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
            <AlertCircle aria-hidden className="size-3 shrink-0" />
            {actions.error}
          </p>
        )}
      </div>
    </div>
  )
}
