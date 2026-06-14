"use client"

import Link from "next/link"
import { useState } from "react"
import { AlertCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import AgentAvatar from "@/app/dashboard/_components/agent-panel/AgentAvatar"
import { AgentMessageMarkdown } from "@/components/agent/AgentMessageMarkdown"
import type { WalkthroughItem } from "@/lib/agent/panel"

function customerLabel(item: WalkthroughItem): string {
  return item.customerName ?? "this customer"
}

function recommendation(item: WalkthroughItem): string {
  return (
    item.replyText?.trim() ||
    item.actionText?.trim() ||
    item.proposalSummary
  )
}

function joinList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ""
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
}

// Opening message in the agent's voice — a templated summary of the set.
export function buildWalkthroughOpening(items: WalkthroughItem[]): string {
  const total = items.length
  const reviewCount = items.filter(item => item.kind === "needs_review").length
  const returnsCount = items.filter(item => item.tag === "Returns").length
  const vipCount = items.filter(item => item.isVip).length

  const parts: string[] = []
  if (reviewCount > 0) parts.push(`${reviewCount} I want your sign-off on`)
  if (returnsCount > 0) parts.push(`${returnsCount} return${returnsCount === 1 ? "" : "s"}`)
  if (vipCount > 0) parts.push(`${vipCount} from repeat customer${vipCount === 1 ? "" : "s"}`)
  const breakdown = parts.length > 0 ? ` — ${joinList(parts)}` : ""

  const lead = total === 1 ? "One ticket needs your call" : `You've got ${total} that need your call`
  return `${lead}${breakdown}. I'll take them one at a time — approve, skip, or ask me anything.`
}

// 1–2 sentence "why I flagged this + recommendation", templated from the item's
// signals so the spine never depends on the LLM.
export function buildWalkthroughBriefing(item: WalkthroughItem): string {
  const who = customerLabel(item)
  const reason =
    item.kind === "needs_review" && item.tag === "Returns"
      ? "This touches a refund or return, so I'd like your sign-off"
      : item.kind === "needs_review"
        ? "I'd rather you sign off before I act on this"
        : item.tag === "Returns"
          ? "This is a return"
          : item.isVip
            ? `${who} is a repeat customer, so I flagged it for a personal eye`
            : "This needs a human eye"

  const vipNote =
    item.isVip && item.kind === "needs_review" ? ` ${who} is also a repeat customer.` : ""

  return `${reason}.${vipNote} My recommendation: ${recommendation(item)}`
}

// Context block prepended to a typed question while an item is on screen, so the
// agent can advise about *this* ticket in plain text — it has no tool to see the
// review queue. Advice only; acting stays the deterministic Approve button.
export function buildWalkthroughContextPrefix(item: WalkthroughItem): string {
  const reason =
    item.kind === "needs_review" && item.tag === "Returns"
      ? "it touches a refund or return and I want your sign-off"
      : item.kind === "needs_review"
        ? "I'd rather sign off with you before acting"
        : item.tag === "Returns"
          ? "it's a return (money-touching)"
          : item.isVip
            ? "it's from a repeat customer"
            : "it needs a human eye"

  const lines = [
    "We're reviewing a support ticket together. Advise on it in plain text — don't take any action on this ticket yourself.",
    `Customer: ${customerLabel(item)}${item.isVip ? " (repeat customer)" : ""}`,
    `Channel: ${item.channelName}`,
  ]
  if (item.orderRef) lines.push(`Order: ${item.orderRef}`)
  if (item.tag) lines.push(`Tag: ${item.tag}`)
  lines.push(`Why I flagged it: ${reason}`)
  if (item.customerMessage) lines.push(`Their message: "${item.customerMessage}"`)
  lines.push(`My drafted response: ${recommendation(item)}`)
  lines.push("")
  lines.push("The merchant asks:")
  return lines.join("\n")
}

export const WALKTHROUGH_CLOSING =
  "That's everything that needed you. I'm here if you want to dig into anything else."

export function walkthroughApprovedLine(item: WalkthroughItem): string {
  return `Done — sent to ${customerLabel(item)}.`
}

export function walkthroughSkippedLine(item: WalkthroughItem): string {
  return `Skipped ${customerLabel(item)} for now.`
}

export type WalkthroughDecision = "approved" | "skipped"

export function resolveWalkthroughDecision({
  item,
  index,
  decision,
}: {
  item: WalkthroughItem
  index: number
  decision: WalkthroughDecision
}): { agentLine: string; nextIndex: number } {
  return {
    agentLine: decision === "approved" ? walkthroughApprovedLine(item) : walkthroughSkippedLine(item),
    nextIndex: index + 1,
  }
}

export function isWalkthroughComplete(items: WalkthroughItem[], index: number): boolean {
  return index >= items.length
}

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
