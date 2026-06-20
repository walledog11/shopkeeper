"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { AlertCircle, Loader2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import MerchantAnswerForm from "@/components/agent/MerchantAnswerForm"
import type { HomeNeedsAttentionItem } from "@/lib/home/summary-contract"

type BubbleTone = "action" | "reply" | "flag"

const BUBBLE_TONE: Record<BubbleTone, { label: string; bubble: string }> = {
  action: { label: "text-amber-700/70", bubble: "bg-amber-600/[0.09] border-amber-600/20" },
  reply: { label: "text-foreground/35", bubble: "bg-foreground/[0.04] border-border" },
  flag: { label: "text-amber-700/70", bubble: "bg-amber-600/[0.09] border-amber-600/20" },
}

export function StackStrip({ minHeight }: { minHeight?: number }) {
  return (
    <div
      className="h-full w-full rounded-3xl border border-border bg-card shadow-sm pointer-events-none box-border"
      style={minHeight ? { minHeight, maxHeight: minHeight } : undefined}
    />
  )
}

export function NeedsYouCardPeek({
  item,
  agentName,
  minHeight,
}: {
  item: HomeNeedsAttentionItem
  agentName: string
  minHeight?: number
}) {
  const title = item.headline
  const isMerchantInput = item.kind === "needs_merchant_input"
  const previewTone: BubbleTone = isMerchantInput ? "flag" : item.replyText?.trim() ? "reply" : item.actionText?.trim() ? "action" : "flag"
  const previewLabel = isMerchantInput
    ? `${agentName} needs your input`
    : item.replyText?.trim()
      ? `${agentName} responds via ${item.channelName}`
      : item.actionText?.trim()
        ? `${agentName} updates Shopify`
        : `${agentName} flagged this`
  const preview = isMerchantInput
    ? (item.question?.trim() || item.proposalSummary)
    : (item.replyText?.trim() ||
      item.actionText?.trim() ||
      item.proposalSummary)

  return (
    <Card
      className="h-full w-full bg-card border-border rounded-3xl shadow-sm px-5 sm:px-6 py-5 pointer-events-none box-border overflow-hidden"
      style={minHeight ? { minHeight, maxHeight: minHeight } : undefined}
    >
      {item.tag?.trim() && (
        <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/40">
          {item.tag.trim()}
        </span>
      )}
      <h3 className="mt-1 font-sans font-semibold text-xl sm:text-2xl text-foreground leading-tight tracking-tight line-clamp-3">
        {title}
      </h3>

      <NeedsYouCardMeta item={item} />

      {item.customerMessage && (
        <NeedsYouBubble label="Customer" labelClassName="text-foreground/35" bubbleClassName="bg-foreground/[0.04] border-border">
          <p className="text-sm text-foreground/70 leading-relaxed line-clamp-3">{item.customerMessage}</p>
        </NeedsYouBubble>
      )}

      <NeedsYouBubble
        label={previewLabel}
        labelClassName={BUBBLE_TONE[previewTone].label}
        bubbleClassName={BUBBLE_TONE[previewTone].bubble}
      >
        <p className="text-sm font-medium text-foreground/85 leading-relaxed line-clamp-4">{preview}</p>
      </NeedsYouBubble>

      <div className="mt-5 flex flex-col gap-2">
        <div className="h-12 rounded-2xl bg-foreground/[0.08]" />
        <div className="h-12 rounded-2xl bg-foreground/[0.05]" />
      </div>
    </Card>
  )
}

export function NeedsYouCard({ item, agentName, onSent, onAnswered }: { item: HomeNeedsAttentionItem; agentName: string; onSent: () => void; onAnswered: () => void }) {
  const [isApproving, setIsApproving] = useState(false)
  const [approvalError, setApprovalError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  if (item.kind === "needs_merchant_input") {
    return (
      <Card className="bg-card border-border rounded-3xl shadow-sm px-5 sm:px-6 py-5">
        {item.tag?.trim() && (
          <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/40">
            {item.tag.trim()}
          </span>
        )}
        <h3 className="mt-1 font-sans font-semibold text-xl sm:text-2xl text-foreground leading-tight tracking-tight line-clamp-3">
          {item.headline}
        </h3>

        <NeedsYouCardMeta item={item} />

        {item.customerMessage && (
          <NeedsYouBubble label="Customer" labelClassName="text-foreground/35" bubbleClassName="bg-foreground/[0.04] border-border">
            <p className="text-sm text-foreground/70 leading-relaxed line-clamp-3">{item.customerMessage}</p>
          </NeedsYouBubble>
        )}

        <div className="mt-4">
          <MerchantAnswerForm
            threadId={item.threadId}
            question={item.question}
            agentName={agentName}
            onAnswered={onAnswered}
          />
        </div>

        <Link
          href={`/dashboard/tickets?thread=${item.threadId}`}
          className="mt-2 inline-flex items-center justify-center w-full py-3 rounded-2xl text-sm font-semibold bg-foreground/[0.05] hover:bg-foreground/[0.08] text-foreground/60 transition-colors"
        >
          View Ticket
        </Link>
      </Card>
    )
  }

  const isConsequential = item.kind === "needs_review"
  const title = item.headline

  const bubbles: { key: string; label: string; text: string; tone: BubbleTone }[] = []
  if (item.actionText) bubbles.push({ key: "action", label: `${agentName} updates Shopify`, text: item.actionText, tone: "action" })
  if (item.replyText) bubbles.push({ key: "reply", label: `${agentName} responds via ${item.channelName}`, text: item.replyText, tone: "reply" })
  if (bubbles.length === 0) bubbles.push({ key: "flag", label: `${agentName} flagged this`, text: item.proposalSummary, tone: "flag" })

  const approve = async () => {
    if (isApproving) return
    setIsApproving(true)
    setApprovalError(null)

    try {
      const response = await fetch("/api/agent/quick-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: item.threadId }),
      })
      const data = await response.json().catch(() => null) as { error?: string } | null

      if (!response.ok) {
        setApprovalError(data?.error ?? "Could not complete this action.")
        return
      }

      onSent()
    } catch {
      setApprovalError("Network error. Try again.")
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
    approve()
  }

  return (
    <Card className="bg-card border-border rounded-3xl shadow-sm px-5 sm:px-6 py-5">
      {item.tag?.trim() && (
        <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-foreground/40">
          {item.tag.trim()}
        </span>
      )}
      <h3 className="mt-1 font-sans font-semibold text-xl sm:text-2xl text-foreground leading-tight tracking-tight line-clamp-3">
        {title}
      </h3>

      <NeedsYouCardMeta item={item} />

      {item.customerMessage && (
        <NeedsYouBubble label="Customer" labelClassName="text-foreground/35" bubbleClassName="bg-foreground/[0.04] border-border">
          <p className="text-sm text-foreground/70 leading-relaxed line-clamp-3">{item.customerMessage}</p>
        </NeedsYouBubble>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {bubbles.map(bubble => (
          <NeedsYouBubble
            key={bubble.key}
            label={bubble.label}
            labelClassName={BUBBLE_TONE[bubble.tone].label}
            bubbleClassName={BUBBLE_TONE[bubble.tone].bubble}
            flush
          >
            <p className="text-sm font-medium text-foreground/85 leading-relaxed line-clamp-4">{bubble.text}</p>
          </NeedsYouBubble>
        ))}
      </div>

      {approvalError && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-red-600">
          <AlertCircle aria-hidden className="size-3 shrink-0" />
          {approvalError}
        </p>
      )}

      <div className="mt-5 flex flex-col gap-2">
        <button
          type="button"
          onClick={onApproveClick}
          disabled={isApproving}
          className={`inline-flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl text-base font-semibold transition-colors disabled:opacity-40 ${
            confirming
              ? "bg-amber-600 hover:bg-amber-700 text-white"
              : "bg-foreground text-background hover:bg-foreground/90"
          }`}
        >
          {isApproving && <Loader2 aria-hidden className="size-4 animate-spin" />}
          {isApproving ? "Approving" : confirming ? "Confirm approve" : "Approve"}
        </button>

        {confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={isApproving}
            className="inline-flex items-center justify-center w-full py-3.5 rounded-2xl text-base font-semibold bg-foreground/[0.05] hover:bg-foreground/[0.08] text-foreground/60 transition-colors"
          >
            Cancel
          </button>
        ) : (
          <Link
            href={`/dashboard/tickets?thread=${item.threadId}`}
            className="inline-flex items-center justify-center w-full py-3.5 rounded-2xl text-base font-semibold bg-foreground/[0.05] hover:bg-foreground/[0.08] text-foreground/60 transition-colors"
          >
            View Ticket
          </Link>
        )}
      </div>
    </Card>
  )
}

function NeedsYouCardMeta({ item }: { item: HomeNeedsAttentionItem }) {
  return (
    <div className="mt-2 flex items-center gap-1.5 text-sm text-foreground/45">
      {item.customerName && (
        <>
          <span className="font-medium text-foreground/70 truncate min-w-0">{item.customerName}</span>
          <span className="shrink-0 text-foreground/25">{"\u00b7"}</span>
        </>
      )}
      <span className="shrink-0">{item.channelName}</span>
      <span className="shrink-0 text-foreground/25">{"\u00b7"}</span>
      <span className="shrink-0 tabular-nums">{item.timeAgo}</span>
    </div>
  )
}

function NeedsYouBubble({
  label,
  labelClassName,
  bubbleClassName,
  children,
  flush = false,
}: {
  label: string
  labelClassName: string
  bubbleClassName: string
  children: ReactNode
  flush?: boolean
}) {
  return (
    <div className={`${flush ? "" : "mt-4 "}flex flex-col gap-1`}>
      <span className={`self-start text-[11px] font-semibold ${labelClassName}`}>
        {label}
      </span>
      <div className={`rounded-2xl px-4 py-3 border ${bubbleClassName}`}>
        {children}
      </div>
    </div>
  )
}
